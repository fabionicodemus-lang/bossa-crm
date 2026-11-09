begin;
set local lock_timeout = '3s';

-- Equality key preserves the existing Brazilian mobile 8/9-digit equivalence.
-- Compute once per row instead of calling same_phone for every pair.
create or replace function private.browser_campaign_phone_key(p_phone text)
returns text language sql immutable strict parallel safe set search_path = '' as $$
  select case
    when length(p_phone)=12 and left(p_phone,2)='55'
      and substr(p_phone,5,1) between '6' and '9'
    then left(p_phone,4)||'9'||substr(p_phone,5)
    else p_phone
  end;
$$;
revoke all on function private.browser_campaign_phone_key(text) from public,anon,authenticated;
grant execute on function private.browser_campaign_phone_key(text) to service_role;

-- In-migration equivalence check: fail atomically if phone matching changes.
do $$
begin
  if exists (
    with samples(phone) as (values
      ('5547999990001'),('554799990001'),('5547999990002'),
      ('5547988880001'),('554788880001'),('5547966660001'),('554766660001'),
      ('5547955550001'),('554755550001'),('554733334444'),('5547933334444'),
      ('5511999990001'),('551199990001'),('14155550135'),(''),(null)
    )
    select 1 from samples a cross join samples b
    where private.browser_campaign_same_phone(a.phone,b.phone)
      is distinct from (private.browser_campaign_phone_key(a.phone)=private.browser_campaign_phone_key(b.phone))
  ) then raise exception 'Phone-key equivalence regression'; end if;
end;
$$;

create or replace function public.browser_campaign_prepare_standalone(p_campaign_id uuid,p_channel_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_campaign public.browser_campaigns%rowtype;
  v_lock public.browser_sender_locks%rowtype;
  v_channel public.whatsapp_channels%rowtype;
  v_existing public.browser_campaign_standalone_runs%rowtype;
  v_rows jsonb;
  v_run public.browser_campaign_standalone_runs%rowtype;
begin
  if auth.uid() is null then raise exception 'Sessão necessária'; end if;
  select * into v_campaign from public.browser_campaigns
    where id=p_campaign_id for update;
  if not found or not private.can_edit_org(v_campaign.organization_id) then
    raise exception 'Campanha não encontrada ou acesso negado';
  end if;
  if v_campaign.status <> 'running' or v_campaign.consent_confirmed_at is null then
    raise exception 'A campanha precisa estar liberada e autorizada';
  end if;
  select * into v_channel from public.whatsapp_channels
    where id=p_channel_id and organization_id=v_campaign.organization_id
      and status='connected';
  if not found or not private.browser_campaign_same_phone(
    regexp_replace(coalesce(v_channel.display_phone_number,''),'[^0-9]','','g'),v_campaign.sender_phone
  ) then raise exception 'Número selecionado não possui integração ativa para acompanhar os envios'; end if;

  insert into public.browser_sender_locks(organization_id,sender_phone)
    values(v_campaign.organization_id,v_campaign.sender_phone) on conflict do nothing;
  select * into v_lock from public.browser_sender_locks
    where organization_id=v_campaign.organization_id and sender_phone=v_campaign.sender_phone for update;
  if v_lock.requires_review or v_lock.recipient_id is not null then
    raise exception 'Uma sessão anterior desse remetente exige conferência';
  end if;

  select * into v_existing from public.browser_campaign_standalone_runs
    where campaign_id=p_campaign_id;
  if found then
    return jsonb_build_object('runId',v_existing.id,'manifest',v_existing.manifest,
      'status',v_existing.status,'createdAt',v_existing.created_at);
  end if;
  if exists(select 1 from public.browser_campaign_standalone_runs r
    where r.organization_id=v_campaign.organization_id and r.status='active'
      and (r.channel_id=p_channel_id or r.sender_phone=v_campaign.sender_phone)) then
    raise exception 'Já existe uma transmissão ativa nesse número';
  end if;
  if exists(select 1 from public.browser_campaign_recipients r
    where r.campaign_id=p_campaign_id and r.status not in ('queued','skipped')) then
    raise exception 'Há envios iniciados ou pendências nessa campanha; não crie outra instrução';
  end if;

  -- Materialize opt-outs once. The old correlated check scanned the same
  -- organization's leads once per recipient (millions of repeated reads).
  with blocked as materialized (
    select distinct private.browser_campaign_phone_key(
      regexp_replace(coalesce(l.phone,''),'[^0-9]','','g')) as phone_key
    from public.leads l
    where l.organization_id=v_campaign.organization_id
      and l.archived_at is null and l.opt_out=true
  ), pending as materialized (
    select r.id,r.lead_id,private.browser_campaign_phone_key(r.phone) as phone_key
    from public.browser_campaign_recipients r
    where r.campaign_id=p_campaign_id and r.status='queued'
  ), invalid as (
    select p.id from pending p
    left join public.leads l on l.id=p.lead_id
      and l.organization_id=v_campaign.organization_id and l.kind='corretor'
      and l.archived_at is null and l.opt_out=false
    left join blocked b on b.phone_key=p.phone_key
    where l.id is null or b.phone_key is not null
  )
  update public.browser_campaign_recipients r
    set status='skipped',finished_at=now(),detail='Contato excluído, sem autorização ou reclassificado antes da exportação.'
    from invalid i where r.id=i.id and r.campaign_id=p_campaign_id and r.status='queued';

  -- 1,150 contacts previously meant 660,675 function calls (>13 s).
  -- Group by canonical identity once per contact; no quadratic self-join.
  if exists (
    select 1 from public.browser_campaign_recipients r
    where r.campaign_id=p_campaign_id and r.status='queued'
    group by private.browser_campaign_phone_key(r.phone)
    having count(*)>1
  ) then
    raise exception 'Há dois cadastros para o mesmo WhatsApp; revise a campanha';
  end if;
  select jsonb_agg(jsonb_build_object('name',r.lead_name,'phone',r.phone,
    'text',r.message_text,'position',r.position) order by r.position)
    into v_rows from public.browser_campaign_recipients r
    where r.campaign_id=p_campaign_id and r.status='queued';
  if v_rows is null then raise exception 'Nenhum corretor pendente e elegível para envio'; end if;

  insert into public.browser_campaign_standalone_runs
    (organization_id,campaign_id,sender_phone,channel_id,manifest,created_by)
    values(v_campaign.organization_id,p_campaign_id,v_campaign.sender_phone,p_channel_id,
      jsonb_build_object('campaignId',p_campaign_id,'senderPhone',v_campaign.sender_phone,
        'recipients',v_rows,'media',v_campaign.media),auth.uid())
    returning * into v_run;
  return jsonb_build_object('runId',v_run.id,'manifest',v_run.manifest,
    'status',v_run.status,'createdAt',v_run.created_at);
end;
$$;
revoke all on function public.browser_campaign_prepare_standalone(uuid,uuid) from public,anon;
grant execute on function public.browser_campaign_prepare_standalone(uuid,uuid) to authenticated;
commit;
