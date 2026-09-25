-- Junta um lead duplicado no lead original (mesmo contato de WhatsApp).
-- Motivo: celulares brasileiros chegam do WhatsApp sem o nono dígito
-- (ex.: 554799333634) enquanto o formulário da Meta traz com o nono dígito
-- (5547999333634). Antes da correção no código, isso criava dois leads.
--
-- Uso (SQL Editor do Supabase):
--   select public.merge_duplicate_lead('<id do lead original>', '<id do duplicado>');
-- Todo o histórico do duplicado passa para o original e o duplicado é arquivado
-- (não é apagado).

-- Chave para comparar telefones: celular brasileiro sempre sem o nono dígito.
create or replace function public.lead_phone_key(p_phone text)
returns text language sql immutable as $$
  select case
    when d ~ '^55[0-9]{2}9[0-9]{8}$' then substr(d, 1, 4) || substr(d, 6)
    else d
  end
  from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) s;
$$;

create or replace function public.merge_duplicate_lead(p_keep uuid, p_dup uuid)
returns jsonb language plpgsql security invoker as $$
declare
  v_keep public.leads%rowtype;
  v_dup public.leads%rowtype;
  v_moved jsonb := '{}'::jsonb;
  v_count integer;
begin
  if p_keep = p_dup then raise exception 'Os dois IDs são o mesmo lead.'; end if;
  select * into v_keep from public.leads where id = p_keep for update;
  select * into v_dup from public.leads where id = p_dup for update;
  if v_keep.id is null or v_dup.id is null then raise exception 'Lead não encontrado.'; end if;
  if v_keep.organization_id <> v_dup.organization_id then raise exception 'Leads de empresas diferentes.'; end if;
  if public.lead_phone_key(v_keep.phone) <> public.lead_phone_key(v_dup.phone) then
    raise exception 'Os telefones não são do mesmo contato (% x %).', v_keep.phone, v_dup.phone;
  end if;

  -- Tabelas com no máximo um registro por lead: mantém o do original quando existir.
  delete from public.lead_funnel_milestones d
    where d.lead_id = p_dup and exists (select 1 from public.lead_funnel_milestones k where k.lead_id = p_keep);
  update public.lead_funnel_milestones set lead_id = p_keep where lead_id = p_dup;

  delete from public.whatsapp_ai_conversation_memory where lead_id = p_dup
    and exists (select 1 from public.whatsapp_ai_conversation_memory k where k.lead_id = p_keep);
  update public.whatsapp_ai_conversation_memory set lead_id = p_keep where lead_id = p_dup;

  delete from public.broker_human_review_state where lead_id = p_dup
    and exists (select 1 from public.broker_human_review_state k where k.lead_id = p_keep);
  update public.broker_human_review_state set lead_id = p_keep where lead_id = p_dup;

  delete from public.broadcast_recipients d where d.lead_id = p_dup
    and exists (select 1 from public.broadcast_recipients k where k.lead_id = p_keep and k.broadcast_id = d.broadcast_id);

  -- Demais tabelas: todo o histórico passa para o original.
  update public.messages set lead_id = p_keep where lead_id = p_dup;
  get diagnostics v_count = row_count; v_moved := v_moved || jsonb_build_object('messages', v_count);
  update public.whatsapp_messages set lead_id = p_keep where lead_id = p_dup;
  get diagnostics v_count = row_count; v_moved := v_moved || jsonb_build_object('whatsapp_messages', v_count);
  update public.whatsapp_conversations set lead_id = p_keep where lead_id = p_dup;
  update public.activities set lead_id = p_keep where lead_id = p_dup;
  update public.agenda_events set lead_id = p_keep where lead_id = p_dup;
  update public.ai_usage_logs set lead_id = p_keep where lead_id = p_dup;
  update public.broadcast_recipients set lead_id = p_keep where lead_id = p_dup;
  update public.client_handoff_alert_jobs set lead_id = p_keep where lead_id = p_dup;
  update public.lead_handoffs set lead_id = p_keep where lead_id = p_dup;
  update public.lead_intake_jobs set lead_id = p_keep where lead_id = p_dup;
  update public.lead_tasks set lead_id = p_keep where lead_id = p_dup;
  update public.nara_deferred_replies set lead_id = p_keep where lead_id = p_dup;
  update public.nara_followup_sequences set lead_id = p_keep where lead_id = p_dup;
  update public.nara_offer_logs set lead_id = p_keep where lead_id = p_dup;
  update public.proposals set lead_id = p_keep where lead_id = p_dup;

  -- Atualiza o original com o contato mais recente e arquiva o duplicado.
  update public.leads set
    last_inbound_at = greatest(v_keep.last_inbound_at, v_dup.last_inbound_at),
    last_outbound_at = greatest(v_keep.last_outbound_at, v_dup.last_outbound_at),
    email = coalesce(v_keep.email, v_dup.email),
    metadata = coalesce(v_keep.metadata, '{}'::jsonb) || jsonb_build_object(
      'merged_lead_ids', coalesce(v_keep.metadata->'merged_lead_ids', '[]'::jsonb) || to_jsonb(p_dup::text),
      'whatsapp_wa_id_alternativo', v_dup.phone),
    updated_at = now()
  where id = p_keep;

  update public.leads set
    archived_at = now(),
    archived_reason = 'Lead duplicado (mesmo WhatsApp). Histórico transferido para ' || p_keep::text,
    ai_enabled = false,
    automation_paused = true,
    owner_mode = 'none',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('merged_into', p_keep::text),
    updated_at = now()
  where id = p_dup;

  insert into public.activities (organization_id, lead_id, type, title, description, metadata)
  values (v_keep.organization_id, p_keep, 'lead_mesclado', 'Lead duplicado unificado',
    'O contato gerou um segundo lead com o mesmo WhatsApp (' || coalesce(v_dup.phone, '') || '). Todo o histórico foi reunido aqui.',
    jsonb_build_object('duplicate_lead_id', p_dup, 'duplicate_name', v_dup.name));

  return jsonb_build_object('ok', true, 'kept', p_keep, 'archived', p_dup, 'moved', v_moved);
end;
$$;

revoke all on function public.merge_duplicate_lead(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_duplicate_lead(uuid, uuid) to service_role;
