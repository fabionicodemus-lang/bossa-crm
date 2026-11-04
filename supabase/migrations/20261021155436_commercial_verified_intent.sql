-- Created with Supabase CLI 2.121.0 in isolated Actions run 39629919284.
-- Human-reviewed intake. Never creates a purchase merely from an AI detection.
begin;
create table public.commercial_intent_confirmations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 entity_type text not null check(entity_type in ('proposals','agenda_events')),
 entity_id uuid not null,
 opportunity_id uuid not null,
 buyer_id uuid not null references public.leads(id),
 intent_title text not null check(length(btrim(intent_title)) between 3 and 200),
 next_action text not null check(length(btrim(next_action)) between 3 and 500),
 evidence text not null check(length(btrim(evidence)) between 20 and 2000),
 source_revision timestamptz not null,
 source_snapshot jsonb not null default '{}',
 confirmed_by uuid not null references public.profiles(id),
 confirmed_at timestamptz not null default now(),
 foreign key(organization_id,opportunity_id) references public.commercial_opportunities(organization_id,id),
 unique(organization_id,entity_type,entity_id),
 unique(organization_id,opportunity_id)
);
alter table public.commercial_intent_confirmations enable row level security;
revoke all on public.commercial_intent_confirmations from public,anon,authenticated,service_role;
grant select,insert on public.commercial_intent_confirmations to authenticated;
grant select on public.commercial_intent_confirmations to service_role;
create policy commercial_intent_read on public.commercial_intent_confirmations for select to authenticated
 using(private.is_org_member(organization_id));
create policy commercial_intent_write on public.commercial_intent_confirmations for insert to authenticated
 with check(private.can_edit_org(organization_id) and confirmed_by=auth.uid());

-- An authorized human may attest intent, but cannot forge actor, clock or source snapshot.
create function public.commercial_intent_validate() returns trigger
language plpgsql security invoker set search_path=public as $$
declare src jsonb; contact jsonb; o public.commercial_opportunities%rowtype;
begin
 if auth.uid() is null or not private.can_edit_org(new.organization_id) then
  raise exception 'INTAKE_FORBIDDEN' using errcode='42501';
 end if;
 if new.entity_type not in ('proposals','agenda_events') then raise exception 'INTAKE_INVALID'; end if;
 select * into o from public.commercial_opportunities where organization_id=new.organization_id and id=new.opportunity_id;
 execute format('select to_jsonb(s) from public.%I s where organization_id=$1 and id=$2 for update',new.entity_type)
  into src using new.organization_id,new.entity_id;
 select to_jsonb(l) into contact from public.leads l
  where l.organization_id=new.organization_id and l.id=nullif(src->>'lead_id','')::uuid;
 if src is null or contact is null or contact->>'archived_at' is not null or o.id is null
   or nullif(src->>'opportunity_id','')::uuid is distinct from new.opportunity_id
   or o.primary_contact_id is distinct from new.buyer_id
   or o.title is distinct from btrim(new.intent_title)
   or o.next_action is distinct from btrim(new.next_action)
   or not exists(select 1 from public.leads l where l.id=new.buyer_id and l.organization_id=new.organization_id and l.kind::text='cliente' and to_jsonb(l)->>'archived_at' is null)
   or not coalesce((contact->>'kind'='cliente' and contact->>'id'=new.buyer_id::text)
        or (contact->>'kind'='corretor' and contact->>'id'=o.broker_id::text),false) then
  raise exception 'INTAKE_INVALID';
 end if;
 new.confirmed_by:=auth.uid(); new.confirmed_at:=now();
 new.intent_title:=btrim(new.intent_title); new.next_action:=btrim(new.next_action); new.evidence:=btrim(new.evidence);
 new.source_snapshot:=src;
 return new;
end; $$;
create trigger commercial_intent_validate before insert on public.commercial_intent_confirmations
 for each row execute function public.commercial_intent_validate();
create trigger commercial_intent_immutable before update or delete on public.commercial_intent_confirmations
 for each row execute function public.commercial_immutable();
create function public.commercial_intent_track() returns trigger
language plpgsql security invoker set search_path=public as $$ begin
 insert into public.commercial_events(organization_id,opportunity_id,event_type,entity_type,entity_id,occurred_at,actor_id,source,external_id,new_state,evidence)
 values(new.organization_id,new.opportunity_id,'intent_confirmed','commercial_intent_confirmations',new.id,new.confirmed_at,new.confirmed_by,
 'verified_intent',new.entity_type||':'||new.entity_id,
 jsonb_build_object('buyer_id',new.buyer_id,'title',new.intent_title),
 jsonb_build_object('source_type',new.entity_type,'source_id',new.entity_id,'review_note',new.evidence));
 return new;
end; $$;
create trigger commercial_intent_track after insert on public.commercial_intent_confirmations
 for each row execute function public.commercial_intent_track();

-- Preserve the identity of the evidence even through writes outside the agenda API.
create function public.commercial_intent_protect_source() returns trigger
language plpgsql security invoker set search_path=public as $$ begin
 if exists(select 1 from public.commercial_intent_confirmations c where c.organization_id=old.organization_id
   and c.entity_type=tg_table_name and c.entity_id=old.id) then
  if tg_op='DELETE' then raise exception 'INTAKE_PRESERVE_SOURCE'; end if;
  if new.organization_id is distinct from old.organization_id or new.lead_id is distinct from old.lead_id
    or new.opportunity_id is distinct from old.opportunity_id then raise exception 'INTAKE_PRESERVE_SOURCE'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
create trigger commercial_01_intent_source before delete or update of organization_id,lead_id,opportunity_id on public.proposals
 for each row execute function public.commercial_intent_protect_source();
create trigger commercial_01_intent_source before delete or update of organization_id,lead_id,opportunity_id on public.agenda_events
 for each row execute function public.commercial_intent_protect_source();

-- Source lock + buyer lock serialize retries and competing intakes for that buyer.
-- All writes roll back if interest validation, linking or audit fails.
create function public.commercial_create_verified_intent(
 p_org uuid,p_entity text,p_source uuid,p_buyer uuid,p_title text,p_next_action text,
 p_evidence text,p_revision timestamptz,p_confirmed boolean default false
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare src jsonb; contact jsonb; buyer jsonb; prior public.commercial_intent_confirmations%rowtype;
 opportunity uuid; broker uuid; development uuid; selected_unit uuid;
begin
 if auth.uid() is null or not private.can_edit_org(p_org) then raise exception 'INTAKE_FORBIDDEN' using errcode='42501'; end if;
 p_title:=btrim(p_title); p_next_action:=btrim(p_next_action); p_evidence:=btrim(p_evidence);
 if p_confirmed is distinct from true or p_entity is null or p_entity not in ('proposals','agenda_events')
   or p_source is null or p_buyer is null or p_revision is null
   or coalesce(length(p_title),0) not between 3 and 200
   or coalesce(length(p_next_action),0) not between 3 and 500
   or coalesce(length(p_evidence),0) not between 20 and 2000 then raise exception 'INTAKE_INVALID'; end if;
 execute format('select to_jsonb(s) from public.%I s where organization_id=$1 and id=$2 for update',p_entity)
  into src using p_org,p_source;
 if src is null then raise exception 'INTAKE_SOURCE_MISSING'; end if;
 select * into prior from public.commercial_intent_confirmations
  where organization_id=p_org and entity_type=p_entity and entity_id=p_source;
 if found then
  if prior.buyer_id is distinct from p_buyer or prior.intent_title is distinct from p_title
    or prior.next_action is distinct from p_next_action or prior.evidence is distinct from p_evidence
    or prior.source_revision is distinct from p_revision
    or nullif(src->>'opportunity_id','')::uuid is distinct from prior.opportunity_id then raise exception 'INTAKE_REPLAY_CONFLICT'; end if;
  return jsonb_build_object('opportunity_id',prior.opportunity_id,'created',false);
 end if;
 if nullif(src->>'opportunity_id','') is not null then raise exception 'INTAKE_ALREADY_LINKED'; end if;
 if nullif(src->>'updated_at','')::timestamptz is distinct from p_revision then raise exception 'INTAKE_STALE'; end if;
 if not exists(select 1 from public.commercial_link_reviews r where r.organization_id=p_org
  and r.entity_type=p_entity and r.entity_id=p_source and r.status='pending') then raise exception 'INTAKE_SOURCE_MISSING'; end if;
 if p_entity='proposals' then
  if coalesce(src->>'status','') not in ('rascunho','enviada','aprovada') then raise exception 'INTAKE_CLOSED'; end if;
 else
  if coalesce(src->>'event_type','') not in ('visita','apresentacao','reuniao_cliente')
    or coalesce(src->>'status','')<>'scheduled' or nullif(src->>'starts_at','') is null
    or (src->>'starts_at')::timestamptz<now() then raise exception 'INTAKE_CLOSED'; end if;
 end if;
 -- Deterministic lead lock order avoids deadlocks when sources identify different contacts.
 perform l.id from public.leads l where l.organization_id=p_org
  and l.id in (p_buyer,nullif(src->>'lead_id','')::uuid) order by l.id for update;
 select to_jsonb(l) into buyer from public.leads l where l.id=p_buyer and l.organization_id=p_org;
 select to_jsonb(l) into contact from public.leads l where l.id=nullif(src->>'lead_id','')::uuid and l.organization_id=p_org;
 if buyer is null or buyer->>'kind' is distinct from 'cliente' or buyer->>'archived_at' is not null
   or contact is null or contact->>'archived_at' is not null then raise exception 'INTAKE_BUYER'; end if;
 if contact->>'kind'='cliente' then
  if contact->>'id' is distinct from p_buyer::text then raise exception 'INTAKE_BUYER'; end if;
 elsif contact->>'kind'='corretor' then broker:=(contact->>'id')::uuid;
 else raise exception 'INTAKE_BUYER'; end if;
 -- Nurture is still an existing intention: do not silently create a second one.
 if exists(select 1 from public.commercial_opportunities o where o.organization_id=p_org and o.stage not in ('lost','signed')
   and (o.primary_contact_id=p_buyer or exists(select 1 from public.commercial_participants cp
    where cp.organization_id=p_org and cp.opportunity_id=o.id and cp.contact_id=p_buyer and cp.role in ('buyer','spouse')))) then
  raise exception 'INTAKE_EXISTING';
 end if;
 insert into public.commercial_opportunities(organization_id,title,primary_contact_id,broker_id,owner_id,stage,next_action,history_complete)
 values(p_org,p_title,p_buyer,broker,auth.uid(),'contact',p_next_action,false) returning id into opportunity;
 if p_entity='proposals' then
  development:=nullif(src->>'development_id','')::uuid; selected_unit:=nullif(src->>'unit_id','')::uuid;
  if development is not null then
   insert into public.commercial_interests(organization_id,opportunity_id,development_id,unit_id,is_primary)
   values(p_org,opportunity,development,selected_unit,true);
  end if;
 end if;
 perform public.commercial_resolve_link(p_org,p_entity,p_source,opportunity);
 insert into public.commercial_intent_confirmations(organization_id,entity_type,entity_id,opportunity_id,buyer_id,
 intent_title,next_action,evidence,source_revision,confirmed_by)
 values(p_org,p_entity,p_source,opportunity,p_buyer,p_title,p_next_action,p_evidence,p_revision,auth.uid());
 return jsonb_build_object('opportunity_id',opportunity,'created',true);
end; $$;
revoke all on function public.commercial_intent_validate(),public.commercial_intent_track(),public.commercial_intent_protect_source(),
 public.commercial_create_verified_intent(uuid,text,uuid,uuid,text,text,text,timestamptz,boolean) from public,anon,authenticated,service_role;
grant execute on function public.commercial_create_verified_intent(uuid,text,uuid,uuid,text,text,text,timestamptz,boolean) to authenticated;
comment on table public.commercial_intent_confirmations is 'Human attestation of a concrete purchase intention. Evidence snapshot is captured by the database. Not proof of sending, qualification, sale or receipt.';
commit;
