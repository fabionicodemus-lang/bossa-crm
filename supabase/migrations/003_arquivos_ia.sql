-- BOSSA CRM — Biblioteca de arquivos que a Nara e o Plantão podem enviar
-- Execute depois de 001_bossa_crm.sql e 002_treinamento_nara_plantao.sql.

create table if not exists public.ai_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent text not null default 'both' check (agent in ('nara', 'plantao', 'both')),
  category text not null default 'outros',
  title text not null,
  description text,
  trigger_keywords text[] not null default '{}'::text[],
  storage_bucket text not null default 'ai-files',
  storage_path text not null unique,
  original_name text not null,
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_files_org_agent_active_idx
  on public.ai_files (organization_id, agent, active, category);

create index if not exists ai_files_org_created_idx
  on public.ai_files (organization_id, created_at desc);

alter table public.ai_files enable row level security;

drop policy if exists ai_files_select_admin on public.ai_files;
create policy ai_files_select_admin
  on public.ai_files for select to authenticated
  using (private.is_org_admin(organization_id));

drop policy if exists ai_files_insert_admin on public.ai_files;
create policy ai_files_insert_admin
  on public.ai_files for insert to authenticated
  with check (private.is_org_admin(organization_id));

drop policy if exists ai_files_update_admin on public.ai_files;
create policy ai_files_update_admin
  on public.ai_files for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));

drop policy if exists ai_files_delete_admin on public.ai_files;
create policy ai_files_delete_admin
  on public.ai_files for delete to authenticated
  using (private.is_org_admin(organization_id));

drop trigger if exists ai_files_set_updated_at on public.ai_files;
create trigger ai_files_set_updated_at
  before update on public.ai_files
  for each row execute procedure public.set_updated_at();

grant select, insert, update, delete on public.ai_files to authenticated;

-- Bucket privado: os arquivos são acessados por URL assinada e temporária.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ai-files', 'ai-files', false, 52428800, null)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- O primeiro diretório do caminho é sempre o UUID da organização.
drop policy if exists ai_files_storage_select_admin on storage.objects;
create policy ai_files_storage_select_admin
  on storage.objects for select to authenticated
  using (
    bucket_id = 'ai-files'
    and private.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists ai_files_storage_insert_admin on storage.objects;
create policy ai_files_storage_insert_admin
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ai-files'
    and private.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists ai_files_storage_update_admin on storage.objects;
create policy ai_files_storage_update_admin
  on storage.objects for update to authenticated
  using (
    bucket_id = 'ai-files'
    and private.is_org_admin(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'ai-files'
    and private.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists ai_files_storage_delete_admin on storage.objects;
create policy ai_files_storage_delete_admin
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'ai-files'
    and private.is_org_admin(((storage.foldername(name))[1])::uuid)
  );
