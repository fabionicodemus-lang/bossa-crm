-- BOSSA CRM — cache diário de câmbio da Nara (BCB PTAX)

create table if not exists public.nara_fx_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  currency text not null,
  requested_date date not null,
  quote_date date not null,
  quote_at timestamptz not null,
  rate_brl_per_unit numeric(20,8) not null check (rate_brl_per_unit > 0),
  source text not null default 'BCB PTAX',
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, currency, requested_date)
);

alter table public.nara_fx_rates enable row level security;

drop policy if exists nara_fx_rates_select_member on public.nara_fx_rates;
create policy nara_fx_rates_select_member
  on public.nara_fx_rates
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.memberships m
      where m.organization_id = nara_fx_rates.organization_id
        and m.user_id = (select auth.uid())
    )
  );

create index if not exists nara_fx_rates_lookup_idx
  on public.nara_fx_rates(organization_id, currency, requested_date desc);
