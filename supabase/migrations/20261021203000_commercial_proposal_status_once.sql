-- Quick status changes use the existing proposal receipt and durable recovery.
-- Selecting a status is an audit of the choice, not evidence of sending or sale.
begin;
create function public.commercial_proposal_status_once(
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
  raise exception 'COMMERCIAL_SOURCE_CHANGED' using errcode='40001'; end if;
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

-- The legacy proposal trigger labels an entry into stored status "enviada" as
-- proposal_sent. This particular command supplies no sending evidence, even
-- when a human selects that status. Keep its ledger row for audit, pending.
create function public.commercial_quick_status_evidence_guard() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
 if new.entity_type='proposals' and new.event_type='proposal_sent'
  and new.new_state#>>'{commercial_request,payload,data,operation}'='status' then
  new.confirmation:='pending';
  new.evidence:=new.evidence||jsonb_build_object('reason','Status choice is not proof of sending');
 end if;
 return new;
end; $$;
create trigger commercial_quick_status_evidence_guard before insert on public.commercial_events
 for each row execute function public.commercial_quick_status_evidence_guard();
revoke all on function public.commercial_proposal_status_once(uuid,uuid,uuid,timestamptz,integer,text),
 public.commercial_quick_status_evidence_guard() from public,anon,authenticated,service_role;
grant execute on function public.commercial_proposal_status_once(uuid,uuid,uuid,timestamptz,integer,text) to authenticated;
commit;
