-- BOSSA CRM — consumo da IA por lead e por chamada
-- Execute depois de 003_arquivos_ia.sql no SQL Editor do Supabase.

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  request_kind text not null default 'response' check (request_kind in ('summary', 'response')),
  model text not null,
  request_id text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_tokens integer not null default 0 check (cached_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  reasoning_tokens integer not null default 0 check (reasoning_tokens >= 0),
  preflight_input_tokens integer not null default 0 check (preflight_input_tokens >= 0),
  preflight_estimated boolean not null default false,
  estimated_cost_usd numeric(14,8) not null default 0 check (estimated_cost_usd >= 0),
  fallback_used boolean not null default false,
  compacted boolean not null default false,
  long_context boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_logs_lead_created_idx
  on public.ai_usage_logs (lead_id, created_at desc);

create index if not exists ai_usage_logs_org_created_idx
  on public.ai_usage_logs (organization_id, created_at desc);

create unique index if not exists ai_usage_logs_request_uidx
  on public.ai_usage_logs (request_id)
  where request_id is not null and request_id <> '';

alter table public.ai_usage_logs enable row level security;

drop policy if exists ai_usage_logs_select_member on public.ai_usage_logs;
create policy ai_usage_logs_select_member
  on public.ai_usage_logs for select to authenticated
  using (private.is_org_member(organization_id));

grant select on public.ai_usage_logs to authenticated;
