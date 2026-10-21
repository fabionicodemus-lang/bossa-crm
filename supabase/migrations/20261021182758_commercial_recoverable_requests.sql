-- Created by Supabase CLI 2.121.0 in isolated Actions run 39652886937.
-- Durable human commands only; no replay worker, external calls or historical backfill.
begin;
create table public.commercial_pending_source_requests (
 organization_id uuid not null references public.organizations(id),
 actor_id uuid not null,
 request_id uuid not null,
 entity_type text not null check(entity_type in ('proposals','agenda_events')),
 payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','acknowledged','abandoned')),
 created_at timestamptz not null default now(),
 closed_at timestamptz,
 primary key(organization_id,actor_id,request_id),
 check((status='pending' and closed_at is null) or (status<>'pending' and closed_at is not null))
);
-- A second tab/device must resolve the first uncertain command, not invent a new key.
create unique index commercial_one_pending_source_request
 on public.commercial_pending_source_requests(organization_id,actor_id,entity_type) where status='pending';
alter table public.commercial_pending_source_requests enable row level security;
revoke all on public.commercial_pending_source_requests from public,anon,authenticated,service_role;
grant select,insert,update on public.commercial_pending_source_requests to authenticated;
create policy commercial_pending_read on public.commercial_pending_source_requests for select to authenticated
 using(actor_id=(select auth.uid()) and private.can_edit_org(organization_id));
create policy commercial_pending_insert on public.commercial_pending_source_requests for insert to authenticated
 with check(actor_id=(select auth.uid()) and private.can_edit_org(organization_id));
create policy commercial_pending_update on public.commercial_pending_source_requests for update to authenticated
 using(actor_id=(select auth.uid()) and private.can_edit_org(organization_id))
 with check(actor_id=(select auth.uid()) and private.can_edit_org(organization_id));

create function public.commercial_normalize_recovery_payload(p_type text,p_payload jsonb)
returns jsonb language plpgsql stable security invoker set search_path=public set timezone='UTC' as $$
begin
 if p_type is null or p_type not in ('proposals','agenda_events') or jsonb_typeof(p_payload) is distinct from 'object'
  or octet_length(p_payload::text)>270000 then raise exception 'COMMERCIAL_RECOVERY_INVALID' using errcode='22023'; end if;
 if p_type='agenda_events' then
  if octet_length(p_payload::text)>32768 or exists(select 1 from jsonb_object_keys(p_payload) k where k not in
   ('lead_id','assigned_to','title','description','event_type','meeting_mode','location','video_url','starts_at','ends_at')) then
   raise exception 'COMMERCIAL_RECOVERY_INVALID' using errcode='22023'; end if;
  return p_payload;
 end if;
 if jsonb_typeof(p_payload->'data') is distinct from 'object' or jsonb_typeof(p_payload->'items') is distinct from 'array'
  or jsonb_array_length(p_payload->'items')>100
  or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('data','items','id','expected_updated_at')) then
  raise exception 'COMMERCIAL_RECOVERY_INVALID' using errcode='22023'; end if;
 return jsonb_build_object('data',p_payload->'data','items',p_payload->'items',
  'id',nullif(p_payload->>'id','')::uuid,'expected_updated_at',nullif(p_payload->>'expected_updated_at','')::timestamptz);
end; $$;

create function public.commercial_pending_source_guard() returns trigger
language plpgsql security invoker set search_path=public as $$
declare receipt public.commercial_source_requests%rowtype;
begin
 if tg_op='DELETE' then raise exception 'COMMERCIAL_RECOVERY_IMMUTABLE'; end if;
 if auth.uid() is null or new.actor_id is distinct from auth.uid() or not private.can_edit_org(new.organization_id) then
  raise exception 'COMMERCIAL_REQUEST_FORBIDDEN' using errcode='42501'; end if;
 if tg_op='UPDATE' and (to_jsonb(new)-'status'-'closed_at') is distinct from (to_jsonb(old)-'status'-'closed_at') then
  raise exception 'COMMERCIAL_RECOVERY_IMMUTABLE'; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text||new.actor_id::text||new.request_id::text,0));
 select * into receipt from public.commercial_source_requests
  where organization_id=new.organization_id and actor_id=new.actor_id and request_id=new.request_id;
 if tg_op='INSERT' then
  if new.status is distinct from 'pending' then raise exception 'COMMERCIAL_RECOVERY_INVALID' using errcode='22023'; end if;
  new.payload:=public.commercial_normalize_recovery_payload(new.entity_type,new.payload);
  if receipt.request_id is not null and (receipt.entity_type<>new.entity_type
    or public.commercial_normalize_recovery_payload(receipt.entity_type,receipt.payload) is distinct from new.payload) then
   raise exception 'COMMERCIAL_REQUEST_REUSED' using errcode='23505'; end if;
  new.created_at:=now(); new.closed_at:=null;
 else
  if new.status=old.status then new.closed_at:=old.closed_at; return new; end if;
  if old.status<>'pending' then raise exception 'COMMERCIAL_RECOVERY_IMMUTABLE'; end if;
  if new.status='acknowledged' and receipt.request_id is null then raise exception 'COMMERCIAL_RECOVERY_NOT_COMMITTED'; end if;
  if new.status='abandoned' and receipt.request_id is not null then raise exception 'COMMERCIAL_RECOVERY_ALREADY_COMMITTED'; end if;
  new.closed_at:=now();
 end if;
 return new;
end; $$;
create trigger commercial_pending_source_guard before insert or update or delete on public.commercial_pending_source_requests
 for each row execute function public.commercial_pending_source_guard();

-- Runs inside the source transaction. Cancelling first must also stop a late
-- call to the OLD save RPC; a successful source write is never silently erased.
create function public.commercial_receipt_recovery_guard() returns trigger
language plpgsql security invoker set search_path=public as $$
declare pending public.commercial_pending_source_requests%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text||new.actor_id::text||new.request_id::text,0));
 select * into pending from public.commercial_pending_source_requests
  where organization_id=new.organization_id and actor_id=new.actor_id and request_id=new.request_id;
 if not found then return new; end if; -- older producers are not silently enabled/migrated
 if pending.status='abandoned' then raise exception 'COMMERCIAL_RECOVERY_ABANDONED' using errcode='23514'; end if;
 if pending.entity_type<>new.entity_type or pending.payload is distinct from
  public.commercial_normalize_recovery_payload(new.entity_type,new.payload) then
  raise exception 'COMMERCIAL_REQUEST_REUSED' using errcode='23505'; end if;
 return new;
end; $$;
create trigger commercial_receipt_recovery_guard before insert on public.commercial_source_requests
 for each row execute function public.commercial_receipt_recovery_guard();

create function public.commercial_prepare_source_request(p_org uuid,p_request uuid,p_type text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare prior public.commercial_pending_source_requests%rowtype; normalized jsonb;
begin
 if auth.uid() is null or not private.can_edit_org(p_org) then raise exception 'COMMERCIAL_REQUEST_FORBIDDEN' using errcode='42501'; end if;
 if p_request is null then raise exception 'COMMERCIAL_RECOVERY_INVALID' using errcode='22023'; end if;
 normalized:=public.commercial_normalize_recovery_payload(p_type,p_payload);
 perform pg_advisory_xact_lock(hashtextextended('prepare:'||p_org::text||auth.uid()::text||p_type,0));
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||auth.uid()::text||p_request::text,0));
 select * into prior from public.commercial_pending_source_requests
  where organization_id=p_org and actor_id=auth.uid() and request_id=p_request;
 if found then
  if prior.entity_type<>p_type or prior.payload is distinct from normalized then
   raise exception 'COMMERCIAL_REQUEST_REUSED' using errcode='23505'; end if;
  if prior.status='abandoned' then raise exception 'COMMERCIAL_RECOVERY_ABANDONED' using errcode='23514'; end if;
  return jsonb_build_object('request_id',p_request,'status',prior.status);
 end if;
 if exists(select 1 from public.commercial_pending_source_requests where organization_id=p_org and actor_id=auth.uid()
  and entity_type=p_type and status='pending') then raise exception 'COMMERCIAL_RECOVERY_PENDING' using errcode='23505'; end if;
 insert into public.commercial_pending_source_requests(organization_id,actor_id,request_id,entity_type,payload)
 values(p_org,auth.uid(),p_request,p_type,normalized);
 return jsonb_build_object('request_id',p_request,'status','pending');
end; $$;

create function public.commercial_get_source_recovery(p_org uuid,p_request uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare pending public.commercial_pending_source_requests%rowtype; receipt public.commercial_source_requests%rowtype; current_record jsonb;
begin
 if auth.uid() is null or not private.can_edit_org(p_org) then raise exception 'COMMERCIAL_REQUEST_FORBIDDEN' using errcode='42501'; end if;
 if p_request is null then raise exception 'COMMERCIAL_RECOVERY_INVALID' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||auth.uid()::text||p_request::text,0));
 select * into pending from public.commercial_pending_source_requests
  where organization_id=p_org and actor_id=auth.uid() and request_id=p_request;
 if not found then raise exception 'COMMERCIAL_RECOVERY_NOT_FOUND' using errcode='22023'; end if;
 select * into receipt from public.commercial_source_requests
  where organization_id=p_org and actor_id=auth.uid() and request_id=p_request;
 if receipt.request_id is not null then
  if pending.entity_type='proposals' then
   select to_jsonb(p)-'commercial_request' into current_record from public.proposals p where organization_id=p_org and id=receipt.entity_id;
  else
   select to_jsonb(a)-'commercial_request' into current_record from public.agenda_events a where organization_id=p_org and id=receipt.entity_id;
  end if;
 end if;
 return jsonb_build_object('request_id',p_request,'entity_type',pending.entity_type,'payload',pending.payload,
  'status',pending.status,'created_at',pending.created_at,'record',current_record,
  'state',case when pending.status<>'pending' then pending.status when receipt.request_id is null then 'pending'
   when current_record is null then 'committed_unavailable' else 'committed' end);
end; $$;

create function public.commercial_finish_source_recovery(p_org uuid,p_request uuid,p_action text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare recovery jsonb;
begin
 if p_action is null or p_action not in ('acknowledge','abandon') then raise exception 'COMMERCIAL_RECOVERY_INVALID' using errcode='22023'; end if;
 -- Same lock and order as the save RPCs: discard cannot race a successful commit.
 recovery:=public.commercial_get_source_recovery(p_org,p_request);
 if recovery->>'status'<>'pending' then return recovery; end if;
 if p_action='acknowledge' and recovery->>'state'='pending' then raise exception 'COMMERCIAL_RECOVERY_NOT_COMMITTED'; end if;
 if p_action='abandon' and recovery->>'state'<>'pending' then return recovery; end if;
 update public.commercial_pending_source_requests
  set status=case when p_action='acknowledge' then 'acknowledged' else 'abandoned' end
  where organization_id=p_org and actor_id=auth.uid() and request_id=p_request;
 return public.commercial_get_source_recovery(p_org,p_request);
end; $$;

revoke all on function public.commercial_normalize_recovery_payload(text,jsonb),public.commercial_pending_source_guard(),
 public.commercial_receipt_recovery_guard(),public.commercial_prepare_source_request(uuid,uuid,text,jsonb),
 public.commercial_get_source_recovery(uuid,uuid),public.commercial_finish_source_recovery(uuid,uuid,text)
 from public,anon,authenticated,service_role;
grant execute on function public.commercial_normalize_recovery_payload(text,jsonb),
 public.commercial_prepare_source_request(uuid,uuid,text,jsonb),public.commercial_get_source_recovery(uuid,uuid),
 public.commercial_finish_source_recovery(uuid,uuid,text) to authenticated;
comment on table public.commercial_pending_source_requests is 'Explicit human save attempts kept server-side. Pending is not evidence of a failed save. Acknowledgment never deletes the source; abandonment prevents a later save using the same key. No automatic replay worker.';
commit;
