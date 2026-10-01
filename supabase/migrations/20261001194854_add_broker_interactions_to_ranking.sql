create or replace view public.broker_performance_counts
with (security_invoker=true) as
select l.id as lead_id,l.organization_id,
 coalesce(e.interested_clients,0) as interested_clients,
 coalesce(p.proposals,0)+coalesce(e.unlinked_proposals,0) as proposals,
 coalesce(e.visits_with_clients,0) as visits_with_clients,
 coalesce(e.visits_without_clients,0) as visits_without_clients,
 coalesce(e.units_sold,0)+coalesce(p.units_sold,0) as units_sold,
 coalesce(e.pending,0) as pending,
 j.status as review_status,j.scanned,j.message_count,j.updated_at as reviewed_at,j.unread_media,
 coalesce(i.interactions,0) as interactions
from public.leads l
left join lateral (
 select sum(quantity) filter(where event_type='interested_client' and status='confirmed') as interested_clients,
 count(*) filter(where event_type='proposal' and status='confirmed' and proposal_id is null) as unlinked_proposals,
 count(*) filter(where event_type='visit_with_client' and status='confirmed') as visits_with_clients,
 count(*) filter(where event_type='visit_without_client' and status='confirmed') as visits_without_clients,
 sum(quantity) filter(where event_type='sale' and status='confirmed' and not exists(select 1 from public.proposals p where p.id=broker_business_events.proposal_id and p.snapshot->>'workflow_status'='convertida')) as units_sold,
 count(*) filter(where status='pending') as pending
 from public.broker_business_events
 where lead_id=l.id and organization_id=l.organization_id
) e on true
left join lateral (
 select count(*) filter(where status<>'rascunho') as proposals,
 count(distinct coalesce(unit_id::text,id::text)) filter(where snapshot->>'workflow_status'='convertida') as units_sold
 from public.proposals
 where lead_id=l.id and organization_id=l.organization_id
) p on true
left join public.broker_performance_jobs j on j.lead_id=l.id
left join lateral (
 select count(distinct ((m.created_at at time zone 'America/Sao_Paulo')::date)) as interactions
 from public.messages m
 where m.lead_id=l.id
   and m.organization_id=l.organization_id
   and m.direction='in'
   and m.sender_kind='lead'
) i on true
where l.kind='corretor';

grant select on public.broker_performance_counts to authenticated,service_role;
