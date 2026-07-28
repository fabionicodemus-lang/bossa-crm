-- BOSSA CRM — Treinamento da Nara e do Plantão
-- Execute depois de 001_bossa_crm.sql no SQL Editor do Supabase.

create table if not exists public.ai_agent_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent text not null check (agent in ('nara', 'plantao')),
  persona jsonb not null default '{}'::jsonb,
  knowledge jsonb not null default '{}'::jsonb,
  first_message text not null default '',
  active boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, agent)
);

create index if not exists ai_agent_configs_org_agent_idx
  on public.ai_agent_configs (organization_id, agent);

create table if not exists public.ai_training_examples (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent text not null check (agent in ('nara', 'plantao')),
  scenario text,
  user_message text not null,
  assistant_message text not null,
  rating text not null check (rating in ('approved', 'corrected', 'rejected')),
  correction text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_training_examples_org_agent_created_idx
  on public.ai_training_examples (organization_id, agent, created_at desc);

alter table public.ai_agent_configs enable row level security;
alter table public.ai_training_examples enable row level security;

drop policy if exists ai_agent_configs_select_member on public.ai_agent_configs;
create policy ai_agent_configs_select_member
  on public.ai_agent_configs for select to authenticated
  using (private.is_org_member(organization_id));

drop policy if exists ai_agent_configs_insert_admin on public.ai_agent_configs;
create policy ai_agent_configs_insert_admin
  on public.ai_agent_configs for insert to authenticated
  with check (private.is_org_admin(organization_id));

drop policy if exists ai_agent_configs_update_admin on public.ai_agent_configs;
create policy ai_agent_configs_update_admin
  on public.ai_agent_configs for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));

drop policy if exists ai_agent_configs_delete_admin on public.ai_agent_configs;
create policy ai_agent_configs_delete_admin
  on public.ai_agent_configs for delete to authenticated
  using (private.is_org_admin(organization_id));

drop policy if exists ai_training_examples_select_member on public.ai_training_examples;
create policy ai_training_examples_select_member
  on public.ai_training_examples for select to authenticated
  using (private.is_org_member(organization_id));

drop policy if exists ai_training_examples_insert_admin on public.ai_training_examples;
create policy ai_training_examples_insert_admin
  on public.ai_training_examples for insert to authenticated
  with check (private.is_org_admin(organization_id));

drop policy if exists ai_training_examples_update_admin on public.ai_training_examples;
create policy ai_training_examples_update_admin
  on public.ai_training_examples for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));

drop policy if exists ai_training_examples_delete_admin on public.ai_training_examples;
create policy ai_training_examples_delete_admin
  on public.ai_training_examples for delete to authenticated
  using (private.is_org_admin(organization_id));

drop trigger if exists ai_agent_configs_set_updated_at on public.ai_agent_configs;
create trigger ai_agent_configs_set_updated_at
  before update on public.ai_agent_configs
  for each row execute procedure public.set_updated_at();

grant select, insert, update, delete on public.ai_agent_configs to authenticated;
grant select, insert, update, delete on public.ai_training_examples to authenticated;
