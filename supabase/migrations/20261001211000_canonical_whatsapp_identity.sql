-- Identidade canônica do WhatsApp: um telefone ativo = um lead ativo.
-- A função de mesclagem preserva o histórico de todos os módulos atuais.

create unique index if not exists leads_org_active_phone_uidx
on public.leads (organization_id, public.lead_phone_key(phone))
where archived_at is null
  and coalesce(public.lead_phone_key(phone),'') <> '';

create or replace function public.merge_duplicate_lead(p_keep uuid, p_dup uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_keep public.leads%rowtype;
  v_dup public.leads%rowtype;
  v_moved jsonb := '{}'::jsonb;
  v_count integer;
  v_next_kommo text;
begin
  if p_keep = p_dup then raise exception 'Os dois IDs são o mesmo lead.'; end if;
  select * into v_keep from public.leads where id = p_keep for update;
  select * into v_dup from public.leads where id = p_dup for update;
  if v_keep.id is null or v_dup.id is null then raise exception 'Lead não encontrado.'; end if;
  if v_keep.organization_id <> v_dup.organization_id then raise exception 'Leads de empresas diferentes.'; end if;
  if public.lead_phone_key(v_keep.phone) <> public.lead_phone_key(v_dup.phone) then
    raise exception 'Os telefones não são do mesmo contato (% x %).', v_keep.phone, v_dup.phone;
  end if;

  delete from public.lead_funnel_milestones d
    where d.lead_id = p_dup and exists (select 1 from public.lead_funnel_milestones k where k.lead_id = p_keep);
  update public.lead_funnel_milestones set lead_id = p_keep where lead_id = p_dup;

  delete from public.whatsapp_ai_conversation_memory d
    where d.lead_id = p_dup and exists (select 1 from public.whatsapp_ai_conversation_memory k where k.lead_id = p_keep);
  update public.whatsapp_ai_conversation_memory set lead_id = p_keep where lead_id = p_dup;

  delete from public.broker_human_review_state d
    where d.lead_id = p_dup and exists (select 1 from public.broker_human_review_state k where k.lead_id = p_keep);
  update public.broker_human_review_state set lead_id = p_keep where lead_id = p_dup;

  delete from public.broker_business_events d
    where d.lead_id = p_dup
      and exists (select 1 from public.broker_business_events k where k.lead_id = p_keep and k.event_key = d.event_key);
  update public.broker_business_events set lead_id = p_keep where lead_id = p_dup;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('broker_business_events', v_count);

  delete from public.broker_performance_jobs d
    where d.lead_id = p_dup and exists (select 1 from public.broker_performance_jobs k where k.lead_id = p_keep);
  update public.broker_performance_jobs set lead_id = p_keep where lead_id = p_dup;

  delete from public.broadcast_recipients d
    where d.lead_id = p_dup
      and exists (select 1 from public.broadcast_recipients k where k.lead_id = p_keep and k.broadcast_id = d.broadcast_id);

  delete from public.lead_handoffs d
    where d.lead_id = p_dup and d.status = 'pending'
      and exists (select 1 from public.lead_handoffs k where k.lead_id = p_keep and k.status = 'pending');

  delete from public.lead_tasks d
    where d.lead_id = p_dup and d.status = 'pending' and d.dedupe_key is not null
      and exists (
        select 1 from public.lead_tasks k
        where k.lead_id = p_keep and k.status = 'pending' and k.dedupe_key = d.dedupe_key
      );

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
  update public.meta_lead_ads_events set lead_id = p_keep where lead_id = p_dup;

  if nullif(v_dup.kommo_id,'') is not null then
    update public.leads
    set kommo_id = null,
        metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('merged_original_kommo_id',v_dup.kommo_id)
    where id = p_dup;
  end if;

  v_next_kommo := v_keep.kommo_id;
  if nullif(v_next_kommo,'') is null and nullif(v_dup.kommo_id,'') is not null then
    if not exists (
      select 1 from public.leads x
      where x.organization_id=v_keep.organization_id
        and x.kind=v_keep.kind
        and x.kommo_id=v_dup.kommo_id
        and x.id not in (p_keep,p_dup)
    ) then
      v_next_kommo := v_dup.kommo_id;
    end if;
  end if;

  update public.leads set
    name = case
      when length(regexp_replace(coalesce(v_keep.name,''), '\\D', '', 'g')) >= 10
       and length(regexp_replace(coalesce(v_dup.name,''), '\\D', '', 'g')) < 10
      then v_dup.name else v_keep.name end,
    first_name = coalesce(v_keep.first_name, v_dup.first_name),
    last_name = coalesce(v_keep.last_name, v_dup.last_name),
    email = coalesce(v_keep.email, v_dup.email),
    enterprise = coalesce(v_keep.enterprise, v_dup.enterprise),
    company = coalesce(v_keep.company, v_dup.company),
    group_name = coalesce(v_keep.group_name, v_dup.group_name),
    creci = coalesce(v_keep.creci, v_dup.creci),
    kommo_id = v_next_kommo,
    owner_id = coalesce(v_keep.owner_id, v_dup.owner_id),
    backup_owner_id = coalesce(v_keep.backup_owner_id, v_dup.backup_owner_id),
    priority_class = coalesce(v_keep.priority_class, v_dup.priority_class),
    last_inbound_at = greatest(v_keep.last_inbound_at, v_dup.last_inbound_at),
    last_outbound_at = greatest(v_keep.last_outbound_at, v_dup.last_outbound_at),
    last_human_activity_at = greatest(v_keep.last_human_activity_at, v_dup.last_human_activity_at),
    last_ai_activity_at = greatest(v_keep.last_ai_activity_at, v_dup.last_ai_activity_at),
    opt_out = coalesce(v_keep.opt_out,false) or coalesce(v_dup.opt_out,false),
    metadata = coalesce(v_dup.metadata, '{}'::jsonb)
      || coalesce(v_keep.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'merged_lead_ids', coalesce(v_keep.metadata->'merged_lead_ids', '[]'::jsonb) || to_jsonb(p_dup::text),
        'merged_kommo_ids', coalesce(v_keep.metadata->'merged_kommo_ids','[]'::jsonb)
          || case when nullif(v_dup.kommo_id,'') is not null then jsonb_build_array(v_dup.kommo_id) else '[]'::jsonb end,
        'whatsapp_wa_id_alternativo', v_dup.phone,
        'last_identity_merge_at', now()
      ),
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
  values (
    v_keep.organization_id,
    p_keep,
    'lead_mesclado',
    'Lead duplicado unificado',
    'O contato gerou outro lead com o mesmo WhatsApp (' || coalesce(v_dup.phone, '') || '). Todo o histórico foi reunido aqui.',
    jsonb_build_object('duplicate_lead_id', p_dup, 'duplicate_name', v_dup.name, 'duplicate_kommo_id', v_dup.kommo_id)
  );

  return jsonb_build_object('ok', true, 'kept', p_keep, 'archived', p_dup, 'moved', v_moved);
end;
$function$;
