-- One documented WhatsApp detection commits its proposal, items, handoff,
-- activity and immutable receipt together. No human actor is impersonated.
begin;
create table public.commercial_ai_proposal_origins (
 organization_id uuid not null references public.organizations(id),
 origin text not null check(origin='whatsapp_commercial_intelligence'),
 signature text not null,
 proposal_id uuid not null,
 frozen boolean not null default false,
 last_record jsonb not null,
 created_at timestamptz not null default now(),
 primary key(organization_id,origin,signature)
);
create table public.commercial_ai_proposal_detections (
 organization_id uuid not null references public.organizations(id),
 origin text not null check(origin='whatsapp_commercial_intelligence'),
 source_message_id uuid not null,
 signature text not null,
 proposal_id uuid not null,
 proposal_number bigint not null,
 outcome text not null check(outcome in ('created','updated','protected','legacy')),
 source_created_at timestamptz not null,
 source_message_ids jsonb not null,
 confidence numeric not null check(confidence>=0 and confidence<=1),
 analysis jsonb not null,
 proposal_before jsonb,
 proposal_after jsonb not null,
 recorded_at timestamptz not null default now(),
 primary key(organization_id,origin,source_message_id),
 foreign key(organization_id,origin,signature)
  references public.commercial_ai_proposal_origins(organization_id,origin,signature)
);
create index commercial_ai_proposal_detections_proposal on public.commercial_ai_proposal_detections(organization_id,proposal_id,recorded_at);
alter table public.commercial_ai_proposal_origins enable row level security;
alter table public.commercial_ai_proposal_detections enable row level security;
revoke all on public.commercial_ai_proposal_origins,public.commercial_ai_proposal_detections from public,anon,authenticated,service_role;
grant select,insert,update on public.commercial_ai_proposal_origins to service_role;
grant select,insert on public.commercial_ai_proposal_detections to service_role;
create trigger commercial_ai_proposal_detections_immutable before update or delete on public.commercial_ai_proposal_detections
 for each row execute function public.commercial_immutable();

create function public.commercial_record_detected_proposal(
 p_org uuid,p_source uuid,p_signature text,p_data jsonb,p_items jsonb
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare source_row public.messages%rowtype; lead_row public.leads%rowtype;
 origin_row public.commercial_ai_proposal_origins%rowtype;
 prior public.commercial_ai_proposal_detections%rowtype;
 proposal public.proposals%rowtype; before_record jsonb; result_state text;
 dev uuid; unit uuid; unit_code text; total numeric; v_list_price numeric;
 candidate_count integer; evidence_ids jsonb; merged_ids jsonb; item jsonb; item_index integer:=0;
 expected_signature text; v_snapshot jsonb; confidence numeric;
begin
 if current_user<>'service_role' or auth.uid() is not null then
  raise exception 'COMMERCIAL_AI_FORBIDDEN' using errcode='42501'; end if;
 if p_org is null or p_source is null then raise exception 'COMMERCIAL_AI_INVALID' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ai-proposal-source:'||p_org::text||p_source::text,0));
 select * into source_row from public.messages where organization_id=p_org and id=p_source for key share;
 if not found then raise exception 'COMMERCIAL_AI_SOURCE_UNAVAILABLE' using errcode='23514'; end if;
 select * into prior from public.commercial_ai_proposal_detections
  where organization_id=p_org and origin='whatsapp_commercial_intelligence' and source_message_id=p_source;
 if found then return jsonb_build_object('proposalId',prior.proposal_id,'proposalNumber',prior.proposal_number,
  'outcome',prior.outcome,'replayed',true); end if;
 if jsonb_typeof(p_data) is distinct from 'object' or jsonb_typeof(p_items) is distinct from 'array'
  or jsonb_array_length(p_items)>10 or octet_length(p_data::text)+octet_length(p_items::text)>100000
  or exists(select 1 from jsonb_object_keys(p_data) k where k not in
   ('lead_id','development_id','unit_id','list_price','proposed_price','discount_amount',
    'notes','payment_plan','snapshot','broker_company','summary')) then
  raise exception 'COMMERCIAL_AI_INVALID' using errcode='22023'; end if;
 dev:=(p_data->>'development_id')::uuid; unit:=nullif(p_data->>'unit_id','')::uuid;
 total:=(p_data->>'proposed_price')::numeric; v_list_price:=(p_data->>'list_price')::numeric;
 v_snapshot:=p_data->'snapshot'; evidence_ids:=v_snapshot->'source_message_ids';
 confidence:=(v_snapshot->>'auto_confidence')::numeric;
 if dev is null or total is null or total<=0 or total::text='NaN'
  or v_list_price is null or v_list_price<0 or v_list_price::text='NaN'
  or jsonb_typeof(v_snapshot) is distinct from 'object'
  or jsonb_typeof(p_data->'payment_plan') is distinct from 'object'
  or jsonb_typeof(evidence_ids) is distinct from 'array'
  or jsonb_array_length(evidence_ids)<1 or jsonb_array_length(evidence_ids)>45
  or confidence is null or confidence<0.86 or confidence>1 or confidence::text='NaN'
  or v_snapshot->>'source' is distinct from 'whatsapp_commercial_intelligence'
  or v_snapshot->>'auto_detected' is distinct from 'true'
  or v_snapshot->>'workflow_status' is distinct from 'rascunho'
  or nullif(v_snapshot->>'auto_signature','') is distinct from p_signature
  or p_data->>'lead_id' is distinct from source_row.lead_id::text then
  raise exception 'COMMERCIAL_AI_INVALID' using errcode='22023'; end if;
 select * into lead_row from public.leads where organization_id=p_org and id=source_row.lead_id for update;
 if not found or lead_row.kind not in ('cliente','corretor') or lead_row.archived_at is not null then
  raise exception 'COMMERCIAL_AI_CONTACT_UNAVAILABLE' using errcode='23514'; end if;
 if not exists(select 1 from public.developments where organization_id=p_org and id=dev) then
  raise exception 'COMMERCIAL_AI_PRODUCT_UNAVAILABLE' using errcode='23514'; end if;
 if unit is not null then
  select u.unit_code into unit_code from public.development_units u
   where u.organization_id=p_org and u.id=unit and u.development_id=dev;
  if not found then raise exception 'COMMERCIAL_AI_PRODUCT_UNAVAILABLE' using errcode='23514'; end if;
 else unit_code:=v_snapshot->>'unit_code'; end if;
 expected_signature:='whatsapp-auto:'||source_row.lead_id::text||':'||dev::text||':'||coalesce(nullif(unit_code,''),'sem-unidade')
  ||':'||round(total)::text||':'||to_char(source_row.created_at at time zone 'America/Sao_Paulo','YYYY-MM-DD');
 if p_signature is distinct from expected_signature then raise exception 'COMMERCIAL_AI_INVALID_SIGNATURE' using errcode='22023'; end if;
 if not exists(select 1 from jsonb_array_elements_text(evidence_ids) value where value=p_source::text)
  or exists(select 1 from jsonb_array_elements_text(evidence_ids) value
    where not exists(select 1 from public.messages m where m.id=value::uuid and m.organization_id=p_org
      and m.lead_id=source_row.lead_id and m.created_at<=source_row.created_at)) then
  raise exception 'COMMERCIAL_AI_EVIDENCE_UNAVAILABLE' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ai-proposal-signature:'||p_org::text||p_signature,0));
 select * into origin_row from public.commercial_ai_proposal_origins
  where organization_id=p_org and origin='whatsapp_commercial_intelligence' and signature=p_signature for update;
 if not found then
  select count(*) into candidate_count from public.proposals p where p.organization_id=p_org
   and p.lead_id=source_row.lead_id and p.snapshot->>'source'='whatsapp_commercial_intelligence'
   and p.snapshot->>'auto_signature'=p_signature;
  if candidate_count>1 then raise exception 'COMMERCIAL_AI_AMBIGUOUS_LEGACY' using errcode='23514'; end if;
  if candidate_count=1 then
   select * into proposal from public.proposals p where p.organization_id=p_org and p.lead_id=source_row.lead_id
    and p.snapshot->>'source'='whatsapp_commercial_intelligence' and p.snapshot->>'auto_signature'=p_signature for update;
   result_state:='legacy';
  else
   insert into public.proposals(organization_id,development_id,unit_id,lead_id,status,list_price,proposed_price,
    discount_amount,notes,payment_plan,snapshot,created_by,updated_by)
   values(p_org,dev,unit,source_row.lead_id,'rascunho',v_list_price,total,
    coalesce((p_data->>'discount_amount')::numeric,0),p_data->>'notes',p_data->'payment_plan',v_snapshot,null,null)
   returning * into proposal;
   result_state:='created';
  end if;
  insert into public.commercial_ai_proposal_origins(organization_id,origin,signature,proposal_id,frozen,last_record)
   values(p_org,'whatsapp_commercial_intelligence',p_signature,proposal.id,result_state='legacy',to_jsonb(proposal));
 else
  select * into proposal from public.proposals where organization_id=p_org and id=origin_row.proposal_id for update;
  if not found then raise exception 'COMMERCIAL_AI_PROPOSAL_UNAVAILABLE' using errcode='23514'; end if;
  before_record:=to_jsonb(proposal);
  if origin_row.frozen or before_record is distinct from origin_row.last_record
   or proposal.updated_by is not null or proposal.sent_at is not null or proposal.approved_at is not null
   or proposal.status<>'rascunho' or proposal.snapshot->>'source' is distinct from 'whatsapp_commercial_intelligence' then
   result_state:='protected';
  else
   select coalesce(jsonb_agg(distinct value),'[]'::jsonb) into merged_ids from (
    select value from jsonb_array_elements(coalesce(proposal.snapshot->'source_message_ids','[]'::jsonb)) value
    union all select value from jsonb_array_elements(evidence_ids) value
   ) all_ids;
   v_snapshot:=v_snapshot||jsonb_build_object('source_message_ids',merged_ids);
   update public.proposals set list_price=v_list_price,proposed_price=total,
    discount_amount=coalesce((p_data->>'discount_amount')::numeric,0),notes=p_data->>'notes',
    payment_plan=p_data->'payment_plan',snapshot=v_snapshot,version=proposal.version+1
    where organization_id=p_org and id=proposal.id returning * into proposal;
   result_state:='updated';
   update public.commercial_ai_proposal_origins set last_record=to_jsonb(proposal)
    where organization_id=p_org and origin='whatsapp_commercial_intelligence' and signature=p_signature;
  end if;
 end if;
 if result_state in ('created','updated') then
  if result_state='updated' then
   delete from public.proposal_payment_items where organization_id=p_org and proposal_id=proposal.id;
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
   item_index:=item_index+1;
   if jsonb_typeof(item) is distinct from 'object' or item->>'kind' not in
    ('entrada','parcela_ate_chaves','parcela_pos_chaves','reforco_semestral','reforco_anual','chaves','outro')
    or (item->>'quantity')::integer<0 or (item->>'amount')::numeric<0 then
    raise exception 'COMMERCIAL_AI_ITEMS_INVALID' using errcode='22023'; end if;
   insert into public.proposal_payment_items(organization_id,proposal_id,kind,label,quantity,amount,sort_order,metadata)
    values(p_org,proposal.id,item->>'kind',item->>'label',(item->>'quantity')::integer,
     (item->>'amount')::numeric,item_index,coalesce(item->'metadata','{}'::jsonb));
  end loop;
 end if;
 if result_state='created' then
  update public.leads set
   stage=case when stage in ('novo_triagem','qualificacao_ia','nutricao_ativa','passagem_pendente','futuro')
    then 'proposta_negociacao' else stage end,
   enterprise=case when nullif(trim(coalesce(enterprise,'')),'') is null then (select name from public.developments where id=dev) else enterprise end,
   owner_mode='human',ai_enabled=false,automation_paused=true,
   company=case when lead_row.kind='corretor' and nullif(trim(coalesce(p_data->>'broker_company','')),'') is not null
    and (company is null or lower(company) in ('não informada','autônomo')) then p_data->>'broker_company' else company end,
   metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('auto_proposal_detected_at',clock_timestamp(),
    'auto_proposal_signature',p_signature)
   where organization_id=p_org and id=source_row.lead_id;
 end if;
 insert into public.commercial_ai_proposal_detections(organization_id,origin,source_message_id,signature,
  proposal_id,proposal_number,outcome,source_created_at,source_message_ids,confidence,analysis,proposal_before,proposal_after)
 values(p_org,'whatsapp_commercial_intelligence',p_source,p_signature,proposal.id,proposal.proposal_number,
  result_state,source_row.created_at,evidence_ids,confidence,p_data,before_record,to_jsonb(proposal));
 insert into public.activities(organization_id,lead_id,user_id,type,title,description,metadata)
 values(p_org,source_row.lead_id,null,'proposta_detectada_whatsapp',
  'Proposta #'||proposal.proposal_number::text||' detectada no WhatsApp',
  coalesce(nullif(p_data->>'summary',''),'Detecção automática para revisão comercial.'),
  jsonb_build_object('proposal_id',proposal.id,'proposal_number',proposal.proposal_number,
   'auto_signature',p_signature,'source_message_id',p_source,'source_message_ids',evidence_ids,
   'proposal_confidence',confidence,'outcome',result_state,'source','whatsapp_commercial_intelligence'));
 return jsonb_build_object('proposalId',proposal.id,'proposalNumber',proposal.proposal_number,
  'outcome',result_state,'replayed',false);
end; $$;
revoke all on function public.commercial_record_detected_proposal(uuid,uuid,text,jsonb,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.commercial_record_detected_proposal(uuid,uuid,text,jsonb,jsonb) to service_role;
comment on function public.commercial_record_detected_proposal(uuid,uuid,text,jsonb,jsonb) is
 'Service-only, invoker transaction. One immutable detection per organization/origin/source message; machine-owned proposal updates require an unchanged prior record. No human actor or sending/sale fact.';
commit;
