-- Additive commercial ledger. Existing contacts, messages, rankings and milestones remain untouched.
begin;
create table public.commercial_settings (
 organization_id uuid primary key references public.organizations(id),
 tracking_started_at timestamptz not null default now(),
 minimum_sample integer not null default 10 check(minimum_sample >= 2),
 stalled_days integer not null default 7 check(stalled_days > 0),
 qualification_fields text[] not null default array['need','product','horizon','commercial_fit'],
 updated_at timestamptz not null default now()
);
insert into public.commercial_settings(organization_id) select id from public.organizations;
create table public.commercial_opportunities (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 title text not null check(length(trim(title)) between 1 and 200),
 primary_contact_id uuid not null references public.leads(id),
 broker_id uuid references public.leads(id), owner_id uuid references public.profiles(id),
 stage text not null default 'new' check(stage in ('new','contact','qualified','visit_scheduled','visit_completed','proposal','negotiation','signed','nurture','lost')),
 source text, qualification jsonb not null default '{}',
 next_action text, next_action_due_at timestamptz,
 loss_reason text check(loss_reason in ('entry','installment','reinforcement','price','delivery','layout','location','competitor','postponed','no_reply','other')),
 loss_note text, attribution_reason text,
 history_complete boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), check(stage <> 'lost' or (loss_reason is not null and (loss_reason <> 'other' or length(trim(coalesce(loss_note,'')))>0)))
);
create table public.commercial_participants (
 organization_id uuid not null, opportunity_id uuid not null, contact_id uuid not null references public.leads(id),
 role text not null default 'buyer' check(role in ('buyer','spouse','representative')),
 primary key(opportunity_id,contact_id),
 foreign key(organization_id,opportunity_id) references public.commercial_opportunities(organization_id,id)
);
create table public.commercial_interests (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, opportunity_id uuid not null,
 development_id uuid not null references public.developments(id), unit_id uuid references public.development_units(id),
 is_primary boolean not null default false, created_at timestamptz not null default now(),
 foreign key(organization_id,opportunity_id) references public.commercial_opportunities(organization_id,id)
);
create unique index commercial_one_primary_interest on public.commercial_interests(opportunity_id) where is_primary;
create unique index commercial_unique_interest on public.commercial_interests(opportunity_id,development_id,coalesce(unit_id,'00000000-0000-0000-0000-000000000000'::uuid));
create table public.commercial_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, opportunity_id uuid not null,
 event_type text not null, entity_type text not null, entity_id uuid not null,
 occurred_at timestamptz not null, recorded_at timestamptz not null default now(),
 actor_id uuid, source text not null, external_id text not null,
 previous_state jsonb, new_state jsonb,
 confirmation text not null default 'confirmed' check(confirmation in ('confirmed','pending','invalidated')),
 evidence jsonb not null default '{}',
 foreign key(organization_id,opportunity_id) references public.commercial_opportunities(organization_id,id),
 unique(organization_id,source,external_id)
);
create index commercial_events_period on public.commercial_events(organization_id,event_type,occurred_at,opportunity_id);
create index commercial_events_opportunity on public.commercial_events(opportunity_id,occurred_at);
create index commercial_opportunities_filters on public.commercial_opportunities(organization_id,stage,owner_id,created_at);
create table public.commercial_contracts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, opportunity_id uuid not null,
 proposal_id uuid references public.proposals(id), unit_id uuid not null references public.development_units(id),
 signed_at timestamptz not null, amount numeric(16,2) not null check(amount > 0),
 document_reference text not null check(length(trim(document_reference))>0),
 cancelled_at timestamptz, cancellation_reason text, created_by uuid, created_at timestamptz not null default now(),
 foreign key(organization_id,opportunity_id) references public.commercial_opportunities(organization_id,id),
 unique(organization_id,id), unique(organization_id,unit_id,document_reference), check(cancelled_at is null or (cancelled_at >= signed_at and length(trim(coalesce(cancellation_reason,'')))>0))
);
create unique index commercial_one_active_contract_unit on public.commercial_contracts(unit_id) where cancelled_at is null;
create table public.commercial_receipts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, contract_id uuid not null,
 received_at timestamptz not null, amount numeric(16,2) not null check(amount > 0),
 kind text not null check(kind in ('entry','installment','reinforcement','keys','other')),
 source text not null, external_id text not null, evidence text not null check(length(trim(evidence))>0),
 confirmed_by uuid not null, created_at timestamptz not null default now(),
 foreign key(organization_id,contract_id) references public.commercial_contracts(organization_id,id),
 unique(organization_id,source,external_id)
);
create table public.commercial_proposal_versions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, opportunity_id uuid not null,
 proposal_id uuid not null references public.proposals(id), version integer not null,
 snapshot jsonb not null, recorded_at timestamptz not null default now(), recorded_by uuid,
 foreign key(organization_id,opportunity_id) references public.commercial_opportunities(organization_id,id),
 unique(proposal_id,version)
);
create table public.commercial_goals (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 metric text not null check(metric in ('new','qualified','visits','proposals','contracts','value')),
 starts_on date not null, ends_on date not null, target numeric not null check(target>0),
 development_id uuid references public.developments(id), owner_id uuid references public.profiles(id),
 created_by uuid not null, created_at timestamptz not null default now(), check(ends_on>=starts_on)
);
alter table public.proposals add column opportunity_id uuid references public.commercial_opportunities(id),
 add column commercial_primary boolean not null default false,
 add column information_complete_at timestamptz, add column sent_at timestamptz, add column approved_at timestamptz;
create unique index commercial_primary_proposal on public.proposals(opportunity_id) where commercial_primary and status not in ('recusada','expirada','cancelada');
alter table public.agenda_events add column opportunity_id uuid references public.commercial_opportunities(id),
 add column visit_outcome text check(visit_outcome in ('confirmed','completed','cancelled','no_show','rescheduled')),
 add column visit_kind text check(visit_kind in ('buyer','broker_only','remote')),
 add column outcome_at timestamptz, add column replaces_event_id uuid references public.agenda_events(id),
 add column commercial_result text, add column commercial_next_action text;
create unique index commercial_visit_replacement on public.agenda_events(replaces_event_id) where replaces_event_id is not null;
-- Validate cross-organization references even when called by service integrations.
create function public.commercial_validate_links() returns trigger language plpgsql security invoker set search_path=public as $$
declare j jsonb:=to_jsonb(new); k text; tbl text; linked uuid; opp uuid; required_fields text[];
begin
 if tg_table_name in ('proposals','agenda_events') then if new.opportunity_id is null then if tg_op='UPDATE' and old.opportunity_id is not null then raise exception 'An existing opportunity link cannot be removed'; end if; return new; end if; end if;
 if tg_op='UPDATE' and new.organization_id is distinct from old.organization_id then raise exception 'Organization is immutable'; end if;
 for k,tbl in select * from (values ('primary_contact_id','leads'),('contact_id','leads'),('broker_id','leads'),('lead_id','leads'),('development_id','developments'),('unit_id','development_units'),('proposal_id','proposals'),('opportunity_id','commercial_opportunities'),('contract_id','commercial_contracts'),('replaces_event_id','agenda_events')) t(k,tbl) loop
  linked := nullif(j->>k,'')::uuid;
  if linked is not null then
   execute format('select id from public.%I where id=$1 and organization_id=$2',tbl) into opp using linked,new.organization_id;
   if opp is null then raise exception 'Invalid organization reference: %',k using errcode='23514'; end if;
  end if;
 end loop;
 for k in select unnest(array['owner_id','created_by','confirmed_by']) loop
  linked:=nullif(j->>k,'')::uuid;
  if linked is not null and not exists(select 1 from memberships where user_id=linked and organization_id=new.organization_id) then raise exception 'Invalid team member'; end if;
 end loop;
 if tg_table_name='commercial_opportunities' then
  if not exists(select 1 from leads where id=new.primary_contact_id and kind='cliente') then raise exception 'Buyer must be a client contact'; end if;
  if new.broker_id is not null and not exists(select 1 from leads where id=new.broker_id and kind='corretor') then raise exception 'Partner must be a broker'; end if;
  if tg_op='UPDATE' then
   new.created_at:=old.created_at; new.organization_id:=old.organization_id;
   if (new.broker_id is distinct from old.broker_id or new.owner_id is distinct from old.owner_id) and nullif(trim(new.attribution_reason),'') is null then raise exception 'Assignment changes require a reason'; end if;
  end if;
  if new.stage='qualified' then
   select qualification_fields into required_fields from commercial_settings where organization_id=new.organization_id;
   if required_fields is null then required_fields:=array['need','product','horizon','commercial_fit']; end if;
   if exists(select 1 from unnest(required_fields) f where nullif(trim(new.qualification->>f),'') is null) then raise exception 'Complete configured qualification criteria'; end if;
  end if;
  if new.stage='signed' and not exists(select 1 from commercial_contracts where opportunity_id=new.id and cancelled_at is null) then raise exception 'Signed stage requires documented contract'; end if;
  new.updated_at:=now();
 end if;
 if tg_table_name='commercial_interests' then if new.unit_id is not null and not exists(select 1 from development_units where id=new.unit_id and development_id=new.development_id) then raise exception 'Unit does not belong to development'; end if; end if;
 if tg_table_name='commercial_contracts' then if new.cancelled_at>now() then raise exception 'Future cancellation is not confirmed'; end if; if new.signed_at>now() then raise exception 'A future signature is not an executed contract'; end if;
 if new.proposal_id is not null and not exists(select 1 from proposals where id=new.proposal_id and opportunity_id=new.opportunity_id and unit_id=new.unit_id) then raise exception 'Proposal, opportunity and unit must match'; end if; end if;
 if tg_table_name='commercial_receipts' then if new.received_at > now() then raise exception 'A future receipt is not confirmed cash'; end if; end if;
 if tg_table_name='agenda_events' then
 if new.event_type not in ('visita','apresentacao','reuniao_cliente') then raise exception 'Only commercial visits and presentations may link to an opportunity'; end if;
 if tg_op='UPDATE' and old.opportunity_id is not null and new.opportunity_id is distinct from old.opportunity_id then raise exception 'Linked visit cannot change opportunity'; end if;
 if new.replaces_event_id is not null then
  if not exists(select 1 from agenda_events where id=new.replaces_event_id and opportunity_id=new.opportunity_id and visit_outcome='rescheduled') then raise exception 'Mark original occurrence rescheduled before linking replacement'; end if;
  if new.replaces_event_id=new.id then raise exception 'A visit cannot replace itself'; end if;
 end if; end if;
 return new;
end; $$;
-- Immutable ledger and versions; updates cannot rewrite history.
create function public.commercial_immutable() returns trigger language plpgsql as $$ begin raise exception 'Append-only commercial history'; end; $$;
create trigger commercial_events_immutable before update or delete on public.commercial_events for each row execute function public.commercial_immutable();
create trigger commercial_versions_immutable before update or delete on public.commercial_proposal_versions for each row execute function public.commercial_immutable();
create trigger commercial_receipts_immutable before update or delete on public.commercial_receipts for each row execute function public.commercial_immutable();
-- Ledger events are written transactionally with their entity, never via best-effort application calls.
create function public.commercial_track_entity() returns trigger language plpgsql security invoker set search_path=public as $$
declare opp uuid; typ text; moment timestamptz:=now(); prev jsonb; nxt jsonb:=to_jsonb(new); rev integer;
begin
 if tg_op='UPDATE' then prev:=to_jsonb(old); if (prev-'updated_at')=(nxt-'updated_at') then return new; end if; end if;
 if tg_table_name='commercial_opportunities' then
  opp:=new.id;
  typ:=case when tg_op='INSERT' then 'created' when new.stage is distinct from old.stage then case when old.stage in ('lost','nurture') and new.stage not in ('lost','nurture') then 'reactivated' else 'stage_changed' end when new.broker_id is distinct from old.broker_id or new.owner_id is distinct from old.owner_id then 'assignment_changed' else 'updated' end;
  if tg_op='INSERT' then moment:=new.created_at; end if;
 elsif tg_table_name='agenda_events' then
  opp:=new.opportunity_id;
  if opp is null then return new; end if;
  typ:=case when tg_op='INSERT' then 'visit_scheduled' when new.visit_outcome is distinct from old.visit_outcome then 'visit_'||new.visit_outcome else 'visit_updated' end;
  if new.visit_outcome is distinct from coalesce(prev->>'visit_outcome','') then new.outcome_at:=coalesce(new.outcome_at,now()); end if;
  if new.status='completed' and new.visit_outcome is null and (tg_op='INSERT' or new.status is distinct from old.status) then new.visit_outcome:='completed'; new.outcome_at:=coalesce(new.outcome_at,now()); typ:='visit_completed'; end if;
  if new.status='cancelled' and new.visit_outcome is null and (tg_op='INSERT' or new.status is distinct from old.status) then new.visit_outcome:='cancelled'; new.outcome_at:=coalesce(new.outcome_at,now()); typ:='visit_cancelled'; end if;
  nxt:=to_jsonb(new);
 elsif tg_table_name='proposals' then
  opp:=new.opportunity_id;
  if opp is null then return new; end if;
  if tg_op='INSERT' or new.opportunity_id is distinct from old.opportunity_id or new.proposed_price is distinct from old.proposed_price or new.payment_plan is distinct from old.payment_plan or new.snapshot is distinct from old.snapshot or new.status is distinct from old.status then
   select coalesce(max(version),0)+1 into rev from commercial_proposal_versions where proposal_id=new.id;
   insert into commercial_proposal_versions(organization_id,opportunity_id,proposal_id,version,snapshot,recorded_by) values(new.organization_id,opp,new.id,rev,to_jsonb(new),auth.uid());
  end if;
  typ:='proposal_updated';
  if new.status='enviada' and (tg_op='INSERT' or old.status is distinct from new.status) then typ:='proposal_sent'; moment:=coalesce(new.sent_at,now()); end if;
 elsif tg_table_name='commercial_contracts' then
  opp:=new.opportunity_id; typ:=case when tg_op='INSERT' then 'contract_signed' else 'contract_cancelled' end;
  moment:=case when tg_op='INSERT' then new.signed_at else new.cancelled_at end;
 else return new;
 end if;
 insert into commercial_events(organization_id,opportunity_id,event_type,entity_type,entity_id,occurred_at,actor_id,source,external_id,previous_state,new_state)
 values(new.organization_id,opp,typ,tg_table_name,new.id,moment,auth.uid(),'database',tg_table_name||':'||new.id||':'||gen_random_uuid()||':'||typ,prev,nxt) on conflict do nothing;
 return new;
end; $$;
-- AFTER triggers: referenced rows already exist for ledger FKs.
create trigger commercial_track_opportunity after insert or update on public.commercial_opportunities for each row execute function public.commercial_track_entity();
create trigger commercial_track_proposal after insert or update on public.proposals for each row execute function public.commercial_track_entity();
create trigger commercial_track_contract after insert or update on public.commercial_contracts for each row execute function public.commercial_track_entity();
-- Normalize visit outcomes before the generic AFTER tracker.
create function public.commercial_visit_outcome() returns trigger language plpgsql as $$ begin
 if new.opportunity_id is not null then
  if new.status='completed' and new.visit_outcome is null and (tg_op='INSERT' or new.status is distinct from old.status) then new.visit_outcome:='completed'; end if;
  if new.status='cancelled' and new.visit_outcome is null and (tg_op='INSERT' or new.status is distinct from old.status) then new.visit_outcome:='cancelled'; end if;
  if tg_op='INSERT' or new.visit_outcome is distinct from old.visit_outcome then new.outcome_at:=coalesce(new.outcome_at,now()); end if;
  if new.visit_outcome='completed' and new.starts_at>now() then raise exception 'Future visit cannot be completed'; end if;
  if new.visit_outcome in ('cancelled','rescheduled','no_show') then new.status:='cancelled'; end if;
 end if; return new;
end; $$;
create trigger commercial_visit_outcome before insert or update on public.agenda_events for each row execute function public.commercial_visit_outcome();
create trigger commercial_track_visit after insert or update on public.agenda_events for each row execute function public.commercial_track_entity();
-- Verify consistency of existing entities when explicitly linked, without inventing historical milestones.
do $$ declare t text; begin
 foreach t in array array['commercial_opportunities','commercial_participants','commercial_interests','commercial_contracts','commercial_receipts','commercial_goals','proposals','agenda_events'] loop
  execute format('create trigger commercial_validate before insert or update on public.%I for each row execute function public.commercial_validate_links()',t);
 end loop;
end; $$;
-- Only transactional entity triggers may append confirmed ledger entries and snapshots.
create function public.commercial_require_trigger() returns trigger language plpgsql as $$ begin
 if pg_trigger_depth()<2 then raise exception 'History must originate from an entity transaction'; end if; return new;
end; $$;
create trigger commercial_events_origin before insert on public.commercial_events for each row execute function public.commercial_require_trigger();
create trigger commercial_versions_origin before insert on public.commercial_proposal_versions for each row execute function public.commercial_require_trigger();
-- New tables use the existing organization boundary; configuration and financial confirmations require admin.
do $$ declare t text; admin_only boolean; begin
 foreach t in array array['commercial_settings','commercial_opportunities','commercial_participants','commercial_interests','commercial_events','commercial_contracts','commercial_receipts','commercial_proposal_versions','commercial_goals'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select,insert,update on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy commercial_read on public.%I for select to authenticated using (private.is_org_member(organization_id))',t);
  admin_only:=t in ('commercial_settings','commercial_goals','commercial_receipts','commercial_contracts');
  execute format('create policy commercial_insert on public.%I for insert to authenticated with check (private.%I(organization_id))',t,case when admin_only then 'is_org_admin' else 'can_edit_org' end);
  if t not in ('commercial_events','commercial_proposal_versions','commercial_receipts') then
   execute format('create policy commercial_update on public.%I for update to authenticated using (private.%I(organization_id)) with check (private.%I(organization_id))',t,case when admin_only then 'is_org_admin' else 'can_edit_org' end,case when admin_only then 'is_org_admin' else 'can_edit_org' end);
  end if;
 end loop;
end; $$;
-- Avoid silently treating stage-derived historical milestones as evidence. Keep legacy table as-is.
comment on table public.lead_funnel_milestones is 'Legacy inferred milestones. Not evidence of visit completion, formal proposal or signed contract. Preserved for compatibility.';
commit;
