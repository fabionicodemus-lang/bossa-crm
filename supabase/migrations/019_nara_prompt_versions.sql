-- BOSSA CRM — histórico versionado do Prompt final da Nara
-- Execute depois de 018_nara_dynamic_context.sql.

create table if not exists public.nara_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  prompt_text text not null check (char_length(prompt_text) between 1 and 100000),
  reason text not null default 'save' check (reason in ('save', 'restore_backup')),
  restored_from_id uuid references public.nara_prompt_versions(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists nara_prompt_versions_org_created_idx
  on public.nara_prompt_versions (organization_id, created_at desc);

alter table public.nara_prompt_versions enable row level security;

drop policy if exists nara_prompt_versions_select_admin on public.nara_prompt_versions;
create policy nara_prompt_versions_select_admin
  on public.nara_prompt_versions for select to authenticated
  using (private.is_org_admin(organization_id));

drop policy if exists nara_prompt_versions_insert_admin on public.nara_prompt_versions;
create policy nara_prompt_versions_insert_admin
  on public.nara_prompt_versions for insert to authenticated
  with check (private.is_org_admin(organization_id));

grant select, insert on public.nara_prompt_versions to authenticated;
