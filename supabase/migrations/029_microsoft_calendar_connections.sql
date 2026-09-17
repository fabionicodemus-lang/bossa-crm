-- Tokens da Microsoft só são acessíveis pelo servidor com service role.
create table if not exists public.microsoft_calendar_connections (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  microsoft_user_id text not null,
  microsoft_email text not null,
  tenant_id text not null,
  refresh_token_ciphertext text not null,
  access_token_ciphertext text not null,
  access_token_expires_at timestamptz not null,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
alter table public.microsoft_calendar_connections enable row level security;
revoke all on public.microsoft_calendar_connections from anon, authenticated;
create unique index if not exists microsoft_calendar_user_identity_idx
  on public.microsoft_calendar_connections (organization_id, microsoft_user_id);
drop trigger if exists microsoft_calendar_connections_updated on public.microsoft_calendar_connections;
create trigger microsoft_calendar_connections_updated before update on public.microsoft_calendar_connections
  for each row execute procedure public.set_updated_at();

alter table public.agenda_events add column if not exists microsoft_event_id text;
alter table public.agenda_events add column if not exists microsoft_sync_status text not null default 'not_connected'
  check (microsoft_sync_status in ('not_connected','pending','synced','failed','imported'));
create unique index if not exists agenda_microsoft_event_owner_idx
  on public.agenda_events (organization_id, assigned_to, microsoft_event_id)
  where microsoft_event_id is not null;
-- Proteção concorrente: duas IAs/usuários não podem reservar o mesmo responsável ao mesmo tempo.
create extension if not exists btree_gist;
alter table public.agenda_events add constraint agenda_prevent_assignee_overlap
  exclude using gist (
    organization_id with =,
    assigned_to with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'scheduled' and assigned_to is not null);
