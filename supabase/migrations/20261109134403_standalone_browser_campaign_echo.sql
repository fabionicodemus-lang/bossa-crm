-- Uma única instrução por campanha; ecos da integração WhatsApp Business
-- confirmam o envio, sem que o ChatGPT precise registrar itens no CRM.
begin;

create table public.browser_campaign_standalone_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null unique references public.browser_campaigns(id) on delete cascade,
  sender_phone text not null,
  channel_id uuid not null references public.whatsapp_channels(id) on delete restrict,
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  status text not null default 'active' check (status in ('active','completed','requires_review')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_observed_at timestamptz,
  completed_at timestamptz
);
create unique index browser_campaign_standalone_sender_active_idx
  on public.browser_campaign_standalone_runs(organization_id,sender_phone)
  where status = 'active';
create unique index browser_campaign_standalone_channel_active_idx
  on public.browser_campaign_standalone_runs(organization_id,channel_id)
  where status = 'active';
create index browser_campaign_standalone_channel_idx
  on public.browser_campaign_standalone_runs(channel_id,status);

create table public.browser_campaign_echo_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.browser_campaign_standalone_runs(id) on delete cascade,
  campaign_id uuid not null references public.browser_campaigns(id) on delete cascade,
  recipient_id uuid not null references public.browser_campaign_recipients(id) on delete cascade,
  item_index integer not null check (item_index between 0 and 3),
  wamid text not null unique,
  sent_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(recipient_id,item_index)
);
create index browser_campaign_echo_receipts_run_idx
  on public.browser_campaign_echo_receipts(run_id,created_at);

alter table public.browser_campaign_standalone_runs enable row level security;
alter table public.browser_campaign_echo_receipts enable row level security;
create policy browser_standalone_runs_read on public.browser_campaign_standalone_runs
  for select to authenticated using (private.is_org_member(organization_id));
create policy browser_echo_receipts_read on public.browser_campaign_echo_receipts
  for select to authenticated using (private.is_org_member(organization_id));
revoke all on public.browser_campaign_standalone_runs,public.browser_campaign_echo_receipts
  from public,anon,authenticated;
grant select on public.browser_campaign_standalone_runs,public.browser_campaign_echo_receipts
  to authenticated;
grant all on public.browser_campaign_standalone_runs,public.browser_campaign_echo_receipts
  to service_role;

-- Identidades brasileiras de oito/nove dígitos: somente a variante validada.
create function private.browser_campaign_same_phone(p_left text,p_right text)
returns boolean language sql immutable set search_path = '' as $$
  select p_left = p_right or (
    left(p_left,2) = '55' and left(p_right,2) = '55'
    and substr(p_left,3,2) = substr(p_right,3,2)
    and (
      (length(p_left) = 13 and substr(p_left,5,1) = '9'
        and substr(p_left,6) = substr(p_right,5) and length(p_right) = 12
        and substr(p_right,5,1) between '6' and '9')
      or
      (length(p_right) = 13 and substr(p_right,5,1) = '9'
        and substr(p_right,6) = substr(p_left,5) and length(p_left) = 12
        and substr(p_left,5,1) between '6' and '9')
    )
  );
$$;
revoke all on function private.browser_campaign_same_phone(text,text) from public,anon,authenticated;
grant execute on function private.browser_campaign_same_phone(text,text) to service_role;

-- O mesmo lock do fluxo antigo serializa a preparação do manifesto.
create function public.browser_campaign_prepare_standalone(p_campaign_id uuid,p_channel_id uuid)
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

  -- Revalida elegibilidade, tal como a fila original, antes de exportar.
  update public.browser_campaign_recipients r
    set status='skipped',finished_at=now(),detail='Contato excluído, sem autorização ou reclassificado antes da exportação.'
    where r.campaign_id=p_campaign_id and r.status='queued' and (
      not exists(select 1 from public.leads l where l.id=r.lead_id
        and l.organization_id=v_campaign.organization_id and l.kind='corretor'
        and l.archived_at is null and l.opt_out=false)
      or exists(select 1 from public.leads l where l.organization_id=v_campaign.organization_id
        and l.archived_at is null and l.opt_out=true
        and private.browser_campaign_same_phone(regexp_replace(coalesce(l.phone,''),'[^0-9]','','g'),r.phone))
    );
  if exists(select 1 from public.browser_campaign_recipients a
    join public.browser_campaign_recipients b on b.campaign_id=a.campaign_id and b.id<>a.id
      and a.position<b.position and b.status='queued'
    where a.campaign_id=p_campaign_id and a.status='queued'
      and private.browser_campaign_same_phone(a.phone,b.phone)) then
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
revoke all on function public.browser_campaign_prepare_standalone(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.browser_campaign_prepare_standalone(uuid,uuid) to authenticated;

-- Proíbe a fila antiga de reservar um contato após criar o manifesto único.
create function private.browser_campaign_guard_legacy_claim()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status='claimed' and old.status<>'claimed' and exists(
    select 1 from public.browser_campaign_standalone_runs r
    join public.browser_campaigns c on c.id = new.campaign_id
    where r.organization_id = c.organization_id and r.status='active'
      and r.sender_phone=c.sender_phone
  ) then raise exception 'O remetente já está sob execução única do ChatGPT'; end if;
  return new;
end;
$$;
create trigger browser_campaign_guard_legacy_claim
  before update of status on public.browser_campaign_recipients
  for each row execute function private.browser_campaign_guard_legacy_claim();

-- Recebe somente uma mensagem já persistida por webhook Meta autenticado.
-- A função é invocável apenas por service_role, nunca pelo navegador.
create function public.browser_campaign_record_echo(p_message_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_msg public.whatsapp_messages%rowtype;
  v_run public.browser_campaign_standalone_runs%rowtype;
  v_recipient public.browser_campaign_recipients%rowtype;
  v_payload jsonb;
  v_phone text;
  v_text text;
  v_hash text;
  v_item integer;
  v_count integer;
  v_expected integer;
  v_inserted uuid;
begin
  select * into v_msg from public.whatsapp_messages where id=p_message_id;
  if not found or v_msg.direction<>'out' or v_msg.payload->>'source'<>'whatsapp_business_app'
    or v_msg.type not in ('text','document') or coalesce(v_msg.wamid,'')='' or v_msg.sent_at is null then return false; end if;
  select * into v_run from public.browser_campaign_standalone_runs r
    where r.organization_id=v_msg.organization_id and r.channel_id=v_msg.channel_id
      and r.status='active' and r.created_at<=v_msg.sent_at
    for update;
  if not found then return false; end if;

  v_payload := v_msg.payload->'message_echo';
  v_phone := regexp_replace(coalesce(v_payload->>'to',''),'[^0-9]','','g');
  if v_phone='' then return false; end if;
  if v_msg.type='text' then v_text:=v_payload->'text'->>'body'; end if;
  if v_msg.type='document' then
    if coalesce(v_payload->'document'->>'sha256','') !~ '^[a-zA-Z0-9+/]{43}=$'
      then return false; end if;
    v_hash:=encode(decode(v_payload->'document'->>'sha256','base64'),'hex');
  end if;

  -- Não adivinhar o contato em caso de variantes telefônicas ambíguas.
  select count(*) into v_count from public.browser_campaign_recipients r
    where r.campaign_id=v_run.campaign_id and r.status in ('queued','claimed')
      and private.browser_campaign_same_phone(r.phone,v_phone);
  if v_count<>1 then return false; end if;
  select * into v_recipient from public.browser_campaign_recipients r
    where r.campaign_id=v_run.campaign_id and r.status in ('queued','claimed')
      and private.browser_campaign_same_phone(r.phone,v_phone);

  if v_msg.type='text' then
    if v_text is distinct from v_recipient.message_text then return false; end if;
    v_item:=0;
  else
    select ord::integer into v_item
      from jsonb_array_elements(v_run.manifest->'media') with ordinality as files(file,ord)
      where file->>'sha256'=v_hash
        and not exists(select 1 from public.browser_campaign_echo_receipts e
          where e.recipient_id=v_recipient.id and e.item_index=ord::integer)
      order by ord limit 1;
    if v_item is null then return false; end if;
  end if;

  insert into public.browser_campaign_echo_receipts
    (organization_id,run_id,campaign_id,recipient_id,item_index,wamid,sent_at)
    values(v_run.organization_id,v_run.id,v_run.campaign_id,v_recipient.id,
      v_item,v_msg.wamid,v_msg.sent_at)
    on conflict do nothing returning id into v_inserted;
  if v_inserted is null then return false; end if;

  insert into public.browser_campaign_events
    (organization_id,campaign_id,recipient_id,worker_id,operator_id,item_index,result,detail)
    values(v_run.organization_id,v_run.campaign_id,v_recipient.id,v_run.id,
      v_run.created_by,v_item,'observed','Eco independente do WhatsApp Business confirmado')
    on conflict do nothing;
  select count(*) into v_count from public.browser_campaign_echo_receipts e
    where e.recipient_id=v_recipient.id and e.run_id=v_run.id;
  v_expected:=1+jsonb_array_length(v_run.manifest->'media');
  update public.browser_campaign_recipients
    set next_item_index=v_count,
      status=case when v_count>=v_expected then 'sent' else 'queued' end,
      finished_at=case when v_count>=v_expected then now() else null end,
      detail=case when v_count>=v_expected then 'Texto e anexos confirmados pelo WhatsApp Business.'
        else v_count||' de '||v_expected||' itens confirmados pelo WhatsApp Business.' end
    where id=v_recipient.id;
  update public.browser_campaign_standalone_runs
    set last_observed_at=now() where id=v_run.id;

  if not exists(select 1 from public.browser_campaign_recipients
    where campaign_id=v_run.campaign_id and status not in ('sent','skipped')) then
    update public.browser_campaign_standalone_runs
      set status='completed',completed_at=now() where id=v_run.id;
    update public.browser_campaigns
      set status='completed',completed_at=now() where id=v_run.campaign_id;
  end if;
  return true;
end;
$$;
revoke all on function public.browser_campaign_record_echo(uuid) from public,anon,authenticated;
grant execute on function public.browser_campaign_record_echo(uuid) to service_role;

-- Depois de interromper o ChatGPT, o operador pode encerrar a execução.
-- Pendências não são liberadas para um novo disparo sem revisão manual.
create function public.browser_campaign_stop_standalone(p_campaign_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_campaign public.browser_campaigns%rowtype;
  v_run public.browser_campaign_standalone_runs%rowtype;
begin
  if auth.uid() is null then raise exception 'Sessão necessária'; end if;
  select * into v_campaign from public.browser_campaigns
    where id=p_campaign_id;
  if not found or not private.can_edit_org(v_campaign.organization_id) then
    raise exception 'Campanha não encontrada ou acesso negado';
  end if;
  select * into v_run from public.browser_campaign_standalone_runs
    where campaign_id=p_campaign_id for update;
  if not found or v_run.status<>'active' then return false; end if;
  -- Ordem igual à do reconciliador: lock da execução antes da campanha.
  select * into v_campaign from public.browser_campaigns
    where id=p_campaign_id for update;
  update public.browser_campaign_standalone_runs set status='requires_review'
    where id=v_run.id;
  update public.browser_campaign_recipients
    set status='uncertain',finished_at=now(),
      detail='Execução encerrada pelo operador; verificar WhatsApp antes de qualquer novo envio.'
    where campaign_id=p_campaign_id and status='queued';
  update public.browser_campaigns set status='paused' where id=p_campaign_id;
  update public.browser_sender_locks
    set requires_review=true, campaign_id=null,recipient_id=null,
      worker_id=null,operator_id=null,heartbeat_at=null
    where organization_id=v_campaign.organization_id and sender_phone=v_campaign.sender_phone;
  return true;
end;
$$;
revoke all on function public.browser_campaign_stop_standalone(uuid) from public,anon,authenticated;
grant execute on function public.browser_campaign_stop_standalone(uuid) to authenticated;

commit;
