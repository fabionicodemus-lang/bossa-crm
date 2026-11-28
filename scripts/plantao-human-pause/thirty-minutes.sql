-- Integration test of real triggers/RPCs. Nothing is sent; all changes roll back.
begin;
do $$
declare
  ch record;
  target uuid;
  state public.leads%rowtype;
  hours jsonb;
  full_schedule jsonb;
  human_time timestamptz;
  count_channels integer := 0;
begin
  select jsonb_agg(true) into hours from generate_series(1,24);
  select jsonb_agg(hours) into full_schedule from generate_series(1,7);
  for ch in select id,organization_id from public.whatsapp_channels where role='corretor' loop
    count_channels:=count_channels+1;
    update public.ai_agent_configs set active=true,schedule=full_schedule
      where organization_id=ch.organization_id and agent='plantao';
    insert into public.leads(organization_id,kind,name,stage,owner_mode,ai_enabled,automation_paused)
      values(ch.organization_id,'corretor','TEST rollback timed pause','proposta_negociacao','human',false,true)
      returning id into target;
    human_time:=now();
    insert into public.messages(organization_id,lead_id,whatsapp_channel_id,direction,sender_kind,body,raw_payload,created_at)
      values(ch.organization_id,target,ch.id,'out','humano','[Áudio]',
        '{"source":"whatsapp_business_app","message_echo":{"type":"audio"}}',human_time);
    select * into state from public.leads where id=target;
    if state.plantao_human_pause_until is distinct from human_time+interval '30 minutes' then
      raise exception 'Human audio did not start thirty-minute pause'; end if;
    if public.resume_plantao_after_human_pause(target) then raise exception 'Resumed too soon'; end if;
    insert into public.messages(organization_id,lead_id,whatsapp_channel_id,direction,sender_kind,body)
      values(ch.organization_id,target,ch.id,'in','lead','Nova mensagem do corretor');
    select * into state from public.leads where id=target;
    if state.plantao_human_pause_until is distinct from human_time+interval '30 minutes'
      or not state.automation_paused then raise exception 'Inbound changed timer or cleared pause'; end if;
    -- At 29m59s: one second remains. At 30m: due exactly now.
    update public.leads set plantao_human_pause_until=now()+interval '1 second' where id=target;
    if public.resume_plantao_after_human_pause(target) then raise exception 'Resumed at 29m59s'; end if;
    update public.leads set plantao_human_pause_until=now() where id=target;
    if not public.resume_plantao_after_human_pause(target) then raise exception 'Did not resume at thirty minutes'; end if;
    select * into state from public.leads where id=target;
    if state.automation_paused or not state.ai_enabled or state.owner_mode<>'ai'
      or state.stage<>'proposta_negociacao' then raise exception 'Resume changed negotiation or remained disabled'; end if;
    if public.resume_plantao_after_human_pause(target) then raise exception 'Resume was not idempotent'; end if;
    insert into public.messages(organization_id,lead_id,whatsapp_channel_id,direction,sender_kind,body)
      values(ch.organization_id,target,ch.id,'in','lead','Mensagem depois da retomada');
    select * into state from public.leads where id=target;
    if not state.ai_enabled or state.stage<>'proposta_negociacao' then raise exception 'Inbound lost resumed negotiation'; end if;
    -- Another human response renews the full timeout, including media.
    insert into public.messages(organization_id,lead_id,whatsapp_channel_id,direction,sender_kind,body)
      values(ch.organization_id,target,ch.id,'out','humano','Vou verificar');
    select * into state from public.leads where id=target;
    if not state.automation_paused or state.ai_enabled
      or state.plantao_human_pause_until<>now()+interval '30 minutes' then raise exception 'Human did not renew pause'; end if;
    update public.leads set plantao_human_pause_until=now() where id=target;
    update public.ai_agent_configs set active=false where organization_id=ch.organization_id and agent='plantao';
    if public.resume_plantao_after_human_pause(target) then raise exception 'Ignored inactive schedule'; end if;
    update public.ai_agent_configs set active=true where organization_id=ch.organization_id and agent='plantao';
    update public.leads set opt_out=true where id=target;
    if public.resume_plantao_after_human_pause(target) then raise exception 'Ignored opt-out'; end if;
    update public.leads set opt_out=false,stage='encerrado' where id=target;
    if public.resume_plantao_after_human_pause(target) then raise exception 'Reopened closed contact'; end if;
    update public.leads set stage='humano_ativo',owner_mode='human',plantao_human_pause_until=null where id=target;
    if public.resume_plantao_after_human_pause(target) then raise exception 'Ignored explicit indefinite pause'; end if;
  end loop;
  if count_channels<>2 then raise exception 'Expected both Plantão channels'; end if;
end $$;
rollback;
select 'PASS: both channels; thirty-minute boundary, human reset, inbound unchanged, negotiation preserved, schedule, opt-out, closed contact, explicit pause; rolled back' as result;
