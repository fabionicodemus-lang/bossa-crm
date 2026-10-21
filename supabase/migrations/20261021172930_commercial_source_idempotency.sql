-- Generated with Supabase CLI 2.121.0, isolated Actions run 39644177200.
-- Additive only: no historical backfill, merges, external calls or configuration changes.
begin;
alter table public.proposals add column commercial_request jsonb;
alter table public.agenda_events add column commercial_request jsonb;
create table public.commercial_source_requests (
 organization_id uuid not null references public.organizations(id),
 actor_id uuid not null,
 request_id uuid not null,
 entity_type text not null check(entity_type in ('proposals','agenda_events')),
 entity_id uuid not null,
 payload jsonb not null,
 created_at timestamptz not null default now(),
 primary key(organization_id,actor_id,request_id)
);
-- No FK to the source: a deletion must not make a used request available again.
alter table public.commercial_source_requests enable row level security;
revoke all on public.commercial_source_requests from public,anon,authenticated,service_role;
grant select,insert on public.commercial_source_requests to authenticated;
create policy commercial_requests_read on public.commercial_source_requests for select to authenticated
 using(actor_id=(select auth.uid()) and private.can_edit_org(organization_id));
create policy commercial_requests_insert on public.commercial_source_requests for insert to authenticated
 with check(actor_id=(select auth.uid()) and private.can_edit_org(organization_id) and pg_trigger_depth()>0);
create trigger commercial_requests_origin before insert on public.commercial_source_requests
 for each row execute function public.commercial_require_trigger();
create trigger commercial_requests_immutable before update or delete on public.commercial_source_requests
 for each row execute function public.commercial_immutable();

create function public.commercial_capture_source_request() returns trigger
language plpgsql security invoker set search_path=public as $$
declare command jsonb:=new.commercial_request;
begin
 if command is null then return new; end if;
 if tg_op='UPDATE' and command is not distinct from old.commercial_request then return new; end if;
 if auth.uid() is null or not private.can_edit_org(new.organization_id)
  or (command->>'actor')::uuid is distinct from auth.uid()
  or nullif(command->>'id','') is null or jsonb_typeof(command->'payload') is distinct from 'object' then
  raise exception 'COMMERCIAL_REQUEST_INVALID' using errcode='22023';
 end if;
 insert into public.commercial_source_requests(organization_id,actor_id,request_id,entity_type,entity_id,payload)
 values(new.organization_id,auth.uid(),(command->>'id')::uuid,tg_table_name,new.id,command->'payload');
 return new;
end; $$;
create trigger commercial_capture_request after insert or update of commercial_request on public.proposals
 for each row execute function public.commercial_capture_source_request();
create trigger commercial_capture_request after insert or update of commercial_request on public.agenda_events
 for each row execute function public.commercial_capture_source_request();

-- Rechecks current membership and source RLS, not a stored privileged response.
-- A replay returns the CURRENT row without reverting later edits or cancellation.
create function public.commercial_replay_source_request(p_org uuid,p_request uuid,p_type text,p_payload jsonb)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare receipt public.commercial_source_requests%rowtype; record jsonb;
begin
 if auth.uid() is null or not private.can_edit_org(p_org) then
  raise exception 'COMMERCIAL_REQUEST_FORBIDDEN' using errcode='42501'; end if;
 if p_request is null or p_type is null or p_type not in ('proposals','agenda_events')
  or jsonb_typeof(p_payload) is distinct from 'object' then
  raise exception 'COMMERCIAL_REQUEST_INVALID' using errcode='22023'; end if;
 select * into receipt from public.commercial_source_requests
 where organization_id=p_org and actor_id=auth.uid() and request_id=p_request;
 if not found then return null; end if;
 if receipt.entity_type<>p_type or receipt.payload is distinct from p_payload then
  raise exception 'COMMERCIAL_REQUEST_REUSED' using errcode='23505'; end if;
 if p_type='proposals' then
  select to_jsonb(p)-'commercial_request' into record from public.proposals p where p.organization_id=p_org and p.id=receipt.entity_id;
 else
  select to_jsonb(a)-'commercial_request' into record from public.agenda_events a where a.organization_id=p_org and a.id=receipt.entity_id;
 end if;
 if record is null then raise exception 'COMMERCIAL_REQUEST_SOURCE_UNAVAILABLE' using errcode='23514'; end if;
 return jsonb_build_object('replayed',true,'record',record);
end; $$;

create function public.commercial_save_proposal_once(
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
   raise exception 'COMMERCIAL_SOURCE_CHANGED' using errcode='40001'; end if;
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

create function public.commercial_create_agenda_once(p_org uuid,p_request uuid,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare replay jsonb; incoming public.agenda_events%rowtype; row public.agenda_events%rowtype;
begin
 if auth.uid() is null or not private.can_edit_org(p_org) then
  raise exception 'COMMERCIAL_REQUEST_FORBIDDEN' using errcode='42501'; end if;
 if p_request is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>32768
  or exists(select 1 from jsonb_object_keys(p_data) k where k not in
    ('lead_id','assigned_to','title','description','event_type','meeting_mode','location','video_url','starts_at','ends_at')) then
  raise exception 'COMMERCIAL_REQUEST_INVALID' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||auth.uid()::text||p_request::text,0));
 replay:=public.commercial_replay_source_request(p_org,p_request,'agenda_events',p_data);
 if replay is not null then return replay; end if;
 incoming:=jsonb_populate_record(null::public.agenda_events,p_data);
 if nullif(trim(incoming.title),'') is null or incoming.assigned_to is null
  or incoming.starts_at is null or incoming.ends_at is null or not isfinite(incoming.starts_at) or not isfinite(incoming.ends_at)
  or incoming.ends_at<=incoming.starts_at
  or incoming.event_type is null or incoming.event_type not in ('reuniao_cliente','apresentacao','visita','ligacao','tarefa','outro')
  or incoming.meeting_mode is null or incoming.meeting_mode not in ('presencial','video','telefone') then
  raise exception 'COMMERCIAL_REQUEST_INVALID' using errcode='22023'; end if;
 if not exists(select 1 from public.memberships where organization_id=p_org and user_id=incoming.assigned_to) then
  raise exception 'COMMERCIAL_ASSIGNEE_UNAVAILABLE' using errcode='23514'; end if;
 if incoming.lead_id is not null then
  perform id from public.leads where id=incoming.lead_id and organization_id=p_org and archived_at is null for share;
  if not found then raise exception 'COMMERCIAL_CONTACT_UNAVAILABLE' using errcode='23514'; end if;
 end if;
 -- Serializes this human-create path only. Existing exclusion constraints still apply.
 perform pg_advisory_xact_lock(hashtextextended('agenda:'||p_org::text||incoming.assigned_to::text,0));
 if exists(select 1 from public.agenda_events where organization_id=p_org and assigned_to=incoming.assigned_to
  and status='scheduled' and starts_at<incoming.ends_at and ends_at>incoming.starts_at) then
  raise exception 'COMMERCIAL_AGENDA_CONFLICT' using errcode='23P01'; end if;
 insert into public.agenda_events(organization_id,lead_id,assigned_to,created_by,created_by_kind,title,description,
  event_type,meeting_mode,location,video_url,starts_at,ends_at,status,commercial_request)
 values(p_org,incoming.lead_id,incoming.assigned_to,auth.uid(),'human',trim(incoming.title),incoming.description,
  incoming.event_type,incoming.meeting_mode,incoming.location,incoming.video_url,incoming.starts_at,incoming.ends_at,'scheduled',
  jsonb_build_object('id',p_request,'actor',auth.uid(),'payload',p_data)) returning * into row;
 return jsonb_build_object('replayed',false,'record',to_jsonb(row)-'commercial_request');
end; $$;
revoke all on function public.commercial_capture_source_request(),
 public.commercial_replay_source_request(uuid,uuid,text,jsonb),
 public.commercial_save_proposal_once(uuid,uuid,jsonb,jsonb,uuid,timestamptz),
 public.commercial_create_agenda_once(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.commercial_replay_source_request(uuid,uuid,text,jsonb),
 public.commercial_save_proposal_once(uuid,uuid,jsonb,jsonb,uuid,timestamptz),
 public.commercial_create_agenda_once(uuid,uuid,jsonb) to authenticated;
commit;
