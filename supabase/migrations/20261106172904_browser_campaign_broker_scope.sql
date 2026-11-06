-- A pausa da Nara não impede uma transmissão que o operador selecionou e
-- aprovou. Opt-out explícito, reclassificação e bloqueios de sessão continuam
-- sendo verificados imediatamente antes de cada destinatário.
begin;

create or replace function public.browser_campaign_claim(p_campaign_id uuid, p_worker_id uuid)
returns table (
  recipient_id uuid, lead_name text, phone text, message_text text,
  next_item_index integer, item_count integer, media jsonb
)
language plpgsql security definer set search_path = '' as $$
declare
  v_campaign public.browser_campaigns%rowtype;
  v_lock public.browser_sender_locks%rowtype;
  v_recipient public.browser_campaign_recipients%rowtype;
begin
  if auth.uid() is null or p_worker_id is null then
    raise exception 'Sessão ou identificador de trabalho inválido';
  end if;
  select * into v_campaign from public.browser_campaigns where id = p_campaign_id;
  if not found or not private.can_edit_org(v_campaign.organization_id) then
    raise exception 'Campanha não encontrada ou acesso negado';
  end if;
  if v_campaign.status <> 'running' then return; end if;

  insert into public.browser_sender_locks (organization_id, sender_phone)
    values (v_campaign.organization_id, v_campaign.sender_phone)
    on conflict do nothing;
  select * into v_lock from public.browser_sender_locks
    where organization_id = v_campaign.organization_id and sender_phone = v_campaign.sender_phone
    for update;

  if v_lock.requires_review then return; end if;
  if v_lock.recipient_id is not null then
    if v_lock.heartbeat_at >= now() - interval '3 minutes' then return; end if;
    update public.browser_campaign_recipients
      set status = 'uncertain', detail = 'Sessão interrompida; verificar manualmente no WhatsApp.', finished_at = now()
      where id = v_lock.recipient_id and status = 'claimed';
    update public.browser_sender_locks
      set campaign_id = null, recipient_id = null, worker_id = null,
          operator_id = null, heartbeat_at = null, requires_review = true
      where organization_id = v_campaign.organization_id and sender_phone = v_campaign.sender_phone;
    return;
  end if;

  loop
    select * into v_recipient from public.browser_campaign_recipients r
      where r.campaign_id = p_campaign_id and r.status = 'queued'
      order by r.position limit 1 for update skip locked;
    if not found then
      if not exists (select 1 from public.browser_campaign_recipients
          where campaign_id = p_campaign_id and status in ('queued','claimed','uncertain')) then
        update public.browser_campaigns set status = 'completed', completed_at = now()
          where id = p_campaign_id and status = 'running';
      end if;
      return;
    end if;
    -- Um telefone pausado para a Nara continua permitido aqui; um opt-out
    -- registrado em QUALQUER ficha com esse número continua bloqueando.
    if not exists (
      select 1 from public.leads l where l.id = v_recipient.lead_id
        and l.organization_id = v_campaign.organization_id and l.kind = 'corretor'
        and l.archived_at is null and l.opt_out = false
    ) or exists (
      select 1 from public.leads l where l.organization_id = v_campaign.organization_id
        and l.archived_at is null and l.opt_out = true
        and regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g') = v_recipient.phone
    ) then
      update public.browser_campaign_recipients set status = 'skipped', finished_at = now(),
        detail = 'Contato excluído ou reclassificado no CRM antes do envio.'
        where id = v_recipient.id;
      insert into public.browser_campaign_events
        (organization_id,campaign_id,recipient_id,worker_id,operator_id,item_index,result,detail)
        values (v_campaign.organization_id,p_campaign_id,v_recipient.id,p_worker_id,auth.uid(),0,'skipped',
          'Elegibilidade alterada após a aprovação.');
    else
      exit;
    end if;
  end loop;

  update public.browser_campaign_recipients
    set status = 'claimed', worker_id = p_worker_id, claimed_by = auth.uid(), claimed_at = now()
    where id = v_recipient.id;
  update public.browser_sender_locks
    set campaign_id = p_campaign_id, recipient_id = v_recipient.id,
        worker_id = p_worker_id, operator_id = auth.uid(), heartbeat_at = now(), requires_review = false
    where organization_id = v_campaign.organization_id and sender_phone = v_campaign.sender_phone;

  return query select v_recipient.id, v_recipient.lead_name, v_recipient.phone,
    v_recipient.message_text, v_recipient.next_item_index,
    1 + jsonb_array_length(v_campaign.media), v_campaign.media;
end;
$$;

-- A função mantém as permissões restritas de execução da versão anterior.
revoke all on function public.browser_campaign_claim(uuid,uuid) from public, anon, authenticated;
grant execute on function public.browser_campaign_claim(uuid,uuid) to authenticated;

commit;
