-- BOSSA CRM — automação de entrada de leads: alerta interno + primeiro contato da Nara
create table if not exists public.lead_intake_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  alert_enabled boolean not null default true,
  alert_phone text,
  alert_name text,
  alert_channel_id uuid references public.whatsapp_channels(id) on delete set null,
  nara_enabled boolean not null default true,
  nara_channel_id uuid references public.whatsapp_channels(id) on delete set null,
  nara_delay_seconds integer not null default 180 check (nara_delay_seconds between 60 and 3600),
  nara_template_name text not null default 'nara_novo_lead_formulario',
  alert_template_name text not null default 'alerta_novo_lead_bossa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lead_intake_settings enable row level security;

create table if not exists public.lead_intake_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  meta_leadgen_id text not null unique,
  source_label text not null default 'Meta Lead Ads',
  lead_name text,
  lead_phone text,
  alert_due_at timestamptz not null default now(),
  nara_due_at timestamptz not null,
  alert_status text not null default 'queued',
  nara_status text not null default 'queued',
  alert_attempts integer not null default 0,
  nara_attempts integer not null default 0,
  alert_message_id text,
  nara_message_id text,
  alert_error text,
  nara_error text,
  alert_sent_at timestamptz,
  nara_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lead_intake_jobs enable row level security;

create index if not exists lead_intake_jobs_alert_due_idx
  on public.lead_intake_jobs(alert_status, alert_due_at);
create index if not exists lead_intake_jobs_nara_due_idx
  on public.lead_intake_jobs(nara_status, nara_due_at);
create index if not exists lead_intake_jobs_org_idx
  on public.lead_intake_jobs(organization_id, created_at desc);

-- Configuração inicial da Bossa: alerta para o contato do Fábio já cadastrado no CRM,
-- usando o Canal 1 da Nara para o contato com clientes e para o aviso interno.
insert into public.lead_intake_settings (
  organization_id,
  alert_enabled,
  alert_phone,
  alert_name,
  alert_channel_id,
  nara_enabled,
  nara_channel_id,
  nara_delay_seconds
)
select
  o.id,
  true,
  '554788669668',
  'Fábio',
  c.id,
  true,
  c.id,
  180
from public.organizations o
join public.whatsapp_channels c
  on c.organization_id=o.id
 and c.role='cliente'
 and c.status='connected'
where o.slug='bossa-empreendimentos'
   or o.name ilike '%Bossa%'
order by c.updated_at desc
limit 1
on conflict (organization_id) do update set
  alert_phone=excluded.alert_phone,
  alert_name=excluded.alert_name,
  alert_channel_id=excluded.alert_channel_id,
  nara_channel_id=excluded.nara_channel_id,
  nara_delay_seconds=180,
  updated_at=now();

-- Worker de intake a cada minuto. Usa o mesmo segredo já existente no Vault.
create extension if not exists pg_cron;
create extension if not exists pg_net;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'bossa-lead-intake-worker-1min'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
END $$;

select cron.schedule(
  'bossa-lead-intake-worker-1min',
  '* * * * *',
  $cron$
  select net.http_get(
    url := 'https://bossa-crm-phi.vercel.app/api/automation/lead-intake',
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
