create table if not exists public.meta_lead_ads_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  page_id text not null,
  page_name text,
  app_id text,
  token_encrypted text not null,
  scopes jsonb not null default '[]'::jsonb,
  status text not null default 'connected' check (status in ('connected','error','disconnected')),
  connected_by uuid,
  connected_at timestamptz not null default now(),
  token_expires_at timestamptz,
  last_tested_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.meta_lead_ads_connections enable row level security;

create index if not exists meta_lead_ads_connections_page_idx
  on public.meta_lead_ads_connections(page_id);
