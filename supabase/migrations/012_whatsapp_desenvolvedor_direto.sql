-- BOSSA CRM — WhatsApp Cloud API como Desenvolvedor Direto
-- Execute DEPOIS de 011_modelos_meta.sql.
--
-- Esta migração é não destrutiva:
-- - mantém whatsapp_connections e messages para compatibilidade;
-- - cria a camada canônica de canais, conversas, mensagens e eventos;
-- - copia os dados existentes sem apagar o histórico;
-- - pode ser executada novamente com segurança.

begin;

create table if not exists public.whatsapp_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 2 and 120),
  role text not null check (role in ('cliente', 'corretor')),
  provider text not null default 'meta_cloud' check (char_length(trim(provider)) > 0),
  business_id text,
  waba_id text not null,
  phone_number_id text not null,
  display_phone_number text,
  verified_name text,
  quality_rating text,
  token_encrypted text not null,
  status text not null default 'pending_registration'
    check (status in ('pending_registration', 'connected', 'disconnected', 'error')),
  messaging_limit text,
  registration_pin_hash text,
  registered_at timestamptz,
  app_subscribed_at timestamptz,
  last_tested_at timestamptz,
  legacy_connection_id uuid unique references public.whatsapp_connections(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_channels_org_role_key unique (organization_id, role),
  constraint whatsapp_channels_phone_number_key unique (phone_number_id)
);

create index if not exists whatsapp_channels_org_status_idx
  on public.whatsapp_channels (organization_id, status, role);
create index if not exists whatsapp_channels_waba_idx
  on public.whatsapp_channels (waba_id, organization_id);

-- Os IDs antigos são preservados. Assim, referências existentes continuam válidas
-- durante a transição e podem ser usadas como channel_id.
insert into public.whatsapp_channels (
  id,
  organization_id,
  label,
  role,
  provider,
  business_id,
  waba_id,
  phone_number_id,
  display_phone_number,
  verified_name,
  quality_rating,
  token_encrypted,
  status,
  registered_at,
  app_subscribed_at,
  last_tested_at,
  legacy_connection_id,
  created_at,
  updated_at
)
select
  connection.id,
  connection.organization_id,
  case connection.channel
    when 'clientes' then 'Clientes finais · Nara'
    else 'Corretores · Plantão'
  end,
  case connection.channel
    when 'clientes' then 'cliente'
    else 'corretor'
  end,
  'meta_cloud',
  connection.business_id,
  connection.waba_id,
  connection.phone_number_id,
  connection.display_phone_number,
  connection.verified_name,
  connection.quality_rating,
  connection.encrypted_access_token,
  case connection.status
    when 'connected' then 'connected'
    when 'error' then 'error'
    else 'disconnected'
  end,
  case when connection.status = 'connected' then connection.connected_at else null end,
  case when connection.status = 'connected' then connection.connected_at else null end,
  connection.updated_at,
  connection.id,
  connection.connected_at,
  connection.updated_at
from public.whatsapp_connections connection
on conflict (id) do update set
  organization_id = excluded.organization_id,
  business_id = excluded.business_id,
  waba_id = excluded.waba_id,
  phone_number_id = excluded.phone_number_id,
  display_phone_number = excluded.display_phone_number,
  verified_name = excluded.verified_name,
  quality_rating = excluded.quality_rating,
  token_encrypted = excluded.token_encrypted,
  legacy_connection_id = excluded.legacy_connection_id,
  updated_at = greatest(public.whatsapp_channels.updated_at, excluded.updated_at);

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid not null references public.whatsapp_channels(id) on delete cascade,
  contact_wa_id text not null,
  lead_id uuid references public.leads(id) on delete set null,
  last_inbound_at timestamptz,
  window_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_conversations_channel_contact_key unique (channel_id, contact_wa_id)
);

create index if not exists whatsapp_conversations_org_updated_idx
  on public.whatsapp_conversations (organization_id, updated_at desc);
create index if not exists whatsapp_conversations_lead_idx
  on public.whatsapp_conversations (lead_id, updated_at desc);
create index if not exists whatsapp_conversations_window_idx
  on public.whatsapp_conversations (organization_id, window_expires_at);

with normalized_leads as (
  select
    lead.*,
    regexp_replace(coalesce(lead.phone, ''), '[^0-9]', '', 'g') as phone_digits
  from public.leads lead
)
insert into public.whatsapp_conversations (
  organization_id,
  channel_id,
  contact_wa_id,
  lead_id,
  last_inbound_at,
  window_expires_at,
  created_at,
  updated_at
)
select
  lead.organization_id,
  channel.id,
  case
    when lead.phone_digits like '55%' then lead.phone_digits
    else '55' || lead.phone_digits
  end,
  lead.id,
  lead.last_inbound_at,
  case when lead.last_inbound_at is not null then lead.last_inbound_at + interval '24 hours' else null end,
  lead.created_at,
  lead.updated_at
from normalized_leads lead
join public.whatsapp_channels channel
  on channel.organization_id = lead.organization_id
 and channel.role = lead.kind::text
where lead.phone_digits <> ''
on conflict (channel_id, contact_wa_id) do update set
  lead_id = coalesce(excluded.lead_id, public.whatsapp_conversations.lead_id),
  last_inbound_at = case
    when public.whatsapp_conversations.last_inbound_at is null then excluded.last_inbound_at
    when excluded.last_inbound_at is null then public.whatsapp_conversations.last_inbound_at
    else greatest(public.whatsapp_conversations.last_inbound_at, excluded.last_inbound_at)
  end,
  window_expires_at = case
    when public.whatsapp_conversations.window_expires_at is null then excluded.window_expires_at
    when excluded.window_expires_at is null then public.whatsapp_conversations.window_expires_at
    else greatest(public.whatsapp_conversations.window_expires_at, excluded.window_expires_at)
  end,
  updated_at = greatest(public.whatsapp_conversations.updated_at, excluded.updated_at);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid not null references public.whatsapp_channels(id) on delete cascade,
  conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  wamid text unique,
  direction text not null check (direction in ('in', 'out')),
  sender_kind text,
  type text not null default 'text',
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  status text,
  category text check (category is null or category in ('service', 'marketing', 'utility', 'authentication')),
  error jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_messages_conversation_sent_idx
  on public.whatsapp_messages (conversation_id, sent_at desc, created_at desc);
create index if not exists whatsapp_messages_org_month_idx
  on public.whatsapp_messages (organization_id, sent_at desc)
  where direction = 'out';
create index if not exists whatsapp_messages_channel_category_idx
  on public.whatsapp_messages (channel_id, category, sent_at desc)
  where direction = 'out';
create index if not exists whatsapp_messages_lead_idx
  on public.whatsapp_messages (lead_id, created_at desc);

alter table public.messages
  add column if not exists whatsapp_channel_id uuid references public.whatsapp_channels(id) on delete set null,
  add column if not exists whatsapp_conversation_id uuid references public.whatsapp_conversations(id) on delete set null;

update public.messages message
set whatsapp_channel_id = channel.id
from public.whatsapp_channels channel
where message.whatsapp_channel_id is null
  and channel.legacy_connection_id = message.whatsapp_connection_id;

update public.messages message
set whatsapp_conversation_id = conversation.id
from public.whatsapp_conversations conversation
where message.whatsapp_conversation_id is null
  and conversation.lead_id = message.lead_id
  and conversation.channel_id = message.whatsapp_channel_id;

insert into public.whatsapp_messages (
  organization_id,
  channel_id,
  conversation_id,
  lead_id,
  wamid,
  direction,
  sender_kind,
  type,
  body,
  payload,
  status,
  category,
  sent_at,
  created_at,
  updated_at
)
select
  message.organization_id,
  message.whatsapp_channel_id,
  message.whatsapp_conversation_id,
  message.lead_id,
  message.whatsapp_message_id,
  message.direction::text,
  message.sender_kind::text,
  case
    when message.raw_payload ? 'template_name' or message.raw_payload ? 'broadcast_id' then 'template'
    when message.raw_payload ? 'ai_file_id' then 'media'
    else 'text'
  end,
  message.body,
  message.raw_payload,
  message.status,
  case
    when message.direction::text <> 'out' then null
    when lower(coalesce(message.raw_payload ->> 'template_category', '')) in ('marketing', 'utility', 'authentication')
      then lower(message.raw_payload ->> 'template_category')
    when message.raw_payload ? 'template_name' or message.raw_payload ? 'broadcast_id' then 'marketing'
    else 'service'
  end,
  message.created_at,
  message.created_at,
  message.created_at
from public.messages message
where message.whatsapp_channel_id is not null
  and message.whatsapp_message_id is not null
  and message.direction::text in ('in', 'out')
on conflict (wamid) do nothing;

alter table public.whatsapp_templates
  add column if not exists channel_id uuid references public.whatsapp_channels(id) on delete set null,
  add column if not exists waba_id text;

update public.whatsapp_templates template
set
  channel_id = coalesce(template.channel_id, channel.id),
  waba_id = coalesce(template.waba_id, channel.waba_id)
from public.whatsapp_channels channel
where channel.legacy_connection_id = template.whatsapp_connection_id
  and (template.channel_id is null or template.waba_id is null);

create unique index if not exists whatsapp_templates_channel_name_language_uidx
  on public.whatsapp_templates (channel_id, name, language)
  where channel_id is not null;
create index if not exists whatsapp_templates_waba_status_idx
  on public.whatsapp_templates (organization_id, waba_id, status, category);

alter table public.broadcasts
  add column if not exists whatsapp_channel_id uuid references public.whatsapp_channels(id) on delete set null;

update public.broadcasts broadcast
set whatsapp_channel_id = channel.id
from public.whatsapp_channels channel
where broadcast.whatsapp_channel_id is null
  and channel.legacy_connection_id = broadcast.whatsapp_connection_id;

create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  channel_id uuid references public.whatsapp_channels(id) on delete set null,
  phone_number_id text,
  raw jsonb not null default '{}'::jsonb,
  signature_valid boolean not null,
  received_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  error text
);

create index if not exists whatsapp_webhook_events_pending_idx
  on public.whatsapp_webhook_events (received_at)
  where processed_at is null;
create index if not exists whatsapp_webhook_events_org_received_idx
  on public.whatsapp_webhook_events (organization_id, received_at desc);
create index if not exists whatsapp_webhook_events_phone_idx
  on public.whatsapp_webhook_events (phone_number_id, received_at desc);

create or replace function public.claim_whatsapp_webhook_event(target_id uuid)
returns setof public.whatsapp_webhook_events
language sql
security definer
set search_path = public
as $$
  update public.whatsapp_webhook_events
  set
    processing_started_at = now(),
    attempts = attempts + 1
  where id = target_id
    and signature_valid = true
    and processed_at is null
    and (
      processing_started_at is null
      or processing_started_at < now() - interval '5 minutes'
    )
  returning *;
$$;

revoke all on function public.claim_whatsapp_webhook_event(uuid) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_webhook_event(uuid) to service_role;

create or replace view public.whatsapp_monthly_message_counts
with (security_invoker = true)
as
select
  message.organization_id,
  message.channel_id,
  channel.label as channel_label,
  channel.role,
  date_trunc('month', coalesce(message.sent_at, message.created_at)) as month,
  message.category,
  count(*)::bigint as message_count
from public.whatsapp_messages message
join public.whatsapp_channels channel on channel.id = message.channel_id
where message.direction = 'out'
  and message.category is not null
group by
  message.organization_id,
  message.channel_id,
  channel.label,
  channel.role,
  date_trunc('month', coalesce(message.sent_at, message.created_at)),
  message.category;

-- Atualiza a janela também no JSON do lead para a interface conseguir bloquear
-- texto livre sem depender de uma consulta adicional no navegador.
update public.leads lead
set metadata = coalesce(lead.metadata, '{}'::jsonb) || jsonb_build_object(
  'whatsapp_channel_id', conversation.channel_id,
  'whatsapp_window_expires_at', conversation.window_expires_at
)
from public.whatsapp_conversations conversation
where conversation.lead_id = lead.id;

alter table public.whatsapp_channels enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_webhook_events enable row level security;

-- Canais: o backend usa a Secret Key. Usuários autenticados recebem apenas
-- colunas não sensíveis e nunca token_encrypted ou registration_pin_hash.
drop policy if exists whatsapp_channels_select_member on public.whatsapp_channels;
create policy whatsapp_channels_select_member on public.whatsapp_channels
  for select to authenticated
  using (private.is_org_member(organization_id));

drop policy if exists whatsapp_channels_manage_admin on public.whatsapp_channels;
create policy whatsapp_channels_manage_admin on public.whatsapp_channels
  for all to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));

drop policy if exists whatsapp_conversations_select_member on public.whatsapp_conversations;
create policy whatsapp_conversations_select_member on public.whatsapp_conversations
  for select to authenticated
  using (private.is_org_member(organization_id));

drop policy if exists whatsapp_conversations_manage_editor on public.whatsapp_conversations;
create policy whatsapp_conversations_manage_editor on public.whatsapp_conversations
  for all to authenticated
  using (private.can_edit_org(organization_id))
  with check (private.can_edit_org(organization_id));

drop policy if exists whatsapp_messages_select_member on public.whatsapp_messages;
create policy whatsapp_messages_select_member on public.whatsapp_messages
  for select to authenticated
  using (private.is_org_member(organization_id));

drop policy if exists whatsapp_messages_manage_editor on public.whatsapp_messages;
create policy whatsapp_messages_manage_editor on public.whatsapp_messages
  for all to authenticated
  using (private.can_edit_org(organization_id))
  with check (private.can_edit_org(organization_id));

drop policy if exists whatsapp_webhook_events_select_admin on public.whatsapp_webhook_events;
create policy whatsapp_webhook_events_select_admin on public.whatsapp_webhook_events
  for select to authenticated
  using (organization_id is not null and private.is_org_admin(organization_id));

revoke all on public.whatsapp_channels from anon, authenticated;
grant select (
  id,
  organization_id,
  label,
  role,
  provider,
  business_id,
  waba_id,
  phone_number_id,
  display_phone_number,
  verified_name,
  quality_rating,
  status,
  messaging_limit,
  registered_at,
  app_subscribed_at,
  last_tested_at,
  created_at,
  updated_at
) on public.whatsapp_channels to authenticated;

grant select, insert, update, delete on public.whatsapp_conversations to authenticated;
grant select, insert, update, delete on public.whatsapp_messages to authenticated;
grant select on public.whatsapp_webhook_events to authenticated;
grant select on public.whatsapp_monthly_message_counts to authenticated;

drop trigger if exists whatsapp_channels_set_updated_at on public.whatsapp_channels;
create trigger whatsapp_channels_set_updated_at
  before update on public.whatsapp_channels
  for each row execute procedure public.set_updated_at();

drop trigger if exists whatsapp_conversations_set_updated_at on public.whatsapp_conversations;
create trigger whatsapp_conversations_set_updated_at
  before update on public.whatsapp_conversations
  for each row execute procedure public.set_updated_at();

drop trigger if exists whatsapp_messages_set_updated_at on public.whatsapp_messages;
create trigger whatsapp_messages_set_updated_at
  before update on public.whatsapp_messages
  for each row execute procedure public.set_updated_at();

comment on table public.whatsapp_channels is
  'Canais de WhatsApp independentes do provedor. organization_id é o tenant do Bossa CRM.';
comment on column public.whatsapp_channels.token_encrypted is
  'Token do provedor criptografado no servidor com AES-256-GCM; nunca deve ser enviado ao navegador.';
comment on column public.whatsapp_channels.registration_pin_hash is
  'HMAC do PIN de seis dígitos usado no registro. O PIN original não é armazenado.';
comment on table public.whatsapp_conversations is
  'Conversa por canal e contato, incluindo a janela móvel de atendimento de 24 horas.';
comment on table public.whatsapp_messages is
  'Registro técnico e idempotente das mensagens do provedor. messages continua sendo a projeção visual do CRM.';
comment on table public.whatsapp_webhook_events is
  'Log bruto e fila durável dos webhooks. organization_id pode ser nulo quando o número recebido não está cadastrado.';
comment on view public.whatsapp_monthly_message_counts is
  'Contagem mensal de mensagens enviadas por canal e categoria para acompanhamento de custo.';

commit;
