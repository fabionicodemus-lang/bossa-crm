-- Nara 24/09 — câmbio diário + reset interno seguro + SLA comercial

create table if not exists public.nara_fx_daily (
  rate_date date not null,
  currency text not null,
  brl_per_currency numeric(18,8) not null,
  source text not null default 'BCB PTAX',
  source_timestamp timestamptz,
  created_at timestamptz not null default now(),
  primary key (rate_date, currency)
);

alter table public.nara_fx_daily enable row level security;

create table if not exists public.nara_internal_numbers (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone text not null,
  label text,
  can_reset boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, phone)
);

alter table public.nara_internal_numbers enable row level security;

create table if not exists public.nara_operational_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  business_timezone text not null default 'America/Sao_Paulo',
  business_days int[] not null default array[1,2,3,4,5],
  business_open time not null default '08:00',
  business_close time not null default '18:00',
  hot_lead_sla_minutes integer not null default 10,
  next_business_open time not null default '08:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nara_operational_settings enable row level security;

insert into public.nara_operational_settings (
  organization_id,business_timezone,business_days,business_open,business_close,hot_lead_sla_minutes,next_business_open
) values (
  'efb563c0-42e2-403c-b86e-15b61a563757',
  'America/Sao_Paulo',
  array[1,2,3,4,5],
  '08:00',
  '18:00',
  10,
  '08:00'
)
on conflict (organization_id) do nothing;

insert into public.nara_internal_numbers (organization_id,phone,label,can_reset) values
  ('efb563c0-42e2-403c-b86e-15b61a563757','554788669668','Fábio',true),
  ('efb563c0-42e2-403c-b86e-15b61a563757','554792657373','Taís / Canal 3',true),
  ('efb563c0-42e2-403c-b86e-15b61a563757','554788056411','Bossa / testes',true)
on conflict (organization_id,phone) do update set
  label=excluded.label,
  can_reset=excluded.can_reset;
