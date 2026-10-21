-- Generated with Supabase CLI 2.121.0 in isolated Actions run 39638501818.
-- No merge, deletion, reclassification or backfill is executed by this migration.
begin;
create index commercial_identity_buyer on public.commercial_opportunities(organization_id,primary_contact_id);
create index commercial_identity_broker on public.commercial_opportunities(organization_id,broker_id) where broker_id is not null;
create index commercial_identity_participant on public.commercial_participants(organization_id,contact_id);
create index commercial_identity_link on public.commercial_link_reviews(organization_id,contact_id);

create function public.commercial_snapshot_has_contact(p_snapshot jsonb,p_contact uuid) returns boolean
language sql immutable security invoker set search_path=public as $$
 select coalesce(p_contact::text in (
  p_snapshot->>'primary_contact_id',p_snapshot->>'broker_id',p_snapshot->>'contact_id',
  p_snapshot->>'lead_id',p_snapshot->>'buyer_id'),false);
$$;
-- Current references AND immutable snapshots: moving a current assignment does not erase its past.
-- Invoker permissions/RLS are retained; no details of evidence are returned to the caller.
create function public.commercial_contact_has_history(p_org uuid,p_contact uuid) returns boolean
language sql stable security invoker set search_path=public as $$
 select p_contact is not null and (
  exists(select 1 from public.commercial_opportunities o where o.organization_id=p_org and (o.primary_contact_id=p_contact or o.broker_id=p_contact))
  or exists(select 1 from public.commercial_participants p where p.organization_id=p_org and p.contact_id=p_contact)
  or exists(select 1 from public.commercial_link_reviews r where r.organization_id=p_org and r.contact_id=p_contact)
  or exists(select 1 from public.commercial_intent_confirmations c where c.organization_id=p_org and
    (c.buyer_id=p_contact or public.commercial_snapshot_has_contact(c.source_snapshot,p_contact)))
  or exists(select 1 from public.commercial_conversation_reviews r where r.organization_id=p_org and r.lead_id=p_contact)
  or exists(select 1 from public.proposals p where p.organization_id=p_org and p.lead_id=p_contact and p.opportunity_id is not null)
  or exists(select 1 from public.agenda_events a where a.organization_id=p_org and a.lead_id=p_contact and a.opportunity_id is not null)
  or exists(select 1 from public.commercial_events e where e.organization_id=p_org and
    (public.commercial_snapshot_has_contact(e.previous_state,p_contact) or public.commercial_snapshot_has_contact(e.new_state,p_contact)))
  or exists(select 1 from public.commercial_proposal_versions v where v.organization_id=p_org and public.commercial_snapshot_has_contact(v.snapshot,p_contact))
 );
$$;

-- Parent row SHARE locks serialize reference validation against kind/organization changes.
-- This closes the check-then-reclassify race; FK locks alone do not protect a non-key kind column.
create function public.commercial_lock_contact_references() returns trigger
language plpgsql security invoker set search_path=public as $$
declare j jsonb:=to_jsonb(new); ids uuid[]; matched integer;
begin
 ids:=case when tg_table_name='commercial_opportunities' then array[new.primary_contact_id,new.broker_id]
  when tg_table_name='commercial_participants' then array[(j->>'contact_id')::uuid]
  else array[nullif(j->>'lead_id','')::uuid] end;
 select array_agg(distinct x) into ids from unnest(ids) x where x is not null;
 if ids is null then return new; end if;
 perform l.id from public.leads l where l.organization_id=new.organization_id and l.id=any(ids) order by l.id for share;
 get diagnostics matched=row_count;
 if matched<>cardinality(ids) then raise exception 'COMMERCIAL_CONTACT_UNAVAILABLE' using errcode='23514'; end if;
 return new;
end; $$;
create trigger commercial_00_lock_contacts before insert or update of organization_id,primary_contact_id,broker_id on public.commercial_opportunities
 for each row execute function public.commercial_lock_contact_references();
create trigger commercial_00_lock_contacts before insert or update of organization_id,contact_id on public.commercial_participants
 for each row execute function public.commercial_lock_contact_references();
create trigger commercial_00_lock_contacts before insert or update of organization_id,lead_id,opportunity_id on public.proposals
 for each row execute function public.commercial_lock_contact_references();
create trigger commercial_00_lock_contacts before insert or update of organization_id,lead_id,opportunity_id on public.agenda_events
 for each row execute function public.commercial_lock_contact_references();

create function public.commercial_protect_contact_identity() returns trigger
language plpgsql security invoker set search_path=public as $$
declare changed boolean:=tg_op='DELETE';
begin
 if tg_op='UPDATE' then changed:=new.id is distinct from old.id or new.organization_id is distinct from old.organization_id
   or new.kind is distinct from old.kind
   or (to_jsonb(new)#>>'{metadata,merged_into}') is distinct from (to_jsonb(old)#>>'{metadata,merged_into}'); end if;
 if changed and public.commercial_contact_has_history(old.organization_id,old.id) then
  raise exception 'COMMERCIAL_HISTORY_PROTECTED' using errcode='23514',hint='Archive the contact without rewriting its commercial identity. A merge requires explicit historical reconciliation.';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
create trigger commercial_identity_guard before delete or update of id,organization_id,kind,metadata on public.leads
 for each row execute function public.commercial_protect_contact_identity();

-- A source in the new ledger/review queue cannot be erased or reassigned to another contact.
-- The FIRST explicit opportunity link is allowed; later relinking remains prohibited.
create function public.commercial_protect_source_identity() returns trigger
language plpgsql security invoker set search_path=public as $$
declare protected boolean; changed boolean:=tg_op='DELETE';
begin
 if tg_op='UPDATE' then
  changed:=new.id is distinct from old.id or new.organization_id is distinct from old.organization_id
    or new.lead_id is distinct from old.lead_id
    or (old.opportunity_id is not null and new.opportunity_id is distinct from old.opportunity_id)
    or (tg_table_name='agenda_events' and (to_jsonb(new)->>'event_type') is distinct from (to_jsonb(old)->>'event_type'));
 end if;
 if not changed then return new; end if;
 protected:=old.opportunity_id is not null
   or exists(select 1 from public.commercial_link_reviews r where r.organization_id=old.organization_id and r.entity_type=tg_table_name and r.entity_id=old.id)
   or exists(select 1 from public.commercial_events e where e.organization_id=old.organization_id and e.entity_type=tg_table_name and e.entity_id=old.id);
 if protected then raise exception 'COMMERCIAL_SOURCE_PROTECTED' using errcode='23514',hint='Cancel rather than delete; review the original identity without moving historical evidence.'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
create trigger commercial_00_source_identity before delete or update of id,organization_id,lead_id,opportunity_id on public.proposals
 for each row execute function public.commercial_protect_source_identity();
create trigger commercial_00_source_identity before delete or update of id,organization_id,lead_id,opportunity_id,event_type on public.agenda_events
 for each row execute function public.commercial_protect_source_identity();

-- Delivery/read receipts, message enrichment and ordinary profile corrections remain allowed.
-- Literal reviewed evidence cannot be edited; other message bodies are not frozen by this rule.
create function public.commercial_protect_communication_identity() returns trigger
language plpgsql security invoker set search_path=public as $$
declare changed boolean:=tg_op='DELETE'; reviewed boolean:=false; next_lead uuid;
begin
 if tg_table_name='messages' then
  reviewed:=exists(select 1 from public.commercial_conversation_reviews r where r.organization_id=old.organization_id and r.message_id=old.id);
 end if;
 if tg_op='UPDATE' then
  changed:=new.id is distinct from old.id or new.organization_id is distinct from old.organization_id
    or new.lead_id is distinct from old.lead_id;
  if tg_table_name='whatsapp_messages' then changed:=changed or (to_jsonb(new)->>'conversation_id') is distinct from (to_jsonb(old)->>'conversation_id'); end if;
  if reviewed and (to_jsonb(new)->>'body') is distinct from (to_jsonb(old)->>'body') then changed:=true; end if;
  next_lead:=new.lead_id;
 end if;
 if changed and (reviewed or public.commercial_contact_has_history(old.organization_id,old.lead_id)
  or (tg_op='UPDATE' and public.commercial_contact_has_history(new.organization_id,next_lead))) then
   raise exception 'COMMERCIAL_EVIDENCE_PROTECTED' using errcode='23514',hint='Keep the message and contact identity used by the commercial history.';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
create trigger commercial_communication_identity before delete or update of id,organization_id,lead_id,body on public.messages
 for each row execute function public.commercial_protect_communication_identity();
create trigger commercial_communication_identity before delete or update of id,organization_id,lead_id,conversation_id on public.whatsapp_messages
 for each row execute function public.commercial_protect_communication_identity();
create trigger commercial_communication_identity before delete or update of id,organization_id,lead_id on public.whatsapp_conversations
 for each row execute function public.commercial_protect_communication_identity();

-- Retain the exact legacy implementation, but remove it from the exposed schema.
-- No new SECURITY DEFINER code is introduced. Only the existing service integration
-- can execute the private legacy routine; normal clients cannot bypass the wrapper.
alter function public.merge_duplicate_lead(uuid,uuid) set schema private;
alter function private.merge_duplicate_lead(uuid,uuid) rename to commercial_legacy_merge_duplicate_lead;
revoke all on function private.commercial_legacy_merge_duplicate_lead(uuid,uuid) from public,anon,authenticated,service_role;
grant usage on schema private to service_role;
grant execute on function private.commercial_legacy_merge_duplicate_lead(uuid,uuid) to service_role;

create function public.commercial_merge_preflight(p_keep uuid,p_dup uuid) returns jsonb
language plpgsql stable security invoker set search_path=public as $$
declare k public.leads%rowtype; d public.leads%rowtype; reason text;
begin
 if p_keep is null or p_dup is null or p_keep=p_dup then reason:='invalid_pair';
 else
  select * into k from public.leads where id=p_keep;
  select * into d from public.leads where id=p_dup;
  if k.id is null or d.id is null then reason:='missing_contact';
  elsif k.organization_id is distinct from d.organization_id then reason:='different_organization';
  elsif nullif(public.lead_phone_key(k.phone),'') is null or public.lead_phone_key(k.phone) is distinct from public.lead_phone_key(d.phone) then reason:='identity_mismatch';
  elsif k.kind is distinct from d.kind then reason:='classification_conflict';
  elsif k.archived_at is not null then reason:='target_archived';
  elsif public.commercial_contact_has_history(k.organization_id,k.id) or public.commercial_contact_has_history(d.organization_id,d.id) then reason:='commercial_history';
  elsif nullif(d.metadata->>'merged_into','') is not null and d.metadata->>'merged_into'<>k.id::text then reason:='already_merged_elsewhere';
  elsif d.metadata->>'merged_into'=k.id::text and d.archived_at is not null then
   return jsonb_build_object('can_merge',true,'already_merged',true);
  end if;
 end if;
 return jsonb_build_object('can_merge',reason is null,'reason',reason,'already_merged',false);
end; $$;

create function public.merge_duplicate_lead(p_keep uuid,p_dup uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare eligibility jsonb;
begin
 -- Fixed lock order, and validation AFTER locks, not before a destructive transfer.
 perform l.id from public.leads l where l.id in (p_keep,p_dup) order by l.id for update;
 eligibility:=public.commercial_merge_preflight(p_keep,p_dup);
 if not coalesce((eligibility->>'can_merge')::boolean,false) then
  return jsonb_build_object('ok',false,'review_required',true,'code','COMMERCIAL_MERGE_REVIEW_REQUIRED',
   'reason',eligibility->>'reason','kept',p_keep,'duplicate',p_dup);
 end if;
 if coalesce((eligibility->>'already_merged')::boolean,false) then
  return jsonb_build_object('ok',true,'kept',p_keep,'archived',p_dup,'idempotent',true);
 end if;
 return private.commercial_legacy_merge_duplicate_lead(p_keep,p_dup);
end; $$;
revoke all on function public.commercial_snapshot_has_contact(jsonb,uuid),public.commercial_contact_has_history(uuid,uuid),
 public.commercial_lock_contact_references(),public.commercial_protect_contact_identity(),public.commercial_protect_source_identity(),public.commercial_protect_communication_identity(),
 public.commercial_merge_preflight(uuid,uuid),public.merge_duplicate_lead(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.commercial_snapshot_has_contact(jsonb,uuid),public.commercial_contact_has_history(uuid,uuid) to authenticated,service_role;
grant execute on function public.commercial_merge_preflight(uuid,uuid),public.merge_duplicate_lead(uuid,uuid) to service_role;
commit;
