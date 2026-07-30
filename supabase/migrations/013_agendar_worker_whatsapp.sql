-- BOSSA CRM — agenda o worker de recuperação dos eventos do WhatsApp
-- Execute DEPOIS de 012_whatsapp_desenvolvedor_direto.sql e do deployment do código.
--
-- ANTES DE EXECUTAR:
-- 1) Na Vercel, configure CRON_SECRET com um valor forte.
-- 2) No Supabase, abra Project Settings / Vault e crie:
--    bossa_crm_whatsapp_worker_url = https://SEU-DOMINIO/api/automation/whatsapp-events
--    bossa_crm_cron_secret         = o mesmo valor de CRON_SECRET da Vercel
-- 3) Não cole o segredo neste arquivo nem o salve no GitHub.

create extension if not exists pg_cron;
create extension if not exists pg_net;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'bossa_crm_whatsapp_worker_url'
  ) THEN
    RAISE EXCEPTION 'Crie no Vault o segredo bossa_crm_whatsapp_worker_url antes de executar este arquivo.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'bossa_crm_cron_secret'
  ) THEN
    RAISE EXCEPTION 'Crie no Vault o segredo bossa_crm_cron_secret antes de executar este arquivo.';
  END IF;
END $$;

-- Remove apenas o job com este nome para permitir reexecução segura.
DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'bossa-whatsapp-events-worker-5min'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
END $$;

select cron.schedule(
  'bossa-whatsapp-events-worker-5min',
  '*/5 * * * *',
  $cron$
  select net.http_get(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'bossa_crm_whatsapp_worker_url'
      limit 1
    ),
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

select jobid, jobname, schedule, active
from cron.job
where jobname = 'bossa-whatsapp-events-worker-5min';
