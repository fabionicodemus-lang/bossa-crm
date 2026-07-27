-- BOSSA CRM — banco, autenticação, permissões, pipelines e WhatsApp
-- Execute este arquivo no SQL Editor do Supabase em um projeto novo.

create extension if not exists pgcrypto;
create schema if not exists private;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'comercial', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.lead_kind AS ENUM ('cliente', 'corretor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.message_direction AS ENUM ('in', 'out', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.sender_kind AS ENUM ('lead', 'ia', 'humano', 'sistema');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.whatsapp_channel AS ENUM ('clientes', 'corretores');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Usuário',
  email text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_email_lower_uidx on public.profiles (lower(email));

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null default 'comercial',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships(user_id);
create index if not exists memberships_org_idx on public.memberships(organization_id);

create table if not exists public.pending_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.app_role not null default 'comercial',
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);
create index if not exists pending_invites_email_idx on public.pending_invites(lower(email)) where accepted_at is null;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind public.lead_kind not null,
  kommo_id text,
  name text not null check (char_length(name) between 1 and 200),
  phone text,
  email text,
  stage text not null,
  source text,
  enterprise text,
  company text,
  group_name text,
  creci text,
  temperature integer not null default 0 check (temperature between 0 and 100),
  ai_enabled boolean not null default false,
  owner_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_stage_by_kind check (
    (kind = 'cliente' and stage in ('novo','ia','qualificado','agendado','negociacao','fechado'))
    or
    (kind = 'corretor' and stage in ('n1','n2','n3','n4','n5'))
  )
);
create unique index if not exists leads_org_kind_kommo_uidx on public.leads(organization_id, kind, kommo_id) where kommo_id is not null and kommo_id <> '';
create index if not exists leads_org_kind_stage_idx on public.leads(organization_id, kind, stage, updated_at desc);
create index if not exists leads_org_phone_idx on public.leads(organization_id, kind, phone);
create index if not exists leads_owner_idx on public.leads(owner_id);

create table if not exists public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel public.whatsapp_channel not null,
  business_id text,
  waba_id text not null,
  phone_number_id text not null unique,
  display_phone_number text,
  verified_name text,
  quality_rating text,
  encrypted_access_token text not null,
  status text not null default 'connected' check (status in ('connected','disconnected','error')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, channel)
);
create index if not exists whatsapp_connections_org_idx on public.whatsapp_connections(organization_id, channel);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  whatsapp_connection_id uuid references public.whatsapp_connections(id) on delete set null,
  direction public.message_direction not null,
  sender_kind public.sender_kind not null,
  sender_user_id uuid references public.profiles(id) on delete set null,
  body text not null default '',
  status text,
  whatsapp_message_id text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists messages_wamid_uidx on public.messages(whatsapp_message_id);
create index if not exists messages_lead_created_idx on public.messages(lead_id, created_at);
create index if not exists messages_org_created_idx on public.messages(organization_id, created_at desc);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  type text not null default 'sistema',
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activities_org_created_idx on public.activities(organization_id, created_at desc);
create index if not exists activities_lead_created_idx on public.activities(lead_id, created_at desc);

-- Funções de autorização em schema não exposto.
create or replace function private.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = target_org and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.can_edit_org(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.role in ('admin','comercial')
  );
$$;

create or replace function private.is_org_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.role = 'admin'
  );
$$;

create or replace function private.shares_organization(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = target_user
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.can_edit_org(uuid) to authenticated;
grant execute on function private.is_org_admin(uuid) to authenticated;
grant execute on function private.shares_organization(uuid) to authenticated;

-- Cria perfil e aceita convites quando o usuário nasce no Supabase Auth.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite record;
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, 'Usuário'), '@', 1)),
    coalesce(new.email, new.id::text)
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    updated_at = now();

  for invite in
    select * from public.pending_invites
    where lower(email) = lower(coalesce(new.email, '')) and accepted_at is null
  loop
    insert into public.memberships (organization_id, user_id, role)
    values (invite.organization_id, new.id, invite.role)
    on conflict (organization_id, user_id) do update set role = excluded.role;

    update public.pending_invites set accepted_at = now() where id = invite.id;
  end loop;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute procedure public.handle_new_auth_user();

-- RPC de onboarding. O usuário só pode criar uma empresa caso ainda não pertença a nenhuma.
create or replace function public.create_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  existing_org uuid;
  new_org uuid;
  base_slug text;
  final_slug text;
begin
  if uid is null then raise exception 'Usuário não autenticado'; end if;
  select organization_id into existing_org from public.memberships where user_id = uid limit 1;
  if existing_org is not null then return existing_org; end if;
  if char_length(trim(workspace_name)) < 2 then raise exception 'Nome da empresa inválido'; end if;

  base_slug := trim(both '-' from regexp_replace(lower(trim(workspace_name)), '[^a-z0-9]+', '-', 'g'));
  if base_slug = '' then base_slug := 'empresa'; end if;
  final_slug := base_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.organizations(name, slug) values (trim(workspace_name), final_slug) returning id into new_org;
  insert into public.memberships(organization_id, user_id, role) values (new_org, uid, 'admin');
  return new_org;
end;
$$;
grant execute on function public.create_workspace(text) to authenticated;

-- Triggers de integridade e histórico.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at before update on public.organizations for each row execute procedure public.set_updated_at();
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at before update on public.leads for each row execute procedure public.set_updated_at();
drop trigger if exists whatsapp_connections_set_updated_at on public.whatsapp_connections;
create trigger whatsapp_connections_set_updated_at before update on public.whatsapp_connections for each row execute procedure public.set_updated_at();

create or replace function public.enforce_lead_ai_rules()
returns trigger language plpgsql as $$
begin
  if new.kind = 'cliente' and new.stage = 'fechado' then new.ai_enabled := false; end if;
  if new.kind = 'cliente' and new.ai_enabled = true and new.stage <> 'ia' then new.ai_enabled := false; end if;
  return new;
end; $$;
drop trigger if exists leads_enforce_ai on public.leads;
create trigger leads_enforce_ai before insert or update on public.leads for each row execute procedure public.enforce_lead_ai_rules();

create or replace function public.log_lead_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activities(organization_id, lead_id, user_id, type, title, description)
  values (
    new.organization_id,
    new.id,
    (select auth.uid()),
    case when new.kommo_id is not null then 'importacao' else 'cadastro' end,
    case when new.kommo_id is not null then 'Registro importado para o Bossa CRM' else 'Contato cadastrado no CRM' end,
    case when new.kommo_id is not null then 'ID Kommo: ' || new.kommo_id else 'Cadastro criado no sistema.' end
  );
  return new;
end; $$;
drop trigger if exists leads_log_insert on public.leads;
create trigger leads_log_insert after insert on public.leads for each row execute procedure public.log_lead_insert();

create or replace function public.log_lead_stage_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.stage is distinct from new.stage then
    insert into public.activities(organization_id, lead_id, user_id, type, title, description, metadata)
    values (
      new.organization_id,
      new.id,
      (select auth.uid()),
      'etapa',
      'Etapa alterada: ' || old.stage || ' → ' || new.stage,
      'Movimentação registrada automaticamente pelo CRM.',
      jsonb_build_object('from', old.stage, 'to', new.stage)
    );
  end if;
  return new;
end; $$;
drop trigger if exists leads_log_stage_change on public.leads;
create trigger leads_log_stage_change after update on public.leads for each row execute procedure public.log_lead_stage_change();

-- Row Level Security: usuários só enxergam dados das próprias empresas.
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.pending_invites enable row level security;
alter table public.leads enable row level security;
alter table public.messages enable row level security;
alter table public.activities enable row level security;
alter table public.whatsapp_connections enable row level security;

-- Limpa políticas com os mesmos nomes para permitir reexecução.
drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member on public.organizations for select to authenticated using (private.is_org_member(id));
drop policy if exists organizations_update_admin on public.organizations;
create policy organizations_update_admin on public.organizations for update to authenticated using (private.is_org_admin(id)) with check (private.is_org_admin(id));

drop policy if exists profiles_select_shared on public.profiles;
create policy profiles_select_shared on public.profiles for select to authenticated using (id = (select auth.uid()) or private.shares_organization(id));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists memberships_select_member on public.memberships;
create policy memberships_select_member on public.memberships for select to authenticated using (private.is_org_member(organization_id));
drop policy if exists memberships_insert_admin on public.memberships;
create policy memberships_insert_admin on public.memberships for insert to authenticated with check (private.is_org_admin(organization_id));
drop policy if exists memberships_update_admin on public.memberships;
create policy memberships_update_admin on public.memberships for update to authenticated using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));
drop policy if exists memberships_delete_admin on public.memberships;
create policy memberships_delete_admin on public.memberships for delete to authenticated using (private.is_org_admin(organization_id));

drop policy if exists invites_admin_all on public.pending_invites;
create policy invites_admin_all on public.pending_invites for all to authenticated using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));

drop policy if exists leads_select_member on public.leads;
create policy leads_select_member on public.leads for select to authenticated using (private.is_org_member(organization_id));
drop policy if exists leads_insert_editor on public.leads;
create policy leads_insert_editor on public.leads for insert to authenticated with check (private.can_edit_org(organization_id));
drop policy if exists leads_update_editor on public.leads;
create policy leads_update_editor on public.leads for update to authenticated using (private.can_edit_org(organization_id)) with check (private.can_edit_org(organization_id));
drop policy if exists leads_delete_editor on public.leads;
create policy leads_delete_editor on public.leads for delete to authenticated using (private.can_edit_org(organization_id));

drop policy if exists messages_select_member on public.messages;
create policy messages_select_member on public.messages for select to authenticated using (private.is_org_member(organization_id));
drop policy if exists messages_insert_editor on public.messages;
create policy messages_insert_editor on public.messages for insert to authenticated with check (private.can_edit_org(organization_id));
drop policy if exists messages_update_editor on public.messages;
create policy messages_update_editor on public.messages for update to authenticated using (private.can_edit_org(organization_id)) with check (private.can_edit_org(organization_id));

drop policy if exists activities_select_member on public.activities;
create policy activities_select_member on public.activities for select to authenticated using (private.is_org_member(organization_id));
drop policy if exists activities_insert_editor on public.activities;
create policy activities_insert_editor on public.activities for insert to authenticated with check (private.can_edit_org(organization_id));

-- Nenhuma política é criada para whatsapp_connections: os tokens só são acessados pelo backend com a Secret Key.

-- Grants necessários para Data API; RLS continua sendo a barreira efetiva.
grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;
grant select, insert, update, delete on public.pending_invites to authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.activities to authenticated;
revoke all on public.whatsapp_connections from anon, authenticated;

-- Realtime para novas mensagens e históricos na ficha aberta.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.activities;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
