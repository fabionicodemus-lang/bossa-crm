-- BOSSA CRM — transmissões em massa com templates aprovados da Meta
-- Execute depois de 008_arquivamento_exclusao_leads.sql.

begin;

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  whatsapp_connection_id uuid not null references public.whatsapp_connections(id) on delete cascade,
  meta_template_id text,
  name text not null,
  language text not null,
  category text not null default 'MARKETING',
  status text not null,
  quality_score text,
  header_format text not null default 'NONE',
  body_text text not null default '',
  footer_text text,
  components jsonb not null default '[]'::jsonb,
  buttons jsonb not null default '[]'::jsonb,
  variable_count integer not null default 0 check (variable_count >= 0),
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (whatsapp_connection_id, name, language)
);

create index if not exists whatsapp_templates_org_status_idx
  on public.whatsapp_templates (organization_id, status, category, updated_at desc);

create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  whatsapp_connection_id uuid not null references public.whatsapp_connections(id) on delete restrict,
  template_id uuid not null references public.whatsapp_templates(id) on delete restrict,
  channel public.whatsapp_channel not null,
  name text not null check (char_length(name) between 2 and 160),
  stages text[] not null default '{}',
  template_name text not null,
  template_language text not null,
  template_category text not null,
  variable_mappings jsonb not null default '[]'::jsonb,
  header_type text not null default 'NONE',
  media_bucket text,
  media_path text,
  media_mime_type text,
  media_filename text,
  status text not null default 'draft' check (status in ('draft','ready','running','paused','completed','cancelled','failed')),
  recipient_count integer not null default 0,
  queued_count integer not null default 0,
  sent_count integer not null default 0,
  delivered_count integer not null default 0,
  read_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists broadcasts_org_created_idx
  on public.broadcasts (organization_id, created_at desc);
create index if not exists broadcasts_org_status_idx
  on public.broadcasts (organization_id, status, updated_at desc);

create table if not exists public.broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  lead_name text not null,
  phone text,
  stage text,
  lead_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','sending','sent','delivered','read','failed','skipped')),
  whatsapp_message_id text,
  error_code text,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (broadcast_id, lead_id)
);

create unique index if not exists broadcast_recipients_wamid_uidx
  on public.broadcast_recipients (whatsapp_message_id)
  where whatsapp_message_id is not null;
create index if not exists broadcast_recipients_broadcast_status_idx
  on public.broadcast_recipients (broadcast_id, status, created_at);
create index if not exists broadcast_recipients_lead_idx
  on public.broadcast_recipients (lead_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'broadcast-media',
  'broadcast-media',
  false,
  104857600,
  array[
    'image/jpeg','image/png',
    'video/mp4','video/3gpp',
    'application/pdf','text/plain','text/csv',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.whatsapp_templates enable row level security;
alter table public.broadcasts enable row level security;
alter table public.broadcast_recipients enable row level security;

drop policy if exists whatsapp_templates_select_member on public.whatsapp_templates;
drop policy if exists whatsapp_templates_manage_editor on public.whatsapp_templates;
drop policy if exists broadcasts_select_member on public.broadcasts;
drop policy if exists broadcasts_manage_editor on public.broadcasts;
drop policy if exists broadcast_recipients_select_member on public.broadcast_recipients;
drop policy if exists broadcast_recipients_manage_editor on public.broadcast_recipients;
drop policy if exists broadcast_media_select_member on storage.objects;
drop policy if exists broadcast_media_insert_editor on storage.objects;
drop policy if exists broadcast_media_update_editor on storage.objects;
drop policy if exists broadcast_media_delete_editor on storage.objects;

create policy whatsapp_templates_select_member on public.whatsapp_templates
  for select to authenticated using (private.is_org_member(organization_id));
create policy whatsapp_templates_manage_editor on public.whatsapp_templates
  for all to authenticated using (private.can_edit_org(organization_id)) with check (private.can_edit_org(organization_id));

create policy broadcasts_select_member on public.broadcasts
  for select to authenticated using (private.is_org_member(organization_id));
create policy broadcasts_manage_editor on public.broadcasts
  for all to authenticated using (private.can_edit_org(organization_id)) with check (private.can_edit_org(organization_id));

create policy broadcast_recipients_select_member on public.broadcast_recipients
  for select to authenticated using (private.is_org_member(organization_id));
create policy broadcast_recipients_manage_editor on public.broadcast_recipients
  for all to authenticated using (private.can_edit_org(organization_id)) with check (private.can_edit_org(organization_id));

create policy broadcast_media_select_member on storage.objects
  for select to authenticated
  using (
    bucket_id = 'broadcast-media'
    and private.is_org_member(((storage.foldername(name))[1])::uuid)
  );
create policy broadcast_media_insert_editor on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'broadcast-media'
    and private.can_edit_org(((storage.foldername(name))[1])::uuid)
  );
create policy broadcast_media_update_editor on storage.objects
  for update to authenticated
  using (
    bucket_id = 'broadcast-media'
    and private.can_edit_org(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'broadcast-media'
    and private.can_edit_org(((storage.foldername(name))[1])::uuid)
  );
create policy broadcast_media_delete_editor on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'broadcast-media'
    and private.can_edit_org(((storage.foldername(name))[1])::uuid)
  );

grant select, insert, update, delete on public.whatsapp_templates to authenticated;
grant select, insert, update, delete on public.broadcasts to authenticated;
grant select, insert, update, delete on public.broadcast_recipients to authenticated;

drop trigger if exists whatsapp_templates_set_updated_at on public.whatsapp_templates;
create trigger whatsapp_templates_set_updated_at before update on public.whatsapp_templates
  for each row execute procedure public.set_updated_at();
drop trigger if exists broadcasts_set_updated_at on public.broadcasts;
create trigger broadcasts_set_updated_at before update on public.broadcasts
  for each row execute procedure public.set_updated_at();
drop trigger if exists broadcast_recipients_set_updated_at on public.broadcast_recipients;
create trigger broadcast_recipients_set_updated_at before update on public.broadcast_recipients
  for each row execute procedure public.set_updated_at();

commit;
