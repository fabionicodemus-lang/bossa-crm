-- Integration regression: the legacy RLS grants allow direct source writes.
-- Organization consistency must also apply before an opportunity is linked.
-- No legacy migration, automation setting or existing data is changed.
begin;
create function public.commercial_source_scope_guard() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare record_json jsonb:=to_jsonb(new); field_name text; relation_name text; linked uuid; matched uuid;
begin
 if tg_op='UPDATE' and new.organization_id is distinct from old.organization_id then
  raise exception 'COMMERCIAL_SOURCE_SCOPE' using errcode='23514',hint='Keep the original organization of commercial sources and installments.';
 end if;
 for field_name,relation_name in select * from (values
  ('lead_id','leads'),('development_id','developments'),('unit_id','development_units'),
  ('proposal_id','proposals'),('opportunity_id','commercial_opportunities')) refs(field_name,relation_name)
 loop
  linked:=nullif(record_json->>field_name,'')::uuid;
  if linked is not null then
   execute format('select id from public.%I where organization_id=$1 and id=$2',relation_name)
    into matched using new.organization_id,linked;
   if matched is null then raise exception 'COMMERCIAL_SOURCE_SCOPE' using errcode='23514'; end if;
  end if;
 end loop;
 if tg_table_name='proposals' and nullif(record_json->>'unit_id','') is not null and not exists(
  select 1 from public.development_units u where u.organization_id=new.organization_id
   and u.id=(record_json->>'unit_id')::uuid and u.development_id=(record_json->>'development_id')::uuid) then
  raise exception 'COMMERCIAL_SOURCE_SCOPE' using errcode='23514';
 end if;
 foreach field_name in array array['created_by','updated_by','assigned_to'] loop
  linked:=nullif(record_json->>field_name,'')::uuid;
  if linked is not null and not exists(select 1 from public.memberships m
   where m.organization_id=new.organization_id and m.user_id=linked) then
   raise exception 'COMMERCIAL_SOURCE_SCOPE' using errcode='23514';
  end if;
 end loop;
 return new;
end; $$;
create trigger commercial_00_source_scope before insert or update on public.proposals
 for each row execute function public.commercial_source_scope_guard();
create trigger commercial_00_source_scope before insert or update on public.proposal_payment_items
 for each row execute function public.commercial_source_scope_guard();
create trigger commercial_00_source_scope before insert or update on public.agenda_events
 for each row execute function public.commercial_source_scope_guard();
revoke all on function public.commercial_source_scope_guard() from public,anon,authenticated,service_role;
comment on function public.commercial_source_scope_guard() is
 'Invoker validation for linked and unlinked proposal/agenda sources and installments. Same-organization references and team assignments; unit must match development. Does not add permissions or infer commercial facts.';
-- The legacy server-only handoff RPC retained PostgreSQL's default PUBLIC
-- EXECUTE grant. Its privileged body must not be callable by browser roles.
revoke all on function public.next_client_handoff_owner(uuid,uuid) from public,anon,authenticated;
grant execute on function public.next_client_handoff_owner(uuid,uuid) to service_role;
alter function public.next_client_handoff_owner(uuid,uuid) set search_path=pg_catalog,public,pg_temp;
commit;
