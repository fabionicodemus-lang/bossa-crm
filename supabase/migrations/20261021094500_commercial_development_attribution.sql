-- Attribute actual proposals and financial facts to the unit's development.
-- An opportunity may have several interests; this must not duplicate a sale.
begin;
create or replace function public.commercial_facts(
 p_org uuid,
 p_filters jsonb default '{}'
)
returns table(metric text,opportunity_id uuid,entity_id uuid,occurred_at timestamptz,amount numeric)
language sql stable security invoker set search_path=public as $$
 with base as (
  select o.* from public.commercial_opportunities o
  where o.organization_id=p_org
   and (nullif(p_filters->>'owner','') is null or o.owner_id=(p_filters->>'owner')::uuid)
   and (nullif(p_filters->>'broker','') is null or o.broker_id=(p_filters->>'broker')::uuid)
   and (nullif(p_filters->>'source','') is null or coalesce(o.source,'unknown')=p_filters->>'source')
 ), interested as (
  select o.* from base o
  where nullif(p_filters->>'development','') is null
   or exists (
    select 1 from public.commercial_interests i
    where i.opportunity_id=o.id
     and i.development_id=(p_filters->>'development')::uuid
   )
 ), facts as (
  select 'new'::text metric,o.id opportunity_id,o.id entity_id,o.created_at occurred_at,0::numeric amount from interested o
  union all
  select 'qualified',e.opportunity_id,e.opportunity_id,min(e.occurred_at),0
   from public.commercial_events e join interested o on o.id=e.opportunity_id
   where e.confirmation='confirmed' and e.new_state->>'stage'='qualified'
    and e.event_type in ('stage_changed','created') group by e.opportunity_id
  union all
  select 'visits',a.opportunity_id,a.id,a.outcome_at,0
   from public.agenda_events a join interested o on o.id=a.opportunity_id
   where a.visit_outcome='completed' and a.visit_kind in ('buyer','remote')
    and a.event_type in ('visita','apresentacao','reuniao_cliente')
    and (nullif(p_filters->>'format','') is null or a.visit_kind=p_filters->>'format')
  union all
  select 'proposals',e.opportunity_id,e.opportunity_id,min(e.occurred_at),0
   from public.commercial_events e join base o on o.id=e.opportunity_id
   where e.event_type='proposal_sent' and e.confirmation='confirmed'
    and (
     nullif(p_filters->>'development','') is null
     or exists (
       select 1 from public.proposals p
       join public.development_units u on u.id=p.unit_id
       where p.id=e.entity_id and p.opportunity_id=e.opportunity_id
        and u.development_id=(p_filters->>'development')::uuid
     )
    )
   group by e.opportunity_id
  union all
  select 'contracts',c.opportunity_id,c.id,c.signed_at,c.amount
   from public.commercial_contracts c join base o on o.id=c.opportunity_id
   where nullif(p_filters->>'development','') is null
    or exists (
     select 1 from public.development_units u
     where u.id=c.unit_id and u.development_id=(p_filters->>'development')::uuid
    )
  union all
  select 'cancellations',c.opportunity_id,c.id,c.cancelled_at,c.amount
   from public.commercial_contracts c join base o on o.id=c.opportunity_id
   where c.cancelled_at is not null
    and (nullif(p_filters->>'development','') is null
     or exists (
      select 1 from public.development_units u
      where u.id=c.unit_id and u.development_id=(p_filters->>'development')::uuid
     ))
  union all
  select 'receipts',c.opportunity_id,r.id,r.received_at,r.amount
   from public.commercial_receipts r
   join public.commercial_contracts c on c.id=r.contract_id
   join base o on o.id=c.opportunity_id
   where r.kind='entry'
    and (nullif(p_filters->>'development','') is null
     or exists (
      select 1 from public.development_units u
      where u.id=c.unit_id and u.development_id=(p_filters->>'development')::uuid
     ))
  union all
  select 'reactivated',e.opportunity_id,e.id,e.occurred_at,0
   from public.commercial_events e join interested o on o.id=e.opportunity_id
   where e.event_type='reactivated' and e.confirmation='confirmed'
 ) select * from facts;
$$;
revoke all on function public.commercial_facts(uuid,jsonb) from public,anon;
grant execute on function public.commercial_facts(uuid,jsonb) to authenticated,service_role;

-- Finished stage transitions only, never guessed from updated_at or legacy stages.
create function public.commercial_stage_durations(
  p_org uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_filters jsonb default '{}'::jsonb
)
returns table(stage text,sample_size bigint,median_hours double precision,p90_hours double precision)
language sql stable security invoker set search_path=public as $$
 with eligible as (
  select o.id from public.commercial_opportunities o
  where o.organization_id=p_org and private.is_org_member(p_org)
   and (nullif(p_filters->>'owner','') is null or o.owner_id=(p_filters->>'owner')::uuid)
   and (nullif(p_filters->>'broker','') is null or o.broker_id=(p_filters->>'broker')::uuid)
   and (nullif(p_filters->>'source','') is null or coalesce(o.source,'unknown')=p_filters->>'source')
   and (nullif(p_filters->>'development','') is null or exists(
     select 1 from public.commercial_interests i
     where i.opportunity_id=o.id
      and i.development_id=(p_filters->>'development')::uuid))
 ), changes as (
  select e.opportunity_id,e.id,e.occurred_at,e.recorded_at,
    e.new_state->>'stage' as stage
  from public.commercial_events e
  join eligible o on o.id=e.opportunity_id
  where e.organization_id=p_org and e.confirmation='confirmed'
   and e.event_type in ('created','stage_changed','reactivated')
   and e.new_state->>'stage' in
    ('new','contact','qualified','visit_scheduled','visit_completed',
     'proposal','negotiation','signed','nurture','lost')
 ), periods as (
  select stage,occurred_at,
   lead(occurred_at) over
     (partition by opportunity_id order by occurred_at,recorded_at,id) as next_at,
   lead(stage) over
     (partition by opportunity_id order by occurred_at,recorded_at,id) as next_stage
  from changes
 )
 select p.stage,count(*)::bigint as sample_size,
  percentile_cont(0.5) within group
    (order by extract(epoch from p.next_at-p.occurred_at)/3600.0)::double precision as median_hours,
  percentile_cont(0.9) within group
    (order by extract(epoch from p.next_at-p.occurred_at)/3600.0)::double precision as p90_hours
 from periods p
 where p.next_at is not null and p.next_at>p.occurred_at
  and p.next_stage is distinct from p.stage
  and p.next_at>=p_start and p.next_at<least(p_end,now())
  and p_end>p_start and p_end-p_start<=interval '367 days'
 group by p.stage order by p.stage;
$$;
revoke all on function public.commercial_stage_durations(uuid,timestamptz,timestamptz,jsonb) from public,anon;
grant execute on function public.commercial_stage_durations(uuid,timestamptz,timestamptz,jsonb)
 to authenticated,service_role;

-- Continuation of this UNAPPLIED draft migration. No backfill, no contact merge,
-- no opportunity creation on handoff and no inferred financial facts.
alter table public.commercial_settings add column auto_link_enabled boolean not null default false;
create table public.commercial_link_reviews (
 organization_id uuid not null references public.organizations(id),
 entity_type text not null check(entity_type in ('proposals','agenda_events')),
 entity_id uuid not null,
 contact_id uuid references public.leads(id),
 initial_reason text not null,
 candidate_count integer not null default 0 check(candidate_count>=0),
 status text not null check(status in ('pending','linked')),
 opportunity_id uuid,
 created_at timestamptz not null default now(),
 resolved_at timestamptz,
 resolved_by uuid,
 primary key(organization_id,entity_type,entity_id),
 foreign key(organization_id,opportunity_id) references public.commercial_opportunities(organization_id,id),
 check((status='pending' and opportunity_id is null and resolved_at is null)
    or (status='linked' and opportunity_id is not null and resolved_at is not null))
);
create index commercial_link_pending on public.commercial_link_reviews(organization_id,status,created_at,entity_id);
alter table public.commercial_link_reviews enable row level security;
revoke all on public.commercial_link_reviews from public,anon,authenticated;
grant select,insert,update on public.commercial_link_reviews to authenticated;
grant select,insert,update on public.commercial_link_reviews to service_role;
create policy commercial_link_read on public.commercial_link_reviews for select to authenticated using(private.is_org_member(organization_id));
create policy commercial_link_insert on public.commercial_link_reviews for insert to authenticated with check(private.can_edit_org(organization_id));
create policy commercial_link_update on public.commercial_link_reviews for update to authenticated using(private.can_edit_org(organization_id)) with check(private.can_edit_org(organization_id));

create function public.commercial_link_review_guard() returns trigger
language plpgsql security invoker set search_path=public as $$ begin
 if tg_op='DELETE' or pg_trigger_depth()<2 then
  raise exception 'Link audit must originate from the source transaction' using errcode='42501';
 end if;
 if tg_op='UPDATE' then
  if (to_jsonb(new)-'status'-'opportunity_id'-'resolved_at'-'resolved_by') is distinct from
     (to_jsonb(old)-'status'-'opportunity_id'-'resolved_at'-'resolved_by')
     or old.opportunity_id is not null then
   raise exception 'Link origin and resolved links are immutable';
  end if;
 end if;
 return new;
end; $$;
create trigger commercial_link_review_guard before insert or update or delete on public.commercial_link_reviews
 for each row execute function public.commercial_link_review_guard();

-- Exact identity only. A known spouse can share a purchase. A broker is a
-- manual candidate source, never an automatically identified buyer.
create function public.commercial_link_candidates(p_org uuid,p_contact uuid)
returns table(id uuid,title text,stage text)
language sql stable security invoker set search_path=public as $$
 select o.id,o.title,o.stage from public.commercial_opportunities o
 join public.leads l on l.id=p_contact and l.organization_id=p_org
 where o.organization_id=p_org and private.is_org_member(p_org)
 and to_jsonb(l)->>'archived_at' is null
 and o.stage not in ('lost','signed','nurture')
 and (
  (l.kind::text='cliente' and (o.primary_contact_id=l.id or exists(
    select 1 from public.commercial_participants p where p.organization_id=p_org
    and p.opportunity_id=o.id and p.contact_id=l.id and p.role in ('buyer','spouse'))))
  or (l.kind::text='corretor' and o.broker_id=l.id)
 ) order by o.created_at,o.id;
$$;

create function public.commercial_link_source() returns trigger
language plpgsql security invoker set search_path=public as $$
declare j jsonb:=to_jsonb(new); contact jsonb; matches uuid[]; reason text:='explicit';
 enabled boolean:=false; n integer:=0; detected boolean:=false;
begin
 if tg_table_name='agenda_events' and coalesce(j->>'event_type','') not in ('visita','apresentacao','reuniao_cliente') then return new; end if;
 if tg_op='UPDATE' then
  if new.opportunity_id is not distinct from old.opportunity_id or new.opportunity_id is null then return new; end if;
  reason:='manual_existing';
 end if;
 if new.lead_id is not null then
  select to_jsonb(l) into contact from public.leads l where l.id=new.lead_id and l.organization_id=new.organization_id;
  if contact is null then raise exception 'Invalid source contact organization' using errcode='23514'; end if;
 end if;
 if new.opportunity_id is null then
  select auto_link_enabled into enabled from public.commercial_settings where organization_id=new.organization_id;
  detected:=coalesce(j#>>'{snapshot,auto_detected}','false')='true'
    or coalesce(j#>>'{snapshot,source}','') in ('broker_performance','whatsapp_commercial_intelligence')
    or coalesce(j->>'created_by_kind','')='ai'
    or coalesce(j#>>'{metadata,source}','')='whatsapp_commercial_intelligence';
  if contact is null then reason:='missing_contact';
  elsif contact->>'archived_at' is not null then reason:='archived_contact';
  elsif contact->>'kind' is distinct from 'cliente' then reason:='buyer_not_identified';
  elsif detected then reason:='automation_review';
  elsif auth.uid() is null then reason:='system_review';
  elsif coalesce(j->>'status','') in ('cancelled','completed','cancelada','recusada','expirada','convertida')
     or (tg_table_name='agenda_events' and nullif(j->>'starts_at','')::timestamptz<now()) then reason:='historical_or_closed';
  else
   select array_agg(c.id) into matches from public.commercial_link_candidates(new.organization_id,new.lead_id) c;
   n:=coalesce(cardinality(matches),0);
   if not coalesce(enabled,false) then reason:='disabled';
   elsif n=0 then reason:='no_candidate';
   elsif n>1 then reason:='ambiguous';
   else new.opportunity_id:=matches[1]; reason:='unique_customer';
   end if;
  end if;
 end if;
 insert into public.commercial_link_reviews(organization_id,entity_type,entity_id,contact_id,
   initial_reason,candidate_count,status,opportunity_id,resolved_at,resolved_by)
 values(new.organization_id,tg_table_name,new.id,new.lead_id,reason,n,
   case when new.opportunity_id is null then 'pending' else 'linked' end,new.opportunity_id,
   case when new.opportunity_id is not null then now() end,
   case when new.opportunity_id is not null then auth.uid() end)
 on conflict(organization_id,entity_type,entity_id) do update
 set status=excluded.status,opportunity_id=excluded.opportunity_id,
   resolved_at=excluded.resolved_at,resolved_by=excluded.resolved_by
 where commercial_link_reviews.opportunity_id is null and excluded.opportunity_id is not null;
 return new;
end; $$;
-- Runs before the existing commercial_validate/commercial_visit_outcome triggers.
create trigger commercial_05_link_source before insert or update of opportunity_id on public.proposals
 for each row execute function public.commercial_link_source();
create trigger commercial_05_link_source before insert or update of opportunity_id on public.agenda_events
 for each row execute function public.commercial_link_source();

-- Explicit review is atomic and idempotent, and cannot steal an existing link.
-- It never changes source status, sends a message, or invents an earlier send.
create function public.commercial_resolve_link(p_org uuid,p_entity text,p_id uuid,p_opportunity uuid)
returns uuid language plpgsql security invoker set search_path=public as $$
declare src jsonb; current_link uuid; contact uuid; affected bigint;
begin
 if auth.uid() is null or not private.can_edit_org(p_org) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_entity not in ('proposals','agenda_events') or p_entity is null then raise exception 'Invalid entity'; end if;
 execute format('select to_jsonb(s) from public.%I s where s.organization_id=$1 and s.id=$2 for update',p_entity)
   into src using p_org,p_id;
 if src is null then raise exception 'Source not found'; end if;
 if p_entity='agenda_events' and coalesce(src->>'event_type','') not in ('visita','apresentacao','reuniao_cliente') then raise exception 'Not a commercial event'; end if;
 current_link:=nullif(src->>'opportunity_id','')::uuid;
 if current_link is not null then
  if current_link is distinct from p_opportunity then raise exception 'Source already linked to another opportunity'; end if;
  return current_link;
 end if;
 contact:=nullif(src->>'lead_id','')::uuid;
 -- Lock the selected purchase against concurrent ownership/stage edits.
 perform 1 from public.commercial_opportunities o where o.organization_id=p_org and o.id=p_opportunity for update;
 if not found or not exists(select 1 from public.commercial_link_candidates(p_org,contact) c where c.id=p_opportunity) then
  raise exception 'Choose an active opportunity of this contact or its documented broker';
 end if;
 execute format('update public.%I set opportunity_id=$1 where organization_id=$2 and id=$3 and opportunity_id is null',p_entity)
   using p_opportunity,p_org,p_id;
 get diagnostics affected = row_count;
 if affected<>1 then raise exception 'Source changed; reload before resolving'; end if;
 return p_opportunity;
end; $$;

-- Existing AI producers use status=enviada for a detected proposal. Even when
-- explicitly linked, a detection is not a proven send and cannot inflate KPIs.
create function public.commercial_detected_proposal_guard() returns trigger
language plpgsql security invoker set search_path=public as $$ begin
 if new.event_type='proposal_sent' and new.entity_type='proposals' and (
  coalesce(new.new_state#>>'{snapshot,auto_detected}','false')='true'
  or coalesce(new.new_state#>>'{snapshot,source}','') in ('broker_performance','whatsapp_commercial_intelligence')
 ) then
  new.confirmation:='pending';
  new.evidence:=new.evidence||jsonb_build_object('reason','AI detection is not confirmed sending');
 end if;
 return new;
end; $$;
create trigger commercial_events_detected_proposal before insert on public.commercial_events
 for each row execute function public.commercial_detected_proposal_guard();

revoke all on function public.commercial_link_candidates(uuid,uuid),public.commercial_resolve_link(uuid,text,uuid,uuid),
 public.commercial_link_source(),public.commercial_link_review_guard(),public.commercial_detected_proposal_guard() from public,anon;
grant execute on function public.commercial_link_candidates(uuid,uuid),public.commercial_resolve_link(uuid,text,uuid,uuid) to authenticated,service_role;
commit;
