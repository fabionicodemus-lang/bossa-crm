begin;
-- One canonical fact set for cards, detail and export. No marketing-derived sales.
create function public.commercial_facts(p_org uuid,p_filters jsonb default '{}')
returns table(metric text,opportunity_id uuid,entity_id uuid,occurred_at timestamptz,amount numeric)
language sql stable security invoker set search_path=public as $$
 with scoped as (
  select o.* from commercial_opportunities o where o.organization_id=p_org
  and (nullif(p_filters->>'owner','') is null or o.owner_id=(p_filters->>'owner')::uuid)
  and (nullif(p_filters->>'broker','') is null or o.broker_id=(p_filters->>'broker')::uuid)
  and (nullif(p_filters->>'source','') is null or coalesce(o.source,'unknown')=p_filters->>'source')
  and (nullif(p_filters->>'development','') is null or exists(select 1 from commercial_interests i where i.opportunity_id=o.id and i.development_id=(p_filters->>'development')::uuid))
 ), facts as (
  select 'new'::text metric,o.id opportunity_id,o.id entity_id,o.created_at occurred_at,0::numeric amount from scoped o
  union all select 'qualified',e.opportunity_id,e.opportunity_id,min(e.occurred_at),0 from commercial_events e join scoped o on o.id=e.opportunity_id where e.confirmation='confirmed' and e.new_state->>'stage'='qualified' and e.event_type in ('stage_changed','created') group by e.opportunity_id
  union all select 'visits',a.opportunity_id,a.id,a.outcome_at,0 from agenda_events a join scoped o on o.id=a.opportunity_id where a.visit_outcome='completed' and a.visit_kind in ('buyer','remote') and a.event_type in ('visita','apresentacao','reuniao_cliente') and (nullif(p_filters->>'format','') is null or a.visit_kind=p_filters->>'format')
  union all select 'proposals',e.opportunity_id,e.opportunity_id,min(e.occurred_at),0 from commercial_events e join scoped o on o.id=e.opportunity_id where e.event_type='proposal_sent' and e.confirmation='confirmed' group by e.opportunity_id
  union all select 'contracts',c.opportunity_id,c.id,c.signed_at,c.amount from commercial_contracts c join scoped o on o.id=c.opportunity_id
  union all select 'cancellations',c.opportunity_id,c.id,c.cancelled_at,c.amount from commercial_contracts c join scoped o on o.id=c.opportunity_id where c.cancelled_at is not null
  union all select 'receipts',c.opportunity_id,r.id,r.received_at,r.amount from commercial_receipts r join commercial_contracts c on c.id=r.contract_id join scoped o on o.id=c.opportunity_id where r.kind='entry'
  union all select 'reactivated',e.opportunity_id,e.id,e.occurred_at,0 from commercial_events e join scoped o on o.id=e.opportunity_id where e.event_type='reactivated' and e.confirmation='confirmed'
 ) select * from facts;
$$;
create function public.commercial_dashboard(p_org uuid,p_start timestamptz,p_end timestamptz,p_filters jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb; cutoff timestamptz:=least(p_end,now()); span interval; started timestamptz;
begin
 if p_end<=p_start or p_end-p_start>interval '367 days' then raise exception 'Invalid period (maximum 367 days)'; end if;
 if not private.is_org_member(p_org) then raise exception 'Not authorized' using errcode='42501'; end if;
 span:=cutoff-p_start;
 select tracking_started_at into started from commercial_settings where organization_id=p_org;
 with facts as materialized(select * from commercial_facts(p_org,p_filters)),
 scoped as materialized(select o.* from commercial_opportunities o where o.organization_id=p_org and exists(select 1 from facts f where f.opportunity_id=o.id and f.metric='new')),
 stages as (select stage,count(*) n from scoped group by stage),
 cohort as (select f.opportunity_id,min(f.occurred_at) proposed_at from facts f where metric='proposals' and occurred_at>=p_start and occurred_at<cutoff group by f.opportunity_id),
 cohort_results as (select c.*,exists(select 1 from facts f where f.metric='contracts' and f.opportunity_id=c.opportunity_id and f.occurred_at>=c.proposed_at and f.occurred_at<cutoff) converted from cohort c),
 visit_cohort as (select opportunity_id,min(occurred_at) visited_at from facts where metric='visits' and occurred_at>=p_start and occurred_at<cutoff group by opportunity_id),
 visit_results as (select v.*,exists(select 1 from facts f where f.metric='proposals' and f.opportunity_id=v.opportunity_id and f.occurred_at>=v.visited_at and f.occurred_at<cutoff) converted from visit_cohort v),
 actions as (
  select o.id,o.primary_contact_id lead_id,o.title,'Sem próxima ação' reason,1 priority from scoped o where o.stage not in ('lost','signed','nurture') and (nullif(trim(o.next_action),'') is null or o.owner_id is null)
  union all select o.id,o.primary_contact_id,o.title,'Retorno vencido',2 from scoped o where o.next_action_due_at<now() and o.stage not in ('lost','signed')
  union all select o.id,o.primary_contact_id,o.title,'Negociação parada',3 from scoped o where o.stage not in ('lost','signed','nurture') and o.updated_at<now()-make_interval(days=>coalesce((select stalled_days from commercial_settings where organization_id=p_org),7))
 ), unique_actions as (select distinct on(id) * from actions order by id,priority),
 metrics as (select k.key,
 case when k.key='value' then (select coalesce(sum(amount),0) from facts where metric='contracts' and occurred_at>=p_start and occurred_at<cutoff)
 when k.key='receipts' then (select coalesce(sum(amount),0) from facts where metric=k.key and occurred_at>=p_start and occurred_at<cutoff)
 else (select count(*) from facts where metric=k.key and occurred_at>=p_start and occurred_at<cutoff) end current,
 case when k.key='value' then (select coalesce(sum(amount),0) from facts where metric='contracts' and occurred_at>=p_start-span and occurred_at<p_start)
 when k.key='receipts' then (select coalesce(sum(amount),0) from facts where metric=k.key and occurred_at>=p_start-span and occurred_at<p_start)
 else (select count(*) from facts where metric=k.key and occurred_at>=p_start-span and occurred_at<p_start) end previous
 from unnest(array['new','qualified','visits','proposals','contracts','value','receipts','cancellations','reactivated']) k(key))
 select jsonb_build_object(
  'updated_at',now(),'start',p_start,'end',cutoff,'tracking_started_at',started,
  'history_incomplete',started is null or p_start<started,
  'comparison_incomplete',started is null or p_start-span<started,
  'metrics',(select jsonb_object_agg(key,jsonb_build_object('value',current,'previous',previous)) from metrics),
  'stages',coalesce((select jsonb_agg(jsonb_build_object('stage',stage,'count',n)) from stages),'[]'::jsonb),
  'actions',coalesce((select jsonb_agg(to_jsonb(a)) from (select * from unique_actions order by priority,title limit 100) a),'[]'::jsonb),
  'proposal_cohort',jsonb_build_object('size',(select count(*) from cohort_results),'converted',(select count(*) from cohort_results where converted),'open',(select count(*) from cohort_results c join scoped o on o.id=c.opportunity_id where not c.converted and o.stage not in ('lost','signed')),'cutoff',cutoff),
  'visit_cohort',jsonb_build_object('size',(select count(*) from visit_results),'converted',(select count(*) from visit_results where converted),'cutoff',cutoff),
  'attendance',jsonb_build_object('completed',(select count(*) from agenda_events a join scoped o on o.id=a.opportunity_id where a.visit_outcome='completed' and a.starts_at>=p_start and a.starts_at<cutoff),'no_show',(select count(*) from agenda_events a join scoped o on o.id=a.opportunity_id where a.visit_outcome='no_show' and a.starts_at>=p_start and a.starts_at<cutoff),'cancelled',(select count(*) from agenda_events a join scoped o on o.id=a.opportunity_id where a.visit_outcome='cancelled' and a.starts_at>=p_start and a.starts_at<cutoff),'pending',(select count(*) from agenda_events a join scoped o on o.id=a.opportunity_id where a.status='scheduled' and a.visit_outcome is distinct from 'rescheduled' and a.starts_at>=p_start and a.starts_at<cutoff)),
  'quality',jsonb_build_object('without_source',(select count(*) from scoped where source is null),'without_owner',(select count(*) from scoped where owner_id is null),'without_action',(select count(*) from scoped where stage not in ('lost','signed') and nullif(trim(next_action),'') is null),'pending_events',(select count(*) from commercial_events e join scoped o on o.id=e.opportunity_id where e.confirmation='pending'))
 ) into result;
 return result;
end; $$;
create function public.commercial_detail(p_org uuid,p_start timestamptz,p_end timestamptz,p_metric text,p_filters jsonb default '{}',p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path=public as $$
 with facts as (select f.*,o.title,o.primary_contact_id lead_id from commercial_facts(p_org,p_filters) f join commercial_opportunities o on o.id=f.opportunity_id where f.metric=case when p_metric='value' then 'contracts' else p_metric end and f.occurred_at>=p_start and f.occurred_at<least(p_end,now()) and private.is_org_member(p_org))
 select jsonb_build_object('total',(select count(*) from facts),'rows',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from facts order by occurred_at desc,entity_id limit 50 offset greatest(0,least(p_offset,100000))) r),'[]'::jsonb));
$$;
-- Prevent rewriting executed contracts, relinking historical proposals and direct fake ledger writes.
create function public.commercial_protect_history() returns trigger language plpgsql as $$ begin
 if tg_table_name='commercial_contracts' then
  if (to_jsonb(new)-'cancelled_at'-'cancellation_reason') is distinct from (to_jsonb(old)-'cancelled_at'-'cancellation_reason') or old.cancelled_at is not null then raise exception 'Executed contract is immutable; cancellation is append-only'; end if;
 elsif tg_table_name='proposals' then if old.opportunity_id is not null and new.opportunity_id is distinct from old.opportunity_id then raise exception 'Linked proposal cannot change opportunity'; end if;
 end if; return new;
end; $$;
create trigger commercial_protect_contract before update on public.commercial_contracts for each row execute function public.commercial_protect_history();
create trigger commercial_protect_proposal before update on public.proposals for each row execute function public.commercial_protect_history();
-- All functions retain caller permissions. No service-role metrics on behalf of users.
revoke all on function public.commercial_facts(uuid,jsonb) from public,anon;
revoke all on function public.commercial_dashboard(uuid,timestamptz,timestamptz,jsonb) from public,anon;
revoke all on function public.commercial_detail(uuid,timestamptz,timestamptz,text,jsonb,integer) from public,anon;
grant execute on function public.commercial_facts(uuid,jsonb),public.commercial_dashboard(uuid,timestamptz,timestamptz,jsonb),public.commercial_detail(uuid,timestamptz,timestamptz,text,jsonb,integer) to authenticated,service_role;
commit;
