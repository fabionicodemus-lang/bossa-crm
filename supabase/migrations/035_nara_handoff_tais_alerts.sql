-- BOSSA CRM — handoff da Nara para Taís + alertas internos por WhatsApp

create table if not exists public.client_handoff_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  primary_owner_user_id uuid references public.profiles(id) on delete set null,
  primary_owner_name text not null default 'Taís',
  primary_owner_alert_phone text,
  manager_user_id uuid references public.profiles(id) on delete set null,
  manager_name text not null default 'Fábio',
  manager_alert_phone text,
  alert_sender_channel_id uuid references public.whatsapp_channels(id) on delete set null,
  alert_template_name text not null default 'alerta_passagem_nara',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_handoff_settings enable row level security;

create table if not exists public.client_handoff_alert_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  handoff_id uuid not null unique references public.lead_handoffs(id) on delete cascade,
  briefing jsonb not null default '{}'::jsonb,
  owner_status text not null default 'queued',
  manager_status text not null default 'queued',
  owner_attempts integer not null default 0,
  manager_attempts integer not null default 0,
  owner_message_id text,
  manager_message_id text,
  owner_error text,
  manager_error text,
  owner_sent_at timestamptz,
  manager_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_handoff_alert_jobs enable row level security;

create index if not exists client_handoff_alert_jobs_org_idx
  on public.client_handoff_alert_jobs(organization_id, created_at desc);
create index if not exists client_handoff_alert_jobs_owner_idx
  on public.client_handoff_alert_jobs(owner_status, created_at);
create index if not exists client_handoff_alert_jobs_manager_idx
  on public.client_handoff_alert_jobs(manager_status, created_at);

insert into public.client_handoff_settings (
  organization_id,
  primary_owner_user_id,
  primary_owner_name,
  primary_owner_alert_phone,
  manager_user_id,
  manager_name,
  manager_alert_phone,
  alert_sender_channel_id,
  alert_template_name,
  enabled
) values (
  'efb563c0-42e2-403c-b86e-15b61a563757',
  'dacb12ce-44e9-489d-a5b0-76f8414a0baf',
  'Taís',
  '554792657373',
  '342a986e-8455-4d0e-973e-36d4b87d9414',
  'Fábio',
  '554788669668',
  '59af2fb9-b5f2-4585-8346-f724ca7852c5',
  'alerta_passagem_nara',
  true
)
on conflict (organization_id) do update set
  primary_owner_user_id = excluded.primary_owner_user_id,
  primary_owner_name = excluded.primary_owner_name,
  primary_owner_alert_phone = excluded.primary_owner_alert_phone,
  manager_user_id = excluded.manager_user_id,
  manager_name = excluded.manager_name,
  manager_alert_phone = excluded.manager_alert_phone,
  alert_sender_channel_id = excluded.alert_sender_channel_id,
  alert_template_name = excluded.alert_template_name,
  enabled = true,
  updated_at = now();

create extension if not exists pg_cron;
create extension if not exists pg_net;

DO $$
DECLARE existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'bossa-handoff-alerts-worker-1min'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
END $$;

select cron.schedule(
  'bossa-handoff-alerts-worker-1min',
  '* * * * *',
  $cron$
  select net.http_get(
    url := 'https://bossa-crm-phi.vercel.app/api/automation/handoff-alerts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'bossa_crm_cron_secret'
        limit 1
      ),
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 45000
  ) as request_id;
  $cron$
);
