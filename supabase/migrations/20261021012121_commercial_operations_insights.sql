begin;
create table public.commercial_ranking_settings (
 organization_id uuid primary key references public.organizations(id),
 contract_points integer not null default 100 check(contract_points>=0), proposal_points integer not null default 20 check(proposal_points>=0),
 buyer_visit_points integer not null default 10 check(buyer_visit_points>=0), broker_visit_points integer not null default 4 check(broker_visit_points>=0),
 interaction_points integer not null default 1 check(interaction_points>=0), monthly_interaction_cap integer not null default 5 check(monthly_interaction_cap>=0),
 updated_at timestamptz not null default now()
);
-- Preserve the weights actually used by LeadDirectory; do not overwrite with suggested 25/3.
insert into commercial_ranking_settings(organization_id) select id from organizations;
create table public.commercial_expenses (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 source text not null, category text not null check(category in ('media','commercial')),
 starts_on date not null, ends_on date not null, amount numeric(16,2) not null check(amount>=0),
 document_reference text not null, created_by uuid not null references profiles(id), created_at timestamptz not null default now(),
 check(ends_on>=starts_on)
);
create table public.commercial_conversation_reviews (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
 lead_id uuid not null references leads(id), message_id uuid not null references messages(id),
 category text not null check(category in ('repeated_greeting','answered_question','incorrect_information','repeated_image','bad_handoff','lost_history','visit_not_forwarded','relevant_interaction')),
 evidence text not null check(length(trim(evidence))>=8), origin text not null check(origin in ('human','ai')),
 status text not null default 'pending' check(status in ('pending','confirmed','rejected')),
 reviewed_by uuid references profiles(id), reviewed_at timestamptz, created_at timestamptz not null default now(),
 unique(message_id,category), check(status='pending' or (reviewed_by is not null and reviewed_at is not null))
);
create function public.commercial_review_evidence() returns trigger language plpgsql security invoker set search_path=public as $$ begin
 if not exists(select 1 from messages where id=new.message_id and lead_id=new.lead_id and organization_id=new.organization_id and position(new.evidence in body)>0) then raise exception 'Review requires a literal quote from the linked message'; end if;
 if tg_op='UPDATE' and (to_jsonb(new)-'status'-'reviewed_by'-'reviewed_at') is distinct from (to_jsonb(old)-'status'-'reviewed_by'-'reviewed_at') then raise exception 'Review evidence is immutable'; end if;
 if new.status<>'pending' then new.reviewed_by:=auth.uid();new.reviewed_at:=now();end if;return new;
end; $$;
create trigger commercial_review_evidence before insert or update on commercial_conversation_reviews for each row execute function commercial_review_evidence();
do $$ declare t text; begin
 foreach t in array array['commercial_ranking_settings','commercial_expenses','commercial_conversation_reviews'] loop
  execute format('alter table %I enable row level security',t);
  execute format('revoke all on %I from anon,authenticated',t);
  execute format('grant select,insert,update on %I to authenticated',t);
  execute format('grant all on %I to service_role',t);
  execute format('create policy commercial_read on %I for select to authenticated using(private.is_org_member(organization_id))',t);
  execute format('create policy commercial_write on %I for insert to authenticated with check(private.is_org_admin(organization_id))',t);
  if t<>'commercial_expenses' then execute format('create policy commercial_update on %I for update to authenticated using(private.is_org_admin(organization_id)) with check(private.is_org_admin(organization_id))',t); end if;
 end loop;
end; $$;
grant select on public.nara_operational_settings to authenticated;
create policy commercial_read_operations on public.nara_operational_settings for select to authenticated using(private.is_org_member(organization_id));
create index commercial_review_period on commercial_conversation_reviews(organization_id,status,created_at);
create index commercial_expense_period on commercial_expenses(organization_id,source,starts_on,ends_on);
create index if not exists commercial_handoff_message on public.messages(organization_id,lead_id,created_at) where direction='out' and sender_kind='humano';
create function public.commercial_operations(p_org uuid,p_start timestamptz,p_end timestamptz)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb;begin
 if not private.is_org_member(p_org) then raise exception 'Not authorized' using errcode='42501';end if;
 if p_end<=p_start or p_end-p_start>interval '367 days' then raise exception 'Invalid period'; end if;
 with handoffs as materialized (
  select h.*,m.response_at,s.hot_lead_sla_minutes,
   extract(dow from h.created_at at time zone s.business_timezone)::int=any(s.business_days)
    and (h.created_at at time zone s.business_timezone)::time>=s.business_open
    and (h.created_at at time zone s.business_timezone)::time<s.business_close in_hours
  from lead_handoffs h
  join leads l on l.id=h.lead_id and l.organization_id=p_org and l.kind='cliente'
  left join nara_operational_settings s on s.organization_id=h.organization_id
  left join lateral(select min(created_at) response_at from messages m where m.organization_id=h.organization_id and m.lead_id=h.lead_id and m.direction='out' and m.sender_kind='humano' and m.status in ('sent','delivered','read') and m.created_at>=h.created_at and m.created_at<coalesce((select min(next.created_at) from lead_handoffs next where next.lead_id=h.lead_id and next.created_at>h.created_at),least(p_end,now()))) m on true
  where h.organization_id=p_org and h.requested_by='ai' and h.created_at>=p_start and h.created_at<least(p_end,now())
 ), brokers as (
  select b.id,b.name,b.company,b.owner_id,b.next_action,
   (select coalesce(sum(least(n,w.monthly_interaction_cap)),0) from (select count(*) n from commercial_conversation_reviews r where r.organization_id=p_org and r.lead_id=b.id and r.category='relevant_interaction' and r.status='confirmed' and r.created_at>=p_start and r.created_at<least(p_end,now()) group by date_trunc('month',r.created_at at time zone 'America/Sao_Paulo')) months cross join commercial_ranking_settings w where w.organization_id=p_org) interactions,
   (select count(*) from commercial_opportunities o where o.broker_id=b.id and o.created_at>=p_start and o.created_at<least(p_end,now())) opportunities,
   (select count(*) from commercial_facts(p_org,jsonb_build_object('broker',b.id)) f where metric='proposals' and occurred_at>=p_start and occurred_at<least(p_end,now())) proposals,
   (select count(*) from commercial_contracts c join commercial_opportunities o on o.id=c.opportunity_id where o.broker_id=b.id and c.cancelled_at is null and c.signed_at>=p_start and c.signed_at<least(p_end,now())) contracts,
   (select coalesce(sum(c.amount),0) from commercial_contracts c join commercial_opportunities o on o.id=c.opportunity_id where o.broker_id=b.id and c.cancelled_at is null and c.signed_at>=p_start and c.signed_at<least(p_end,now())) contracted_value,
   (select count(*) from agenda_events a join commercial_opportunities o on o.id=a.opportunity_id where o.broker_id=b.id and a.visit_outcome='completed' and a.visit_kind='buyer' and a.outcome_at>=p_start and a.outcome_at<least(p_end,now())) buyer_visits,
   (select count(*) from agenda_events a join commercial_opportunities o on o.id=a.opportunity_id where o.broker_id=b.id and a.visit_outcome='completed' and a.visit_kind='broker_only' and a.outcome_at>=p_start and a.outcome_at<least(p_end,now())) broker_visits,
   (select max(e.occurred_at) from commercial_events e join commercial_opportunities o on o.id=e.opportunity_id where o.broker_id=b.id and e.event_type in ('proposal_sent','visit_completed','contract_signed')) last_activity
  from leads b where b.organization_id=p_org and b.kind='corretor'
 ), ranked as (select b.*,b.contracts*w.contract_points+b.proposals*w.proposal_points+b.buyer_visits*w.buyer_visit_points+b.broker_visits*w.broker_visit_points+b.interactions*w.interaction_points score from brokers b join commercial_ranking_settings w on w.organization_id=p_org),
 costs as(select source,sum(amount) filter(where category='media') media,sum(amount) total from commercial_expenses where organization_id=p_org and starts_on=(p_start at time zone 'America/Sao_Paulo')::date and ends_on=((p_end-interval '1 microsecond') at time zone 'America/Sao_Paulo')::date group by source)
 select jsonb_build_object(
 'handoffs',jsonb_build_object('requested',(select count(*) from handoffs),'accepted',(select count(*) from handoffs where accepted_at is not null),'pending',(select count(*) from handoffs where status='pending'),'responded',(select count(*) from handoffs where response_at is not null),'accept_median_minutes',(select percentile_cont(0.5) within group(order by extract(epoch from accepted_at-created_at)/60) from handoffs where accepted_at is not null),'response_median_minutes',(select percentile_cont(0.5) within group(order by extract(epoch from response_at-created_at)/60) from handoffs where response_at is not null),'in_hours',(select count(*) from handoffs where in_hours and (response_at is not null or created_at+make_interval(mins=>hot_lead_sla_minutes)<=least(p_end,now()))),'within_sla',(select count(*) from handoffs where in_hours and response_at<=created_at+make_interval(mins=>hot_lead_sla_minutes)),'off_hours',(select count(*) from handoffs where not in_hours),'missing_schedule',(select count(*) from handoffs where in_hours is null)),
 'brokers',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from ranked where opportunities+proposals+contracts+buyer_visits+broker_visits+interactions>0 order by score desc,name limit 100) r),'[]'::jsonb),
 'costs',coalesce((select jsonb_agg(jsonb_build_object('source',source,'media',media,'total',total,'opportunities',(select count(*) from commercial_opportunities o where o.organization_id=p_org and o.source=costs.source and o.created_at>=p_start and o.created_at<least(p_end,now())),'contracts',(select count(*) from commercial_contracts c join commercial_opportunities o on o.id=c.opportunity_id where o.organization_id=p_org and o.source=costs.source and c.signed_at>=p_start and c.signed_at<least(p_end,now())))) from costs),'[]'::jsonb),
 'reviews',jsonb_build_object('pending',(select count(*) from commercial_conversation_reviews where organization_id=p_org and status='pending'),'confirmed',(select count(*) from commercial_conversation_reviews where organization_id=p_org and status='confirmed' and created_at>=p_start and created_at<least(p_end,now())))
 ) into result;return result;
end; $$;
revoke all on function commercial_operations(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function commercial_operations(uuid,timestamptz,timestamptz) to authenticated,service_role;
commit;
