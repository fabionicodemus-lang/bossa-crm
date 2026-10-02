
create table if not exists public.broker_after_hours_alert_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  source_message_id uuid references public.messages(id) on delete set null,
  alert_key text not null,
  reason text not null,
  summary text not null,
  broker_name text not null,
  broker_phone text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','cancelled')),
  attempts integer not null default 0,
  whatsapp_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(organization_id,alert_key)
);

alter table public.broker_after_hours_alert_jobs enable row level security;

grant all on public.broker_after_hours_alert_jobs to service_role;

create index if not exists broker_after_hours_alert_jobs_queue_idx
  on public.broker_after_hours_alert_jobs(status,created_at)
  where status='queued';

create index if not exists broker_after_hours_alert_jobs_lead_idx
  on public.broker_after_hours_alert_jobs(lead_id,created_at desc);
