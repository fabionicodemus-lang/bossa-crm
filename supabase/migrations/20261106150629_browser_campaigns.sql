-- Transmissões assistidas pelo Chrome/WhatsApp Web. Não dependem da Cloud API.
-- A fila só é alterada pelo servidor e pelas funções transacionais abaixo.
begin;

create table public.browser_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  sender_phone text not null check (sender_phone ~ '^[1-9][0-9]{7,14}$'),
  base_text text not null check (char_length(base_text) between 1 and 4000),
  variants jsonb not null default '[]'::jsonb check (jsonb_typeof(variants) = 'array'),
  media jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 3),
  status text not null default 'draft'
    check (status in ('draft','ready','running','paused','completed','cancelled')),
  recipient_count integer not null default 0,
  consent_confirmed_by uuid references public.profiles(id) on delete set null,
  consent_confirmed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index browser_campaigns_org_created_idx on public.browser_campaigns (organization_id, created_at desc);

create table public.browser_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.browser_campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  lead_name text not null,
  phone text not null check (phone ~ '^[1-9][0-9]{7,14}$'),
  stage text,
  message_text text not null check (char_length(message_text) between 1 and 4000),
  position integer not null,
  status text not null default 'queued'
    check (status in ('queued','claimed','sent','uncertain','skipped')),
  next_item_index integer not null default 0 check (next_item_index >= 0),
  worker_id uuid,
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  finished_at timestamptz,
  detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, phone),
  unique (campaign_id, position)
);

create index browser_campaign_recipients_status_idx
  on public.browser_campaign_recipients (campaign_id, status, position);

create table public.browser_campaign_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.browser_campaigns(id) on delete cascade,
  recipient_id uuid not null references public.browser_campaign_recipients(id) on delete cascade,
  worker_id uuid,
  operator_id uuid references public.profiles(id) on delete set null,
  item_index integer not null,
  result text not null check (result in ('observed','uncertain','skipped','reconciled_sent','reconciled_skipped')),
  detail text,
  created_at timestamptz not null default now(),
  unique (recipient_id, item_index, result)
);

create index browser_campaign_events_campaign_idx on public.browser_campaign_events (campaign_id, created_at desc);

-- Um único trabalhador por número remetente, mesmo entre campanhas diferentes.
create table public.browser_sender_locks (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sender_phone text not null,
  campaign_id uuid references public.browser_campaigns(id) on delete set null,
  recipient_id uuid references public.browser_campaign_recipients(id) on delete set null,
  worker_id uuid,
  operator_id uuid references public.profiles(id) on delete set null,
  heartbeat_at timestamptz,
  requires_review boolean not null default false,
  primary key (organization_id, sender_phone)
);

alter table public.browser_campaigns enable row level security;
alter table public.browser_campaign_recipients enable row level security;
alter table public.browser_campaign_events enable row level security;
alter table public.browser_sender_locks enable row level security;

create policy browser_campaigns_read on public.browser_campaigns
  for select to authenticated using (private.is_org_member(organization_id));
create policy browser_recipients_read on public.browser_campaign_recipients
  for select to authenticated using (private.is_org_member(organization_id));
create policy browser_events_read on public.browser_campaign_events
  for select to authenticated using (private.is_org_member(organization_id));
-- Sem concessões de escrita: alterações passam por API autenticada ou RPC verificadas.
-- Supabase pode conceder privilégios padrão no schema public a anon/authenticated.
-- Removê-los explicitamente; RLS sozinho não substitui REVOKE.
revoke all on public.browser_campaigns, public.browser_campaign_recipients,
  public.browser_campaign_events, public.browser_sender_locks from public, anon, authenticated;
grant select on public.browser_campaigns, public.browser_campaign_recipients,
  public.browser_campaign_events to authenticated;

create trigger browser_campaigns_updated_at before update on public.browser_campaigns
  for each row execute procedure public.set_updated_at();
create trigger browser_campaign_recipients_updated_at before update on public.browser_campaign_recipients
  for each row execute procedure public.set_updated_at();

-- Retorna somente o próximo destinatário elegível. O lock da linha do remetente
-- serializa computadores; SKIP LOCKED impede dupla reserva.
create function public.browser_campaign_claim(p_campaign_id uuid, p_worker_id uuid)
returns table (
  recipient_id uuid, lead_name text, phone text, message_text text,
  next_item_index integer, item_count integer, media jsonb
)
language plpgsql security definer set search_path = '' as $$
declare
  v_campaign public.browser_campaigns%rowtype;
  v_lock public.browser_sender_locks%rowtype;
  v_recipient public.browser_campaign_recipients%rowtype;
begin
  if auth.uid() is null or p_worker_id is null then
    raise exception 'Sessão ou identificador de trabalho inválido';
  end if;
  select * into v_campaign from public.browser_campaigns
    where id = p_campaign_id;
  if not found or not private.can_edit_org(v_campaign.organization_id) then
    raise exception 'Campanha não encontrada ou acesso negado';
  end if;
  if v_campaign.status <> 'running' then return; end if;

  insert into public.browser_sender_locks (organization_id, sender_phone)
    values (v_campaign.organization_id, v_campaign.sender_phone)
    on conflict do nothing;
  select * into v_lock from public.browser_sender_locks
    where organization_id = v_campaign.organization_id and sender_phone = v_campaign.sender_phone
    for update;

  if v_lock.requires_review then return; end if;
  if v_lock.recipient_id is not null then
    if v_lock.heartbeat_at >= now() - interval '3 minutes' then
      return;
    end if;
    -- Um navegador caiu ou perdeu o sinal: envio incerto, nunca reencaminhar sozinho.
    update public.browser_campaign_recipients
      set status = 'uncertain', detail = 'Sessão interrompida; verificar manualmente no WhatsApp.', finished_at = now()
      where id = v_lock.recipient_id and status = 'claimed';
    update public.browser_sender_locks
      set campaign_id = null, recipient_id = null, worker_id = null,
          operator_id = null, heartbeat_at = null, requires_review = true
      where organization_id = v_campaign.organization_id and sender_phone = v_campaign.sender_phone;
    -- Até a equipe verificar que o computador anterior parou, ninguém assume
    -- este número. Uma aba antiga ainda pode voltar a executar um clique.
    return;
  end if;

  loop
    select * into v_recipient from public.browser_campaign_recipients r
      where r.campaign_id = p_campaign_id and r.status = 'queued'
      order by r.position limit 1 for update skip locked;
    if not found then
      if not exists (select 1 from public.browser_campaign_recipients
          where campaign_id = p_campaign_id and status in ('queued','claimed','uncertain')) then
        update public.browser_campaigns set status = 'completed', completed_at = now()
          where id = p_campaign_id and status = 'running';
      end if;
      return;
    end if;
    -- O contato pode ter pedido exclusão depois de aprovado o rascunho.
    -- Uma reclassificação ou pausa também invalida sua reserva.
    if not exists (
      select 1 from public.leads l where l.id = v_recipient.lead_id
        and l.organization_id = v_campaign.organization_id and l.kind = 'corretor'
        and l.archived_at is null and l.opt_out = false and l.automation_paused = false
    ) or exists (
      select 1 from public.leads l where l.organization_id = v_campaign.organization_id
        and l.archived_at is null and (l.opt_out = true or l.automation_paused = true)
        and regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g') = v_recipient.phone
    ) then
      update public.browser_campaign_recipients set status = 'skipped', finished_at = now(),
        detail = 'Contato pausado, excluído ou reclassificado no CRM antes do envio.'
        where id = v_recipient.id;
      insert into public.browser_campaign_events
        (organization_id,campaign_id,recipient_id,worker_id,operator_id,item_index,result,detail)
        values (v_campaign.organization_id,p_campaign_id,v_recipient.id,p_worker_id,auth.uid(),0,'skipped',
          'Elegibilidade alterada após a aprovação.');
    else
      exit;
    end if;
  end loop;

  update public.browser_campaign_recipients
    set status = 'claimed', worker_id = p_worker_id, claimed_by = auth.uid(), claimed_at = now()
    where id = v_recipient.id;
  update public.browser_sender_locks
    set campaign_id = p_campaign_id, recipient_id = v_recipient.id,
        worker_id = p_worker_id, operator_id = auth.uid(), heartbeat_at = now(), requires_review = false
    where organization_id = v_campaign.organization_id and sender_phone = v_campaign.sender_phone;

  return query select v_recipient.id, v_recipient.lead_name, v_recipient.phone,
    v_recipient.message_text, v_recipient.next_item_index,
    1 + jsonb_array_length(v_campaign.media), v_campaign.media;
end;
$$;

-- Somente após o operador conferir que o Chrome anterior encerrou sua sessão.
-- Nunca libera uma sessão ativa por engano.
create function public.browser_campaign_release_sender(p_campaign_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_campaign public.browser_campaigns%rowtype;
begin
  select * into v_campaign from public.browser_campaigns where id = p_campaign_id;
  if auth.uid() is null or not found or not coalesce(private.can_edit_org(v_campaign.organization_id), false) then
    raise exception 'Acesso negado';
  end if;
  update public.browser_sender_locks set requires_review = false
    where organization_id = v_campaign.organization_id and sender_phone = v_campaign.sender_phone
      and requires_review = true and recipient_id is null;
  return found;
end;
$$;

create function public.browser_campaign_heartbeat(p_campaign_id uuid, p_worker_id uuid, p_recipient_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_phone text;
begin
  select organization_id, sender_phone into v_org, v_phone from public.browser_campaigns
    where id = p_campaign_id;
  if auth.uid() is null or not coalesce(private.can_edit_org(v_org), false) then return false; end if;
  update public.browser_sender_locks set heartbeat_at = now()
    where organization_id = v_org and sender_phone = v_phone
      and campaign_id = p_campaign_id and worker_id = p_worker_id
      and recipient_id = p_recipient_id and operator_id = auth.uid();
  return found;
end;
$$;

create function public.browser_campaign_ack(
  p_campaign_id uuid, p_worker_id uuid, p_recipient_id uuid,
  p_item_index integer, p_result text, p_detail text default null
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_campaign public.browser_campaigns%rowtype;
  v_lock public.browser_sender_locks%rowtype;
  v_recipient public.browser_campaign_recipients%rowtype;
  v_final text;
begin
  select * into v_campaign from public.browser_campaigns where id = p_campaign_id;
  if auth.uid() is null or not found or not coalesce(private.can_edit_org(v_campaign.organization_id), false) then
    raise exception 'Acesso negado';
  end if;
  if p_result not in ('observed','uncertain','skipped') then raise exception 'Resultado inválido'; end if;

  select * into v_lock from public.browser_sender_locks
    where organization_id = v_campaign.organization_id and sender_phone = v_campaign.sender_phone for update;
  if v_lock.recipient_id is distinct from p_recipient_id
    or v_lock.worker_id is distinct from p_worker_id
    or v_lock.operator_id is distinct from auth.uid() or v_lock.campaign_id is distinct from p_campaign_id then
    raise exception 'Esta sessão não é dona do destinatário';
  end if;
  select * into v_recipient from public.browser_campaign_recipients
    where id = p_recipient_id and campaign_id = p_campaign_id for update;
  if v_recipient.status <> 'claimed' or v_recipient.next_item_index <> p_item_index then
    raise exception 'Posição de envio inválida';
  end if;

  insert into public.browser_campaign_events
    (organization_id,campaign_id,recipient_id,worker_id,operator_id,item_index,result,detail)
    values (v_campaign.organization_id,p_campaign_id,p_recipient_id,p_worker_id,auth.uid(),p_item_index,p_result,left(p_detail,500));

  if p_result = 'observed' then
    v_final := case when p_item_index + 1 >= 1 + jsonb_array_length(v_campaign.media)
      then 'sent' else 'claimed' end;
    update public.browser_campaign_recipients set next_item_index = p_item_index + 1,
      status = v_final, finished_at = case when v_final = 'sent' then now() else null end
      where id = p_recipient_id;
  else
    v_final := case when p_result = 'skipped' then 'skipped' else 'uncertain' end;
    update public.browser_campaign_recipients set status = v_final,
      finished_at = now(), detail = left(p_detail,500) where id = p_recipient_id;
  end if;

  if v_final <> 'claimed' then
    update public.browser_sender_locks
      set campaign_id = null, recipient_id = null, worker_id = null,
          operator_id = null, heartbeat_at = null
      where organization_id = v_campaign.organization_id and sender_phone = v_campaign.sender_phone;
    if not exists (select 1 from public.browser_campaign_recipients
        where campaign_id = p_campaign_id and status in ('queued','claimed','uncertain')) then
      update public.browser_campaigns set status = 'completed', completed_at = now()
        where id = p_campaign_id and status in ('running','paused');
    end if;
  end if;
  return v_final;
end;
$$;

revoke all on function public.browser_campaign_claim(uuid,uuid) from public;
revoke all on function public.browser_campaign_claim(uuid,uuid) from anon, authenticated;
revoke all on function public.browser_campaign_release_sender(uuid) from public;
revoke all on function public.browser_campaign_release_sender(uuid) from anon, authenticated;
revoke all on function public.browser_campaign_heartbeat(uuid,uuid,uuid) from public;
revoke all on function public.browser_campaign_heartbeat(uuid,uuid,uuid) from anon, authenticated;
revoke all on function public.browser_campaign_ack(uuid,uuid,uuid,integer,text,text) from public;
revoke all on function public.browser_campaign_ack(uuid,uuid,uuid,integer,text,text) from anon, authenticated;
grant execute on function public.browser_campaign_claim(uuid,uuid),
  public.browser_campaign_release_sender(uuid),
  public.browser_campaign_heartbeat(uuid,uuid,uuid),
  public.browser_campaign_ack(uuid,uuid,uuid,integer,text,text) to authenticated;

commit;
