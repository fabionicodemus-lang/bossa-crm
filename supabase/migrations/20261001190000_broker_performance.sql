create table public.broker_business_events (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 lead_id uuid not null references public.leads(id) on delete cascade,
 event_type text not null check(event_type in ('interested_client','proposal','visit_with_client','visit_without_client','sale')),
 event_key text not null,
 status text not null check(status in ('confirmed','pending','cancelled')),
 occurred_on date,
 client_name text,
 development_name text,
 unit_code text,
 quantity integer not null default 1 check(quantity between 1 and 100),
 summary text not null,
 evidence jsonb not null default '[]',
 proposal_id uuid references public.proposals(id) on delete set null,
 confidence numeric not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(lead_id,event_key)
);
create index broker_business_events_org_lead on public.broker_business_events(organization_id,lead_id);
create index broker_business_events_proposal on public.broker_business_events(proposal_id);
alter table public.broker_business_events enable row level security;
create policy broker_business_events_member on public.broker_business_events for select to authenticated using (organization_id in (select organization_id from public.memberships where user_id=(select auth.uid())));
grant select on public.broker_business_events to authenticated;
grant all on public.broker_business_events to service_role;

create table public.broker_performance_jobs (
 lead_id uuid primary key references public.leads(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','running','completed','error')),
 cutoff timestamptz not null default now(),
 message_count bigint not null,
 scanned integer not null default 0,
 unread_media integer not null default 0,
 lease_until timestamptz,
 lease_token uuid,
 attempts integer not null default 0,
 last_error text,
 updated_at timestamptz not null default now()
);
alter table public.broker_performance_jobs enable row level security;
create policy broker_performance_jobs_member on public.broker_performance_jobs for select to authenticated using (organization_id in (select organization_id from public.memberships where user_id=(select auth.uid())));
grant select on public.broker_performance_jobs to authenticated;
grant all on public.broker_performance_jobs to service_role;
create index broker_performance_jobs_status on public.broker_performance_jobs(status,updated_at);

create function public.enqueue_broker_performance() returns bigint language plpgsql security invoker set search_path=public as $$
declare affected bigint;
begin
 insert into broker_performance_jobs(lead_id,organization_id,message_count)
 select l.id,l.organization_id,count(m.id) from leads l join messages m on m.lead_id=l.id and m.organization_id=l.organization_id
 where l.kind='corretor' and m.created_at<=now() group by l.id,l.organization_id
 on conflict(lead_id) do update set status='pending',cutoff=now(),message_count=excluded.message_count,scanned=0,unread_media=0,attempts=0,last_error=null,updated_at=now()
 where broker_performance_jobs.status='completed' and broker_performance_jobs.message_count<>excluded.message_count;
 get diagnostics affected=row_count; return affected;
end $$;
create function public.claim_broker_performance() returns setof public.broker_performance_jobs language sql security invoker set search_path=public as $$
 update broker_performance_jobs set status='running',lease_until=now()+interval '3 minutes',lease_token=gen_random_uuid(),updated_at=now()
 where lead_id=(select lead_id from broker_performance_jobs where status='pending' or (status='running' and lease_until<now()) or (status='error' and attempts<3 and updated_at<now()-interval '2 minutes') order by updated_at,lead_id for update skip locked limit 1) returning *;
$$;
revoke all on function public.enqueue_broker_performance() from public,anon,authenticated;
revoke all on function public.claim_broker_performance() from public,anon,authenticated;
grant execute on function public.enqueue_broker_performance() to service_role;
grant execute on function public.claim_broker_performance() to service_role;

create view public.broker_performance_counts with (security_invoker=true) as
select l.id as lead_id,l.organization_id,
 coalesce(e.interested_clients,0) as interested_clients,
 coalesce(p.proposals,0)+coalesce(e.unlinked_proposals,0) as proposals,
 coalesce(e.visits_with_clients,0) as visits_with_clients,
 coalesce(e.visits_without_clients,0) as visits_without_clients,
 coalesce(e.units_sold,0)+coalesce(p.units_sold,0) as units_sold,
 coalesce(e.pending,0) as pending,
 j.status as review_status,j.scanned,j.message_count,j.updated_at as reviewed_at,j.unread_media
from public.leads l
left join lateral (
 select sum(quantity) filter(where event_type='interested_client' and status='confirmed') as interested_clients,
 count(*) filter(where event_type='proposal' and status='confirmed' and proposal_id is null) as unlinked_proposals,
 count(*) filter(where event_type='visit_with_client' and status='confirmed') as visits_with_clients,
 count(*) filter(where event_type='visit_without_client' and status='confirmed') as visits_without_clients,
 sum(quantity) filter(where event_type='sale' and status='confirmed' and not exists(select 1 from public.proposals p where p.id=broker_business_events.proposal_id and p.snapshot->>'workflow_status'='convertida')) as units_sold,
 count(*) filter(where status='pending') as pending from public.broker_business_events where lead_id=l.id and organization_id=l.organization_id
) e on true
left join lateral (select count(*) filter(where status<>'rascunho') as proposals,count(distinct coalesce(unit_id::text,id::text)) filter(where snapshot->>'workflow_status'='convertida') as units_sold from public.proposals where lead_id=l.id and organization_id=l.organization_id) p on true
left join public.broker_performance_jobs j on j.lead_id=l.id
where l.kind='corretor';
grant select on public.broker_performance_counts to authenticated,service_role;
