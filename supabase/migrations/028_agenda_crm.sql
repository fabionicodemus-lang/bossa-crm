create table if not exists public.agenda_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_kind text not null default 'human' check (created_by_kind in ('human','ai','system')),
  agent text check (agent is null or agent in ('nara','plantao')),
  title text not null,
  description text,
  event_type text not null default 'reuniao_cliente' check (event_type in ('reuniao_cliente','apresentacao','visita','ligacao','tarefa','outro')),
  meeting_mode text not null default 'presencial' check (meeting_mode in ('presencial','video','telefone')),
  location text,
  video_url text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists agenda_events_org_time_idx on public.agenda_events (organization_id, starts_at, ends_at);
create index if not exists agenda_events_assignee_time_idx on public.agenda_events (organization_id, assigned_to, starts_at, ends_at) where status = 'scheduled';
create index if not exists agenda_events_lead_idx on public.agenda_events (lead_id, starts_at desc) where lead_id is not null;

alter table public.agenda_events enable row level security;

drop policy if exists agenda_events_select_member on public.agenda_events;
create policy agenda_events_select_member on public.agenda_events for select to authenticated
using (exists (
  select 1 from public.memberships m
  where m.organization_id = agenda_events.organization_id and m.user_id = auth.uid()
));

drop policy if exists agenda_events_insert_staff on public.agenda_events;
create policy agenda_events_insert_staff on public.agenda_events for insert to authenticated
with check (exists (
  select 1 from public.memberships m
  where m.organization_id = agenda_events.organization_id and m.user_id = auth.uid() and m.role in ('admin','comercial')
));

drop policy if exists agenda_events_update_staff on public.agenda_events;
create policy agenda_events_update_staff on public.agenda_events for update to authenticated
using (exists (
  select 1 from public.memberships m
  where m.organization_id = agenda_events.organization_id and m.user_id = auth.uid() and m.role in ('admin','comercial')
))
with check (exists (
  select 1 from public.memberships m
  where m.organization_id = agenda_events.organization_id and m.user_id = auth.uid() and m.role in ('admin','comercial')
));

drop policy if exists agenda_events_delete_staff on public.agenda_events;
create policy agenda_events_delete_staff on public.agenda_events for delete to authenticated
using (exists (
  select 1 from public.memberships m
  where m.organization_id = agenda_events.organization_id and m.user_id = auth.uid() and m.role in ('admin','comercial')
));

drop trigger if exists agenda_events_set_updated_at on public.agenda_events;
create trigger agenda_events_set_updated_at before update on public.agenda_events
for each row execute procedure public.set_updated_at();

grant select, insert, update, delete on public.agenda_events to authenticated;
