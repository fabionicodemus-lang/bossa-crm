// Isolated fixture only. It does not connect to or reproduce the entire production schema.
export const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export const org = id(1), other = id(2), user = id(10), viewer = id(11), broker = id(90), dev = id(100), unit = id(101), otherDev = id(102), otherUnit = id(103);
export const migrations = [
 '20261021011240_commercial_metrics_foundation.sql',
 '20261021011422_commercial_metrics_queries.sql',
 '20261021012121_commercial_operations_insights.sql',
 '20261021094500_commercial_development_attribution.sql',
 '20261021155436_commercial_verified_intent.sql',
];
export const schemaSQL = `
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema private;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table organizations(id uuid primary key);
create table profiles(id uuid primary key);
create table memberships(organization_id uuid,user_id uuid,role text);
create table leads(id uuid primary key,organization_id uuid,kind text,name text,company text,owner_id uuid,next_action text,archived_at timestamptz);
create table developments(id uuid primary key,organization_id uuid);
create table development_units(id uuid primary key,organization_id uuid,development_id uuid);
-- PGlite decodes timestamps as JS Date; millisecond defaults avoid losing precision in its driver.
-- The separate real-Postgres test explicitly supplies and verifies microsecond revisions.
create table proposals(id uuid primary key default gen_random_uuid(),organization_id uuid,lead_id uuid,development_id uuid,unit_id uuid,status text,proposed_price numeric,payment_plan jsonb default '{}',snapshot jsonb default '{}',updated_at timestamptz default date_trunc('milliseconds',clock_timestamp()));
create table agenda_events(id uuid primary key default gen_random_uuid(),organization_id uuid,lead_id uuid,assigned_to uuid,created_by uuid,created_by_kind text,title text,status text default 'scheduled',starts_at timestamptz,ends_at timestamptz,event_type text,metadata jsonb default '{}',updated_at timestamptz default date_trunc('milliseconds',clock_timestamp()));
create table lead_funnel_milestones(id uuid);
create table messages(id uuid primary key,organization_id uuid,lead_id uuid,created_at timestamptz,direction text,sender_kind text,status text,body text);
create table lead_handoffs(id uuid primary key,organization_id uuid,lead_id uuid,created_at timestamptz,accepted_at timestamptz,status text,requested_by text);
create table nara_operational_settings(organization_id uuid,business_timezone text,business_days int[],business_open time,business_close time,hot_lead_sla_minutes integer);
create function private.is_org_member(uuid) returns boolean language sql as $$ select exists(select 1 from public.memberships where organization_id=$1 and user_id=auth.uid()) $$;
create function private.can_edit_org(uuid) returns boolean language sql as $$ select exists(select 1 from public.memberships where organization_id=$1 and user_id=auth.uid() and role in ('admin','comercial')) $$;
create function private.is_org_admin(uuid) returns boolean language sql as $$ select exists(select 1 from public.memberships where organization_id=$1 and user_id=auth.uid() and role='admin') $$;
create function touch_source() returns trigger language plpgsql as $$ begin new.updated_at:=clock_timestamp(); return new; end $$;
create trigger touch_source before update on proposals for each row execute function touch_source();
create trigger touch_source before update on agenda_events for each row execute function touch_source();
`;
export const seedSQL = `
insert into organizations values('${org}'),('${other}');
insert into profiles values('${user}'),('${viewer}');
insert into memberships values('${org}','${user}','comercial'),('${org}','${viewer}','viewer');
insert into commercial_settings(organization_id) values('${org}'),('${other}');
insert into developments values('${dev}','${org}'),('${otherDev}','${org}');
insert into development_units values('${unit}','${org}','${dev}'),('${otherUnit}','${org}','${otherDev}');
insert into leads(id,organization_id,kind,name) values('${broker}','${org}','corretor','Corretor de teste'),('${id(91)}','${other}','cliente','Outra organização');
${Array.from({ length: 60 }, (_, i) => `insert into leads(id,organization_id,kind,name) values('${id(20+i)}','${org}','cliente','Cliente de teste ${i}');`).join('\n')}
grant usage on schema public,private,auth to authenticated,anon,service_role;
grant select on organizations,profiles,memberships,developments,development_units to authenticated;
grant select,update on leads to authenticated;
grant select,insert,update,delete on proposals,agenda_events to authenticated;
grant select,insert,update,delete on proposals,agenda_events to service_role;
grant select on leads,memberships to service_role;
alter table leads enable row level security;
create policy leads_read on leads for select to authenticated using(private.is_org_member(organization_id));
create policy leads_write on leads for update to authenticated using(private.can_edit_org(organization_id)) with check(private.can_edit_org(organization_id));
alter table proposals enable row level security;
create policy proposals_read on proposals for select to authenticated using(private.is_org_member(organization_id));
create policy proposals_insert on proposals for insert to authenticated with check(private.can_edit_org(organization_id));
create policy proposals_update on proposals for update to authenticated using(private.can_edit_org(organization_id)) with check(private.can_edit_org(organization_id));
create policy proposals_delete on proposals for delete to authenticated using(private.can_edit_org(organization_id));
alter table agenda_events enable row level security;
create policy agenda_read on agenda_events for select to authenticated using(private.is_org_member(organization_id));
create policy agenda_insert on agenda_events for insert to authenticated with check(private.can_edit_org(organization_id));
create policy agenda_update on agenda_events for update to authenticated using(private.can_edit_org(organization_id)) with check(private.can_edit_org(organization_id));
create policy agenda_delete on agenda_events for delete to authenticated using(private.can_edit_org(organization_id));
`;
