-- Uma campanha criada pela API oficial pode continuar exatamente a fila
-- pendente de uma campanha pelo navegador, sem reutilizar destinatarios ja
-- observados e sem permitir duas transferencias da mesma origem.
alter table public.broadcasts
  add column if not exists source_browser_campaign_id uuid
    references public.browser_campaigns(id) on delete restrict;

create unique index if not exists broadcasts_source_browser_campaign_uidx
  on public.broadcasts (source_browser_campaign_id)
  where source_browser_campaign_id is not null;

alter table public.broadcast_recipients
  add column if not exists source_browser_recipient_id uuid
    references public.browser_campaign_recipients(id) on delete restrict;

create unique index if not exists broadcast_recipients_source_browser_uidx
  on public.broadcast_recipients (source_browser_recipient_id)
  where source_browser_recipient_id is not null;

alter table public.browser_campaign_standalone_runs
  add column if not exists api_handoff_confirmed_at timestamptz,
  add column if not exists api_handoff_confirmed_by uuid references public.profiles(id);

-- Encerramento exclusivo para migracao. O encerramento normal de uma
-- execucao independente marca todos os nao confirmados como "uncertain".
-- Para a migracao, o operador precisa confirmar que desligou o ChatGPT;
-- somente linhas sem QUALQUER indicio de envio continuam "queued".
-- A espera de uma hora apos o ultimo eco evita perder webhooks em transito.
create or replace function public.browser_campaign_freeze_for_api(p_campaign_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_run public.browser_campaign_standalone_runs%rowtype;
  v_campaign public.browser_campaigns%rowtype;
begin
  if auth.uid() is null then raise exception 'Sessão necessária'; end if;
  -- Mesma ordem de lock do receptor de ecos e do encerramento convencional.
  select * into v_run from public.browser_campaign_standalone_runs
    where campaign_id=p_campaign_id for update;
  if not found or v_run.status<>'active' then
    raise exception 'Nenhuma execução ativa encontrada para congelar';
  end if;
  select * into v_campaign from public.browser_campaigns
    where id=p_campaign_id for update;
  if not found or not private.can_edit_org(v_campaign.organization_id)
    or v_run.organization_id<>v_campaign.organization_id then
    raise exception 'Campanha não encontrada ou acesso negado';
  end if;
  if v_campaign.status<>'running' or v_campaign.consent_confirmed_at is null then
    raise exception 'A campanha deve estar autorizada e em andamento';
  end if;
  if v_run.created_at>now()-interval '1 hour'
    or v_run.last_observed_at>now()-interval '1 hour' then
    raise exception 'Aguarde uma hora após o último envio observado antes de congelar a fila';
  end if;
  if exists(select 1 from public.broadcasts b
    where b.source_browser_campaign_id=p_campaign_id) then
    raise exception 'Esta campanha já foi transferida';
  end if;

  update public.browser_campaign_standalone_runs
    set status='requires_review',api_handoff_confirmed_at=now(),
      api_handoff_confirmed_by=auth.uid() where id=v_run.id;
  update public.browser_campaign_recipients r
    set status='uncertain',finished_at=now(),
      detail='Envio parcial observado antes de congelar a fila para a API; não reenviar.'
    where r.campaign_id=p_campaign_id and r.status='queued' and (
      coalesce(r.next_item_index,0)>0
      or exists(select 1 from public.browser_campaign_echo_receipts e
        where e.recipient_id=r.id)
    );
  update public.browser_campaigns set status='paused'
    where id=p_campaign_id;
  update public.browser_sender_locks
    set requires_review=true,campaign_id=null,recipient_id=null,
      worker_id=null,operator_id=null,heartbeat_at=null
    where organization_id=v_campaign.organization_id
      and sender_phone=v_campaign.sender_phone;
  return true;
end;
$$;
revoke all on function public.browser_campaign_freeze_for_api(uuid) from public,anon,authenticated;
grant execute on function public.browser_campaign_freeze_for_api(uuid) to authenticated;
