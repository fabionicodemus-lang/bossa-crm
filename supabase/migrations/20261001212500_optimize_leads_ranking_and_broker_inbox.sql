create index if not exists messages_broker_interactions_idx
on public.messages (organization_id, lead_id, created_at desc)
where direction='in' and sender_kind='lead' and lead_id is not null;

create index if not exists messages_channel_sender_created_idx
on public.messages (whatsapp_channel_id, sender_kind, created_at desc)
where whatsapp_channel_id is not null;

create or replace view public.broker_performance_counts
with (security_invoker=true) as
with event_counts as (
  select
    organization_id,
    lead_id,
    coalesce(sum(quantity) filter(where event_type='interested_client' and status='confirmed'),0) as interested_clients,
    count(*) filter(where event_type='proposal' and status='confirmed' and proposal_id is null) as unlinked_proposals,
    count(*) filter(where event_type='visit_with_client' and status='confirmed') as visits_with_clients,
    count(*) filter(where event_type='visit_without_client' and status='confirmed') as visits_without_clients,
    coalesce(sum(quantity) filter(
      where event_type='sale'
        and status='confirmed'
        and not exists (
          select 1 from public.proposals p2
          where p2.id=broker_business_events.proposal_id
            and p2.snapshot->>'workflow_status'='convertida'
        )
    ),0) as units_sold,
    count(*) filter(where status='pending') as pending
  from public.broker_business_events
  group by organization_id,lead_id
),
proposal_counts as (
  select
    organization_id,
    lead_id,
    count(*) filter(where status<>'rascunho') as proposals,
    count(distinct coalesce(unit_id::text,id::text)) filter(
      where snapshot->>'workflow_status'='convertida'
    ) as units_sold
  from public.proposals
  where lead_id is not null
  group by organization_id,lead_id
),
interaction_counts as (
  select
    organization_id,
    lead_id,
    count(distinct ((created_at at time zone 'America/Sao_Paulo')::date)) as interactions
  from public.messages
  where lead_id is not null
    and direction='in'
    and sender_kind='lead'
  group by organization_id,lead_id
)
select
  l.id as lead_id,
  l.organization_id,
  coalesce(e.interested_clients,0) as interested_clients,
  coalesce(p.proposals,0)+coalesce(e.unlinked_proposals,0) as proposals,
  coalesce(e.visits_with_clients,0) as visits_with_clients,
  coalesce(e.visits_without_clients,0) as visits_without_clients,
  coalesce(e.units_sold,0)+coalesce(p.units_sold,0) as units_sold,
  coalesce(e.pending,0) as pending,
  j.status as review_status,
  j.scanned,
  j.message_count,
  j.updated_at as reviewed_at,
  j.unread_media,
  coalesce(i.interactions,0) as interactions
from public.leads l
left join event_counts e
  on e.organization_id=l.organization_id and e.lead_id=l.id
left join proposal_counts p
  on p.organization_id=l.organization_id and p.lead_id=l.id
left join public.broker_performance_jobs j
  on j.lead_id=l.id
left join interaction_counts i
  on i.organization_id=l.organization_id and i.lead_id=l.id
where l.kind='corretor'
  and l.archived_at is null;

grant select on public.broker_performance_counts to authenticated,service_role;
