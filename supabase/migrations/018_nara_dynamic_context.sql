-- BOSSA CRM — bloco dinâmico e variáveis operacionais da Nara
-- Execute depois de 017_nara_offer_logs.sql.

create table if not exists public.nara_runtime_variables (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  values jsonb not null default '{}'::jsonb
    check (jsonb_typeof(values) = 'object'),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nara_runtime_variables enable row level security;

drop policy if exists nara_runtime_variables_select_member on public.nara_runtime_variables;
create policy nara_runtime_variables_select_member
  on public.nara_runtime_variables for select to authenticated
  using (private.is_org_member(organization_id));

drop policy if exists nara_runtime_variables_insert_admin on public.nara_runtime_variables;
create policy nara_runtime_variables_insert_admin
  on public.nara_runtime_variables for insert to authenticated
  with check (private.is_org_admin(organization_id));

drop policy if exists nara_runtime_variables_update_admin on public.nara_runtime_variables;
create policy nara_runtime_variables_update_admin
  on public.nara_runtime_variables for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));

drop policy if exists nara_runtime_variables_delete_admin on public.nara_runtime_variables;
create policy nara_runtime_variables_delete_admin
  on public.nara_runtime_variables for delete to authenticated
  using (private.is_org_admin(organization_id));

drop trigger if exists nara_runtime_variables_set_updated_at on public.nara_runtime_variables;
create trigger nara_runtime_variables_set_updated_at
  before update on public.nara_runtime_variables
  for each row execute procedure public.set_updated_at();

grant select, insert, update, delete on public.nara_runtime_variables to authenticated;
