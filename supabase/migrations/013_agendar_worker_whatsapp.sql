-- BOSSA CRM — totais de entrega e worker de recuperação dos eventos do WhatsApp
-- Execute DEPOIS de 012_whatsapp_desenvolvedor_direto.sql e do deployment do código.
--
-- ANTES DE EXECUTAR:
-- 1) Na Vercel, configure CRON_SECRET com um valor forte.
-- 2) No Supabase, abra Project Settings / Vault e crie:
--    bossa_crm_whatsapp_worker_url = https://SEU-DOMINIO/api/automation/whatsapp-events
--    bossa_crm_cron_secret         = o mesmo valor de CRON_SECRET da Vercel
-- 3) Não cole o segredo neste arquivo nem o salve no GitHub.

-- Sempre que a Meta alterar sent/delivered/read/failed de um destinatário,
-- atualiza automaticamente os totais exibidos na transmissão.
create or replace function public.refresh_broadcast_delivery_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_broadcast_id uuid;
begin
  if tg_op = 'DELETE' then
    target_broadcast_id := old.broadcast_id;
  else
    target_broadcast_id := new.broadcast_id;
  end if;

  update public.broadcasts broadcast
  set
    queued_count = totals.queued_count,
    sent_count = totals.sent_count,
    delivered_count = totals.delivered_count,
    read_count = totals.read_count,
    failed_count = totals.failed_count,
    skipped_count = totals.skipped_count,
    updated_at = now()
  from (
    select
      count(*) filter (where status in ('queued', 'sending'))::integer as queued_count,
      count(*) filter (where status = 'sent')::integer as sent_count,
      count(*) filter (where status = 'delivered')::integer as delivered_count,
      count(*) filter (where status = 'read')::integer as read_count,
      count(*) filter (where status = 'failed')::integer as failed_count,
      count(*) filter (where status = 'skipped')::integer as skipped_count
    from public.broadcast_recipients
    where broadcast_id = target_broadcast_id
  ) totals
  where broadcast.id = target_broadcast_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.refresh_broadcast_delivery_counts() from public, anon, authenticated;

drop trigger if exists broadcast_recipients_refresh_delivery_counts on public.broadcast_recipients;
create trigger broadcast_recipients_refresh_delivery_counts
after insert or update of status or delete on public.broadcast_recipients
for each row execute procedure public.refresh_broadcast_delivery_counts();

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
