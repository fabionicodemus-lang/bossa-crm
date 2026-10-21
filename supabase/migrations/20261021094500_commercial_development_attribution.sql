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
commit;
