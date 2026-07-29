-- BOSSA CRM — Agenda o worker do sistema híbrido de follow-up a cada 5 minutos
-- Execute DEPOIS de 005_sistema_hibrido_followup.sql.
--
-- ANTES DE EXECUTAR:
-- 1) No Supabase, abra Project Settings / Vault e crie os segredos:
--    bossa_crm_worker_url  = https://SEU-DOMINIO/api/automation/followup
--    bossa_crm_cron_secret = o mesmo valor de CRON_SECRET configurado na Vercel
-- 2) Não cole o segredo neste arquivo nem o salve no GitHub.

create extension if not exists pg_cron;
create extension if not exists pg_net;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'bossa_crm_worker_url'
  ) THEN
    RAISE EXCEPTION 'Crie no Vault o segredo bossa_crm_worker_url antes de executar este arquivo.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'bossa_crm_cron_secret'
  ) THEN
    RAISE EXCEPTION 'Crie no Vault o segredo bossa_crm_cron_secret antes de executar este arquivo.';
  END IF;
END $$;

-- O nome é estável: executar novamente atualiza/substitui o mesmo job.
select cron.schedule(
  'bossa-followup-worker-5min',
  '*/5 * * * *',
  $cron$
  select net.http_get(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'bossa_crm_worker_url'
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

-- Conferência:
select jobid, jobname, schedule, active
from cron.job
where jobname = 'bossa-followup-worker-5min';
