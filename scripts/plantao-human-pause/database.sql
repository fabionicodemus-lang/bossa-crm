-- Integration test: runs against the installed CRM triggers, leaves no rows.
-- No provider call, webhook request or message delivery is performed.
begin;
do $$
declare
  ch record;
  lead_id uuid;
  state public.leads%rowtype;
  hours jsonb;
  full_schedule jsonb;
  channels_tested integer := 0;
begin
  select jsonb_agg(true) into hours from generate_series(1,24);
  select jsonb_agg(hours) into full_schedule from generate_series(1,7);
  for ch in select id,organization_id from public.whatsapp_channels where role='corretor' loop
    channels_tested := channels_tested + 1;
    update public.ai_agent_configs set active=true,schedule=full_schedule
      where organization_id=ch.organization_id and agent='plantao';
    insert into public.leads(organization_id,kind,name,stage,owner_mode,ai_enabled,automation_paused)
      values(ch.organization_id,'corretor','TEST rollback human pause','nutricao_ativa','ai',true,false)
      returning id into lead_id;
    insert into public.messages(organization_id,lead_id,whatsapp_channel_id,direction,sender_kind,body,raw_payload)
      values(ch.organization_id,lead_id,ch.id,'out','humano','[Áudio]',
        '{"source":"whatsapp_business_app","message_echo":{"type":"audio"}}');
    select * into state from public.leads where id=lead_id;
    if not state.automation_paused or state.ai_enabled or state.owner_mode<>'human'
      or state.metadata->>'whatsapp_manual_takeover'<>'true' then
      raise exception 'Human audio did not take over channel %',ch.id;
    end if;
    insert into public.messages(organization_id,lead_id,whatsapp_channel_id,direction,sender_kind,body)
      values(ch.organization_id,lead_id,ch.id,'in','lead','Entendi, obrigado');
    select * into state from public.leads where id=lead_id;
    if not state.automation_paused or state.ai_enabled or state.owner_mode<>'human' then
      raise exception 'Inbound reactivated paused lead in channel %',ch.id;
    end if;
    -- Previous application versions paused without setting metadata.
    update public.leads set metadata='{}' where id=lead_id;
    insert into public.messages(organization_id,lead_id,whatsapp_channel_id,direction,sender_kind,body)
      values(ch.organization_id,lead_id,ch.id,'in','lead','Mais uma mensagem');
    select * into state from public.leads where id=lead_id;
    if not state.automation_paused or state.ai_enabled then
      raise exception 'Legacy pause was cleared';
    end if;
    -- Same fields used by the explicit resume control.
    update public.leads set automation_paused=false,ai_enabled=true,owner_mode='ai',stage='nutricao_ativa',
      metadata=jsonb_build_object('whatsapp_manual_takeover',false) where id=lead_id;
    insert into public.messages(organization_id,lead_id,whatsapp_channel_id,direction,sender_kind,body)
      values(ch.organization_id,lead_id,ch.id,'in','lead','Pode enviar a tabela');
    select * into state from public.leads where id=lead_id;
    if state.automation_paused or not state.ai_enabled or state.owner_mode<>'ai' then
      raise exception 'Explicit resume did not restore AI';
    end if;
    -- Marketing and old history must not take over a conversation.
    insert into public.messages(organization_id,lead_id,whatsapp_channel_id,direction,sender_kind,body,raw_payload)
      values(ch.organization_id,lead_id,ch.id,'out','humano','Campanha teste',
        '{"source":"whatsapp_business_app","browser_campaign_echo":true}'),
        (ch.organization_id,lead_id,ch.id,'out','humano','Histórico teste',
        '{"source":"whatsapp_business_app_history"}');
    select * into state from public.leads where id=lead_id;
    if state.automation_paused or not state.ai_enabled then raise exception 'Campaign/history paused AI'; end if;
    -- Configured hours still apply to a conversation without a manual pause.
    update public.ai_agent_configs set active=false where organization_id=ch.organization_id and agent='plantao';
    insert into public.messages(organization_id,lead_id,whatsapp_channel_id,direction,sender_kind,body)
      values(ch.organization_id,lead_id,ch.id,'in','lead','Fora do horario');
    select * into state from public.leads where id=lead_id;
    if state.ai_enabled then raise exception 'Disabled schedule was ignored'; end if;
  end loop;
  if channels_tested<>2 then raise exception 'Expected two Plantão channels, found %',channels_tested; end if;
end $$;
rollback;
select 'PASS: both channels, human audio, subsequent inbound, legacy pause, explicit resume, campaign/history and schedule; rolled back' as result;
