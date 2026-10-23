-- Independent compatibility candidate, derived only from repository SQL.
-- Preserve all13 original commercial migration files and apply this afterwards.
-- An optimistic business conflict must not request native serialization retries.
-- No production execution is authorized by this file. No grants are changed.
begin;

-- Source: supabase/migrations/20261021172930_commercial_source_idempotency.sql, only the business SQLSTATE changes.
do $review$
declare f pg_proc%rowtype;
begin
 select * into f from pg_proc where oid=to_regprocedure('public.commercial_save_proposal_once(uuid,uuid,jsonb,jsonb,uuid,timestamp with time zone)');
 if f.oid is null or f.prosecdef
  or pg_get_function_arguments(f.oid)<>'p_org uuid, p_request uuid, p_data jsonb, p_items jsonb, p_id uuid DEFAULT NULL::uuid, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone'
  or pg_get_function_result(f.oid)<>'jsonb'
  or f.proconfig is distinct from array['search_path=public']::text[]
  or has_function_privilege('anon',f.oid,'EXECUTE')
  or not has_function_privilege('authenticated',f.oid,'EXECUTE')
  or has_function_privilege('service_role',f.oid,'EXECUTE')
  or md5(f.prosrc)not in('64071cb31ff4bd3999ba805668911d24','ccc5e80faefc3c1eadf17091664c4e60')then
  raise exception 'UNREVIEWED_CONFLICT_RPC';
 end if;
end;
$review$;
create or replace function public.commercial_save_proposal_once(
 p_org uuid,p_request uuid,p_data jsonb,p_items jsonb,
 p_id uuid default null,p_expected_updated_at timestamptz default null
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare request_payload jsonb; replay jsonb; row public.proposals%rowtype;
 incoming public.proposals%rowtype; command jsonb; item jsonb; total numeric:=0;
 item_count integer; item_amount numeric; item_interval integer; item_index integer:=0;
begin
 if auth.uid() is null or not private.can_edit_org(p_org) then
  raise exception 'COMMERCIAL_REQUEST_FORBIDDEN' using errcode='42501'; end if;
 if p_request is null or jsonb_typeof(p_data) is distinct from 'object'
  or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>100
  or octet_length(p_data::text)+octet_length(p_items::text)>262144 then
  raise exception 'COMMERCIAL_REQUEST_INVALID' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where k not in
  ('development_id','unit_id','lead_id','status','list_price','proposed_price','discount_amount','valid_until','notes','payment_plan','snapshot')) then
  raise exception 'COMMERCIAL_REQUEST_INVALID' using errcode='22023'; end if;
 request_payload:=jsonb_build_object('data',p_data,'items',p_items,'id',p_id,'expected_updated_at',p_expected_updated_at);
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||auth.uid()::text||p_request::text,0));
 replay:=public.commercial_replay_source_request(p_org,p_request,'proposals',request_payload);
 if replay is not null then return replay; end if;
 incoming:=jsonb_populate_record(null::public.proposals,p_data);
 if incoming.lead_id is null or incoming.development_id is null or incoming.status is null
  or incoming.status not in ('rascunho','enviada','aprovada','recusada','expirada','cancelada')
  or incoming.proposed_price is null or incoming.proposed_price<=0 or incoming.proposed_price::text='NaN'
  or incoming.list_price is null or incoming.list_price<0 or incoming.list_price::text='NaN'
  or incoming.discount_amount is null or incoming.discount_amount::text='NaN'
  or jsonb_typeof(incoming.payment_plan) is distinct from 'object'
  or jsonb_typeof(incoming.snapshot) is distinct from 'object' then
  raise exception 'COMMERCIAL_REQUEST_INVALID' using errcode='22023'; end if;
 -- Validate even an unlinked legacy proposal; do not rely on opportunity-only guards.
 perform id from public.leads where id=incoming.lead_id and organization_id=p_org
  and kind in ('cliente','corretor') and archived_at is null for share;
 if not found then raise exception 'COMMERCIAL_CONTACT_UNAVAILABLE' using errcode='23514'; end if;
 if not exists(select 1 from public.developments where id=incoming.development_id and organization_id=p_org)
  or (incoming.unit_id is not null and not exists(select 1 from public.development_units
    where id=incoming.unit_id and organization_id=p_org and development_id=incoming.development_id)) then
  raise exception 'COMMERCIAL_PRODUCT_UNAVAILABLE' using errcode='23514'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item) is distinct from 'object' then raise exception 'COMMERCIAL_ITEMS_INVALID' using errcode='22023'; end if;
  item_count:=(item->>'quantity')::integer; item_amount:=(item->>'amount')::numeric(16,2);
  item_interval:=nullif(item->>'interval_months','')::integer;
  if item_count is null or item_count<0 or item_amount is null or item_amount<0 or item_amount::text='NaN'
   or (item_interval is not null and item_interval<0)
   or item->>'kind' is null or item->>'kind' not in ('entrada','parcela_ate_chaves','parcela_pos_chaves','reforco_semestral','reforco_anual','chaves','outro') then
   raise exception 'COMMERCIAL_ITEMS_INVALID' using errcode='22023'; end if;
  total:=total+item_count*item_amount;
 end loop;
 if abs(total-incoming.proposed_price)>0.01 then raise exception 'COMMERCIAL_ITEMS_TOTAL_MISMATCH' using errcode='23514'; end if;
 command:=jsonb_build_object('id',p_request,'actor',auth.uid(),'payload',request_payload);
 if p_id is null then
  insert into public.proposals(organization_id,development_id,unit_id,lead_id,status,list_price,proposed_price,
   discount_amount,valid_until,notes,payment_plan,snapshot,created_by,updated_by,commercial_request)
  values(p_org,incoming.development_id,incoming.unit_id,incoming.lead_id,incoming.status,incoming.list_price,
   incoming.proposed_price,incoming.discount_amount,incoming.valid_until,incoming.notes,incoming.payment_plan,
   incoming.snapshot,auth.uid(),auth.uid(),command) returning * into row;
 else
  select * into row from public.proposals where id=p_id and organization_id=p_org for update;
  if not found then raise exception 'COMMERCIAL_REQUEST_SOURCE_UNAVAILABLE' using errcode='23514'; end if;
  if p_expected_updated_at is null or row.updated_at is distinct from p_expected_updated_at then
   raise exception 'COMMERCIAL_SOURCE_CHANGED' using errcode='PT409'; end if;
  update public.proposals set development_id=incoming.development_id,unit_id=incoming.unit_id,
   lead_id=incoming.lead_id,status=incoming.status,list_price=incoming.list_price,proposed_price=incoming.proposed_price,
   discount_amount=incoming.discount_amount,valid_until=incoming.valid_until,notes=incoming.notes,
   payment_plan=incoming.payment_plan,snapshot=incoming.snapshot,updated_by=auth.uid(),
   version=version+1,commercial_request=command where id=p_id and organization_id=p_org returning * into row;
  if not found then raise exception 'COMMERCIAL_REQUEST_FORBIDDEN' using errcode='42501'; end if;
 end if;
 delete from public.proposal_payment_items where proposal_id=row.id and organization_id=p_org;
 for item in select value from jsonb_array_elements(p_items) loop
  item_index:=item_index+1;
  insert into public.proposal_payment_items(organization_id,proposal_id,kind,label,quantity,amount,start_date,interval_months,sort_order,metadata)
  values(p_org,row.id,item->>'kind',item->>'label',(item->>'quantity')::integer,(item->>'amount')::numeric(16,2),
   nullif(item->>'start_date','')::date,nullif(item->>'interval_months','')::integer,item_index,coalesce(item->'metadata','{}'::jsonb));
 end loop;
 insert into public.activities(organization_id,lead_id,user_id,type,title,description,metadata)
 values(p_org,row.lead_id,auth.uid(),'proposta',
  'Proposta #'||row.proposal_number::text||case when p_id is null then ' criada' else ' atualizada' end,
  'Proposta e fluxo de pagamento salvos na mesma transação.',
  coalesce(row.snapshot,'{}'::jsonb)||jsonb_build_object('proposal_id',row.id,'proposal_number',row.proposal_number,'request_id',p_request));
 return jsonb_build_object('replayed',false,'record',to_jsonb(row)-'commercial_request');
end; $$;

-- Source: supabase/migrations/20261021203000_commercial_proposal_status_once.sql, only the business SQLSTATE changes.
do $review$
declare f pg_proc%rowtype;
begin
 select * into f from pg_proc where oid=to_regprocedure('public.commercial_proposal_status_once(uuid,uuid,uuid,timestamp with time zone,integer,text)');
 if f.oid is null or f.prosecdef
  or pg_get_function_arguments(f.oid)<>'p_org uuid, p_request uuid, p_id uuid, p_expected_updated_at timestamp with time zone, p_expected_version integer, p_workflow_status text'
  or pg_get_function_result(f.oid)<>'jsonb'
  or f.proconfig is distinct from array['search_path=public']::text[]
  or has_function_privilege('anon',f.oid,'EXECUTE')
  or not has_function_privilege('authenticated',f.oid,'EXECUTE')
  or has_function_privilege('service_role',f.oid,'EXECUTE')
  or md5(f.prosrc)not in('d0ac4d77a9f2711d2a1c65d11573e14c','f89bdb3a96f4b6a0473198f39fbef739')then
  raise exception 'UNREVIEWED_CONFLICT_RPC';
 end if;
end;
$review$;
create or replace function public.commercial_proposal_status_once(
 p_org uuid,p_request uuid,p_id uuid,p_expected_updated_at timestamptz,
 p_expected_version integer,p_workflow_status text
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare payload jsonb; replay jsonb; row public.proposals%rowtype; stored text;
begin
 if auth.uid() is null or not private.can_edit_org(p_org) then
  raise exception 'COMMERCIAL_REQUEST_FORBIDDEN' using errcode='42501'; end if;
 if p_request is null or p_id is null or p_expected_updated_at is null or p_expected_version is null
  or p_expected_version<1 or p_workflow_status is null or p_workflow_status not in
   ('rascunho','enviada','negociacao','contraproposta','aprovada','recusada','expirada','convertida') then
  raise exception 'COMMERCIAL_REQUEST_INVALID' using errcode='22023'; end if;
 payload:=jsonb_build_object('data',jsonb_build_object('operation','status','workflow_status',p_workflow_status,
  'expected_version',p_expected_version),'items','[]'::jsonb,'id',p_id,'expected_updated_at',p_expected_updated_at);
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||auth.uid()::text||p_request::text,0));
 replay:=public.commercial_replay_source_request(p_org,p_request,'proposals',payload);
 if replay is not null then return replay; end if;
 select * into row from public.proposals where organization_id=p_org and id=p_id for update;
 if not found then raise exception 'COMMERCIAL_REQUEST_SOURCE_UNAVAILABLE' using errcode='23514'; end if;
 if row.version is distinct from p_expected_version or row.updated_at is distinct from p_expected_updated_at then
  raise exception 'COMMERCIAL_SOURCE_CHANGED' using errcode='PT409'; end if;
 if row.lead_id is null or not exists(select 1 from public.leads
   where organization_id=p_org and id=row.lead_id and archived_at is null) then
  raise exception 'COMMERCIAL_CONTACT_UNAVAILABLE' using errcode='23514'; end if;
 if coalesce(row.snapshot->>'workflow_status',case when row.status='cancelada' then 'recusada' else row.status end)
   =p_workflow_status then raise exception 'COMMERCIAL_STATUS_UNCHANGED' using errcode='22023'; end if;
 stored:=case when p_workflow_status in ('negociacao','contraproposta') then 'enviada'
  when p_workflow_status='convertida' then 'aprovada' else p_workflow_status end;
 update public.proposals set status=stored,
  snapshot=coalesce(row.snapshot,'{}'::jsonb)||jsonb_build_object('workflow_status',p_workflow_status),
  updated_by=auth.uid(),version=row.version+1,
  commercial_request=jsonb_build_object('id',p_request,'actor',auth.uid(),'payload',payload)
  where organization_id=p_org and id=p_id returning * into row;
 insert into public.activities(organization_id,lead_id,user_id,type,title,description,metadata)
 values(p_org,row.lead_id,auth.uid(),'proposta',
  'Proposta #'||row.proposal_number::text||': '||case p_workflow_status
   when 'rascunho' then 'Rascunho' when 'enviada' then 'Enviada'
   when 'negociacao' then 'Em negociação' when 'contraproposta' then 'Contraproposta'
   when 'aprovada' then 'Aprovada' when 'recusada' then 'Recusada'
   when 'expirada' then 'Expirada' else 'Convertida em venda' end,
  coalesce(row.snapshot->>'development_name','Empreendimento')||' · '||row.proposed_price::text||'. Esta seleção não comprova envio, assinatura ou recebimento.',
  jsonb_build_object('proposal_id',row.id,'proposal_number',row.proposal_number,
   'workflow_status',p_workflow_status,'request_id',p_request));
 return jsonb_build_object('replayed',false,'record',to_jsonb(row)-'commercial_request');
end; $$;

commit;
