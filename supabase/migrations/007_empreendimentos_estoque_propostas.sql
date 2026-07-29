-- BOSSA CRM — Empreendimentos, estoque, tabelas de venda e base de propostas
-- Execute depois de 006_agendar_worker_followup.sql.
-- Cria o cadastro comercial dos empreendimentos e importa as unidades das tabelas Alma e Flow fornecidas.

begin;

create table if not exists public.developments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  slug text not null,
  status text not null default 'ativo' check (status in ('planejamento','lancamento','em_construcao','entregue','pausado','arquivado','ativo')),
  city text,
  neighborhood text,
  address text,
  description text,
  launch_date date,
  delivery_date date,
  total_units integer check (total_units is null or total_units >= 0),
  default_payment_plan jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists public.development_typologies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  development_id uuid not null references public.developments(id) on delete cascade,
  code text not null,
  name text not null,
  private_area_m2 numeric(12,2),
  bedrooms integer,
  suites integer,
  parking_spaces integer,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (development_id, code)
);

create table if not exists public.development_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  development_id uuid not null references public.developments(id) on delete cascade,
  category text not null default 'outros' check (category in ('book','tabela','planta','imagem','video','memorial','contrato','obra','outros')),
  title text not null,
  description text,
  storage_bucket text not null default 'development-files',
  storage_path text not null unique,
  original_name text not null,
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.development_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  development_id uuid not null references public.developments(id) on delete cascade,
  typology_id uuid references public.development_typologies(id) on delete set null,
  unit_code text not null,
  floor integer,
  status text not null default 'disponivel' check (status in ('disponivel','reservado','vendido','oculto','bloqueado')),
  private_area_m2 numeric(12,2),
  list_price numeric(16,2) not null default 0 check (list_price >= 0),
  entry_amount numeric(16,2) not null default 0 check (entry_amount >= 0),
  installment_count integer not null default 0 check (installment_count >= 0),
  installment_amount numeric(16,2) not null default 0 check (installment_amount >= 0),
  reinforcement_count integer not null default 0 check (reinforcement_count >= 0),
  reinforcement_amount numeric(16,2) not null default 0 check (reinforcement_amount >= 0),
  keys_amount numeric(16,2) not null default 0 check (keys_amount >= 0),
  payment_plan jsonb not null default '{}'::jsonb,
  price_updated_at timestamptz not null default now(),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (development_id, unit_code)
);

create table if not exists public.unit_price_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  development_id uuid not null references public.developments(id) on delete cascade,
  unit_id uuid not null references public.development_units(id) on delete cascade,
  previous_values jsonb not null,
  new_values jsonb not null,
  reason text,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  development_id uuid not null references public.developments(id) on delete restrict,
  unit_id uuid references public.development_units(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  status text not null default 'rascunho' check (status in ('rascunho','enviada','aprovada','recusada','expirada','cancelada')),
  proposal_number bigint generated by default as identity,
  list_price numeric(16,2) not null default 0 check (list_price >= 0),
  proposed_price numeric(16,2) not null default 0 check (proposed_price >= 0),
  discount_amount numeric(16,2) not null default 0,
  valid_until date,
  notes text,
  payment_plan jsonb not null default '{}'::jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version >= 1),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proposal_payment_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  kind text not null check (kind in ('entrada','parcela_ate_chaves','parcela_pos_chaves','reforco_semestral','reforco_anual','chaves','outro')),
  label text,
  quantity integer not null default 1 check (quantity >= 0),
  amount numeric(16,2) not null default 0 check (amount >= 0),
  start_date date,
  interval_months integer check (interval_months is null or interval_months >= 0),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists developments_org_active_idx on public.developments (organization_id, active, name);
create index if not exists development_typologies_dev_idx on public.development_typologies (development_id, active);
create index if not exists development_files_dev_idx on public.development_files (development_id, category, active);
create index if not exists development_units_dev_status_idx on public.development_units (development_id, status, floor desc, unit_code);
create index if not exists development_units_org_price_idx on public.development_units (organization_id, list_price) where status = 'disponivel';
create index if not exists unit_price_history_unit_idx on public.unit_price_history (unit_id, created_at desc);
create index if not exists proposals_org_status_idx on public.proposals (organization_id, status, updated_at desc);
create index if not exists proposals_lead_idx on public.proposals (lead_id, created_at desc) where lead_id is not null;
create index if not exists proposal_payment_items_proposal_idx on public.proposal_payment_items (proposal_id, sort_order);

alter table public.developments enable row level security;
alter table public.development_typologies enable row level security;
alter table public.development_files enable row level security;
alter table public.development_units enable row level security;
alter table public.unit_price_history enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_payment_items enable row level security;

-- Leitura para membros da organização; edição para admin e comercial.
do $policies$
declare
  tbl text;
begin
  foreach tbl in array array[
    'developments','development_typologies','development_files','development_units',
    'unit_price_history','proposals','proposal_payment_items'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', tbl || '_select_member', tbl);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_org_member(organization_id))', tbl || '_select_member', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_insert_editor', tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.can_edit_org(organization_id))', tbl || '_insert_editor', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_update_editor', tbl);
    execute format('create policy %I on public.%I for update to authenticated using (private.can_edit_org(organization_id)) with check (private.can_edit_org(organization_id))', tbl || '_update_editor', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_delete_editor', tbl);
    execute format('create policy %I on public.%I for delete to authenticated using (private.can_edit_org(organization_id))', tbl || '_delete_editor', tbl);
  end loop;
end
$policies$;

grant select, insert, update, delete on public.developments to authenticated;
grant select, insert, update, delete on public.development_typologies to authenticated;
grant select, insert, update, delete on public.development_files to authenticated;
grant select, insert, update, delete on public.development_units to authenticated;
grant select, insert, update, delete on public.unit_price_history to authenticated;
grant select, insert, update, delete on public.proposals to authenticated;
grant select, insert, update, delete on public.proposal_payment_items to authenticated;
grant usage, select on sequence public.proposals_proposal_number_seq to authenticated;

drop trigger if exists developments_set_updated_at on public.developments;
create trigger developments_set_updated_at before update on public.developments
for each row execute procedure public.set_updated_at();
drop trigger if exists development_typologies_set_updated_at on public.development_typologies;
create trigger development_typologies_set_updated_at before update on public.development_typologies
for each row execute procedure public.set_updated_at();
drop trigger if exists development_files_set_updated_at on public.development_files;
create trigger development_files_set_updated_at before update on public.development_files
for each row execute procedure public.set_updated_at();
drop trigger if exists development_units_set_updated_at on public.development_units;
create trigger development_units_set_updated_at before update on public.development_units
for each row execute procedure public.set_updated_at();
drop trigger if exists proposals_set_updated_at on public.proposals;
create trigger proposals_set_updated_at before update on public.proposals
for each row execute procedure public.set_updated_at();

create or replace function public.log_development_unit_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if row(
    old.list_price, old.entry_amount, old.installment_count, old.installment_amount,
    old.reinforcement_count, old.reinforcement_amount, old.keys_amount, old.status
  ) is distinct from row(
    new.list_price, new.entry_amount, new.installment_count, new.installment_amount,
    new.reinforcement_count, new.reinforcement_amount, new.keys_amount, new.status
  ) then
    insert into public.unit_price_history (
      organization_id, development_id, unit_id, previous_values, new_values, reason, changed_by
    ) values (
      new.organization_id,
      new.development_id,
      new.id,
      jsonb_build_object(
        'list_price', old.list_price, 'entry_amount', old.entry_amount,
        'installment_count', old.installment_count, 'installment_amount', old.installment_amount,
        'reinforcement_count', old.reinforcement_count, 'reinforcement_amount', old.reinforcement_amount,
        'keys_amount', old.keys_amount, 'status', old.status
      ),
      jsonb_build_object(
        'list_price', new.list_price, 'entry_amount', new.entry_amount,
        'installment_count', new.installment_count, 'installment_amount', new.installment_amount,
        'reinforcement_count', new.reinforcement_count, 'reinforcement_amount', new.reinforcement_amount,
        'keys_amount', new.keys_amount, 'status', new.status
      ),
      nullif(current_setting('app.price_change_reason', true), ''),
      auth.uid()
    );
    new.price_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists development_units_log_price_change on public.development_units;
create trigger development_units_log_price_change
before update on public.development_units
for each row execute procedure public.log_development_unit_price_change();

create or replace function public.adjust_development_prices(
  target_development_id uuid,
  percentage numeric,
  adjustment_reason text default null
)
returns setof public.development_units
language plpgsql
security invoker
set search_path = public
as $$
declare
  factor numeric;
begin
  if percentage is null or percentage <= -100 or percentage > 1000 then
    raise exception 'Percentual de reajuste inválido.';
  end if;

  if not exists (
    select 1
    from public.developments d
    where d.id = target_development_id
      and private.can_edit_org(d.organization_id)
  ) then
    raise exception 'Sem permissão para reajustar este empreendimento.';
  end if;

  factor := 1 + (percentage / 100);
  perform set_config('app.price_change_reason', coalesce(adjustment_reason, 'Reajuste geral da tabela'), true);

  return query
  update public.development_units u
  set list_price = round(u.list_price * factor, 2),
      entry_amount = round(u.entry_amount * factor, 2),
      installment_amount = round(u.installment_amount * factor, 2),
      reinforcement_amount = round(u.reinforcement_amount * factor, 2),
      keys_amount = round(u.keys_amount * factor, 2),
      updated_at = now()
  where u.development_id = target_development_id
    and u.status in ('disponivel','reservado')
    and u.list_price > 0
  returning u.*;
end;
$$;

grant execute on function public.adjust_development_prices(uuid, numeric, text) to authenticated;

-- Bucket privado dos materiais dos empreendimentos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('development-files', 'development-files', false, 104857600, null)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists development_files_storage_select_member on storage.objects;
create policy development_files_storage_select_member
  on storage.objects for select to authenticated
  using (
    bucket_id = 'development-files'
    and private.is_org_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists development_files_storage_insert_editor on storage.objects;
create policy development_files_storage_insert_editor
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'development-files'
    and private.can_edit_org(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists development_files_storage_update_editor on storage.objects;
create policy development_files_storage_update_editor
  on storage.objects for update to authenticated
  using (
    bucket_id = 'development-files'
    and private.can_edit_org(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'development-files'
    and private.can_edit_org(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists development_files_storage_delete_editor on storage.objects;
create policy development_files_storage_delete_editor
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'development-files'
    and private.can_edit_org(((storage.foldername(name))[1])::uuid)
  );

-- Dados iniciais extraídos das tabelas de vendas fornecidas pelo usuário.
with target_org as (
  select id
  from public.organizations
  where lower(name) like 'bossa%'
  order by name
  limit 1
)
insert into public.developments (
  organization_id, name, code, slug, status, city, neighborhood, description,
  delivery_date, total_units, default_payment_plan, metadata
)
select id, 'Alma Seahouses', 'ALMA', 'alma-seahouses', 'em_construcao', 'Porto Belo', 'Perequê',
       'Empreendimento cadastrado a partir da tabela de vendas fornecida.',
       date '2030-07-31', 50,
       '{"currency":"BRL","entry_percent":15,"installment_count":80,"reinforcement_count":7,"keys_percent":10}'::jsonb,
       '{"source":"Alma_Seahouses_Tabela_Vendas_A4_Retrato_Fonte_Tabela_14x.html"}'::jsonb
from target_org
on conflict (organization_id, slug) do update set
  name = excluded.name,
  code = excluded.code,
  total_units = excluded.total_units,
  default_payment_plan = excluded.default_payment_plan,
  metadata = public.developments.metadata || excluded.metadata;

with target_org as (
  select id
  from public.organizations
  where lower(name) like 'bossa%'
  order by name
  limit 1
)
insert into public.developments (
  organization_id, name, code, slug, status, city, description,
  delivery_date, total_units, default_payment_plan, metadata
)
select id, 'Flow Aptos', 'FLOW', 'flow-aptos', 'em_construcao', 'Porto Belo',
       'Empreendimento cadastrado a partir da tabela de vendas fornecida.',
       date '2027-11-30', 57,
       '{"currency":"BRL","entry_percent":20,"installment_count":60,"reinforcement_count":3,"keys_percent":20}'::jsonb,
       '{"source":"Flow_Aptos_Tabela_Cabecalho_Dinamico_Fundo_Branco.html"}'::jsonb
from target_org
on conflict (organization_id, slug) do update set
  name = excluded.name,
  code = excluded.code,
  total_units = excluded.total_units,
  default_payment_plan = excluded.default_payment_plan,
  metadata = public.developments.metadata || excluded.metadata;

with project as (
  select d.id as development_id, d.organization_id
  from public.developments d
  where d.slug = 'alma-seahouses'
    and lower((select o.name from public.organizations o where o.id = d.organization_id)) like 'bossa%'
  limit 1
),
rows(code, name, area) as (
  values
      ('01', 'Tipo 01', 114.00),
      ('02', 'Tipo 02', 103.00)
)
insert into public.development_typologies (
  organization_id, development_id, code, name, private_area_m2
)
select p.organization_id, p.development_id, r.code, r.name, r.area
from project p cross join rows r
on conflict (development_id, code) do update set
  name = excluded.name,
  private_area_m2 = excluded.private_area_m2,
  active = true;

with project as (
  select d.id as development_id, d.organization_id
  from public.developments d
  where d.slug = 'flow-aptos'
    and lower((select o.name from public.organizations o where o.id = d.organization_id)) like 'bossa%'
  limit 1
),
rows(code, name, area) as (
  values
      ('DX01', 'Duplex 01', 117.70),
      ('DX23', 'Duplex 02/03', 94.00),
      ('01', 'Tipo 01', 73.00),
      ('02', 'Tipo 02', 62.00),
      ('03', 'Tipo 03', 62.00)
)
insert into public.development_typologies (
  organization_id, development_id, code, name, private_area_m2
)
select p.organization_id, p.development_id, r.code, r.name, r.area
from project p cross join rows r
on conflict (development_id, code) do update set
  name = excluded.name,
  private_area_m2 = excluded.private_area_m2,
  active = true;

with project as (
  select d.id as development_id, d.organization_id
  from public.developments d
  where d.slug = 'alma-seahouses'
    and lower((select o.name from public.organizations o where o.id = d.organization_id)) like 'bossa%'
  limit 1
),
rows(unit_code, floor, typology_code, area, status, list_price, entry_amount, installment_count, installment_amount, reinforcement_count, reinforcement_amount, keys_amount) as (
  values
      ('2901', 29, '01', 114.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2902', 29, '02', 103.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2801', 28, '01', 114.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2802', 28, '02', 103.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2701', 27, '01', 114.00, 'reservado', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2702', 27, '02', 103.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2601', 26, '01', 114.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2602', 26, '02', 103.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2501', 25, '01', 114.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2502', 25, '02', 103.00, 'reservado', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2401', 24, '01', 114.00, 'disponivel', 1534995.00, 230249.25, 80, 6139.98, 7, 94292.55, 153499.50),
      ('2402', 24, '02', 103.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2301', 23, '01', 114.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2302', 23, '02', 103.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2201', 22, '01', 114.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2202', 22, '02', 103.00, 'disponivel', 1363950.00, 136395.00, 80, 5046.61, 7, 73312.32, 136395.00),
      ('2101', 21, '01', 114.00, 'disponivel', 1487745.00, 223161.75, 80, 5950.98, 7, 91390.05, 148774.50),
      ('2102', 21, '02', 103.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2001', 20, '01', 114.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2002', 20, '02', 103.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1901', 19, '01', 114.00, 'reservado', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1902', 19, '02', 103.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1801', 18, '01', 114.00, 'disponivel', 1431245.00, 214686.75, 80, 5724.98, 7, 87920.05, 143124.50),
      ('1802', 18, '02', 103.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1701', 17, '01', 114.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1702', 17, '02', 103.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1601', 16, '01', 114.00, 'reservado', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1602', 16, '02', 103.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1501', 15, '01', 114.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1502', 15, '02', 103.00, 'reservado', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1401', 14, '01', 114.00, 'disponivel', 1381745.00, 207261.75, 80, 5526.98, 7, 84881.48, 138174.50),
      ('1402', 14, '02', 103.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1301', 13, '01', 114.00, 'reservado', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1302', 13, '02', 103.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1201', 12, '01', 114.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1202', 12, '02', 103.00, 'reservado', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1101', 11, '01', 114.00, 'disponivel', 1332245.00, 199836.75, 80, 5328.98, 7, 81842.91, 133224.50),
      ('1102', 11, '02', 103.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1001', 10, '01', 114.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1002', 10, '02', 103.00, 'reservado', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('901', 9, '01', 114.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('902', 9, '02', 103.00, 'disponivel', 1189645.00, 118964.50, 80, 4401.69, 7, 63941.64, 118964.50),
      ('801', 8, '01', 114.00, 'reservado', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('802', 8, '02', 103.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('701', 7, '01', 114.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('702', 7, '02', 103.00, 'disponivel', 1149245.00, 114924.50, 80, 4252.24, 7, 61770.70, 114924.50),
      ('601', 6, '01', 114.00, 'reservado', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('602', 6, '02', 103.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('501', 5, '01', 114.00, 'oculto', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('502', 5, '02', 103.00, 'disponivel', 1088645.00, 108864.50, 80, 4028.04, 7, 58513.43, 108864.50)
)
insert into public.development_units (
  organization_id, development_id, typology_id, unit_code, floor, status,
  private_area_m2, list_price, entry_amount, installment_count, installment_amount,
  reinforcement_count, reinforcement_amount, keys_amount, payment_plan, metadata
)
select
  p.organization_id,
  p.development_id,
  t.id,
  r.unit_code,
  r.floor,
  r.status,
  r.area,
  r.list_price,
  r.entry_amount,
  r.installment_count,
  r.installment_amount,
  r.reinforcement_count,
  r.reinforcement_amount,
  r.keys_amount,
  jsonb_build_object(
    'installment_count', r.installment_count,
    'reinforcement_count', r.reinforcement_count,
    'source', 'tabela_fornecida'
  ),
  jsonb_build_object('imported_from_html', true)
from project p
cross join rows r
left join public.development_typologies t
  on t.development_id = p.development_id and t.code = r.typology_code
on conflict (development_id, unit_code) do nothing;

with project as (
  select d.id as development_id, d.organization_id
  from public.developments d
  where d.slug = 'flow-aptos'
    and lower((select o.name from public.organizations o where o.id = d.organization_id)) like 'bossa%'
  limit 1
),
rows(unit_code, floor, typology_code, area, status, list_price, entry_amount, installment_count, installment_amount, reinforcement_count, reinforcement_amount, keys_amount) as (
  values
      ('2301', 23, 'DX01', 117.70, 'disponivel', 1403894.28, 280778.86, 60, 7019.47, 3, 84233.66, 280778.86),
      ('2302D', 23, 'DX23', 94.00, 'disponivel', 1196304.28, 239260.86, 60, 5981.52, 3, 71778.26, 239260.86),
      ('2303D', 23, 'DX23', 94.00, 'disponivel', 1196304.28, 239260.86, 60, 5981.52, 3, 71778.26, 239260.86),
      ('2201', 22, '01', 73.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2101', 21, '01', 73.00, 'disponivel', 1076164.28, 215232.86, 60, 5380.82, 3, 64569.86, 215232.86),
      ('2001', 20, '01', 73.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1901', 19, '01', 73.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1801', 18, '01', 73.00, 'disponivel', 1055364.28, 211072.86, 60, 5276.82, 3, 63321.86, 211072.86),
      ('1701', 17, '01', 73.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1601', 16, '01', 73.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1501', 15, '01', 73.00, 'disponivel', 1024164.28, 204832.86, 60, 5120.82, 3, 61449.86, 204832.86),
      ('1401', 14, '01', 73.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1301', 13, '01', 73.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1201', 12, '01', 73.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1101', 11, '01', 73.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1001', 10, '01', 73.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('901', 9, '01', 73.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('801', 8, '01', 73.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('701', 7, '01', 73.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('601', 6, '01', 73.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('501', 5, '01', 73.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2302', 23, '02', 62.00, 'disponivel', 1005284.28, 201056.86, 60, 5026.42, 3, 60317.06, 201056.86),
      ('2202', 22, '02', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2102', 21, '02', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2002', 20, '02', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1902', 19, '02', 62.00, 'disponivel', 982352.28, 196470.46, 60, 4911.76, 3, 58941.14, 196470.46),
      ('1802', 18, '02', 62.00, 'disponivel', 971952.28, 194390.46, 60, 4859.76, 3, 58317.14, 194390.46),
      ('1702', 17, '02', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1302', 13, '02', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1202', 12, '02', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1102', 11, '02', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1002', 10, '02', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('902', 9, '02', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('802', 8, '02', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('702', 7, '02', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('602', 6, '02', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('502', 5, '02', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2303', 23, '03', 62.00, 'disponivel', 988904.28, 197780.86, 60, 4944.52, 3, 59334.26, 197780.86),
      ('2203', 22, '03', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('2103', 21, '03', 62.00, 'disponivel', 982352.28, 196470.46, 60, 4911.76, 3, 58941.14, 196470.46),
      ('2003', 20, '03', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1903', 19, '03', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1803', 18, '03', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1703', 17, '03', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1303', 13, '03', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1203', 12, '03', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1103', 11, '03', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('1003', 10, '03', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('903', 9, '03', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('803', 8, '03', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('703', 7, '03', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('603', 6, '03', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00),
      ('503', 5, '03', 62.00, 'vendido', 0.00, 0.00, 0, 0.00, 0, 0.00, 0.00)
)
insert into public.development_units (
  organization_id, development_id, typology_id, unit_code, floor, status,
  private_area_m2, list_price, entry_amount, installment_count, installment_amount,
  reinforcement_count, reinforcement_amount, keys_amount, payment_plan, metadata
)
select
  p.organization_id,
  p.development_id,
  t.id,
  r.unit_code,
  r.floor,
  r.status,
  r.area,
  r.list_price,
  r.entry_amount,
  r.installment_count,
  r.installment_amount,
  r.reinforcement_count,
  r.reinforcement_amount,
  r.keys_amount,
  jsonb_build_object(
    'installment_count', r.installment_count,
    'reinforcement_count', r.reinforcement_count,
    'source', 'tabela_fornecida'
  ),
  jsonb_build_object('imported_from_html', true)
from project p
cross join rows r
left join public.development_typologies t
  on t.development_id = p.development_id and t.code = r.typology_code
on conflict (development_id, unit_code) do nothing;

commit;
