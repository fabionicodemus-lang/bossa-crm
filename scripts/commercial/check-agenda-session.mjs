import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

// This is an isolated PostgreSQL/RLS test, not a connection to a real project.
const db = new PGlite();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
try {
  await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema private;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table organizations(id uuid primary key);
create table profiles(id uuid primary key);
create table memberships(organization_id uuid,user_id uuid,role text);
create table leads(id uuid primary key,organization_id uuid,kind text,name text,company text,owner_id uuid,next_action text,archived_at timestamptz);
create table developments(id uuid primary key,organization_id uuid);
create table development_units(id uuid primary key,organization_id uuid,development_id uuid);
create table proposals(id uuid primary key default gen_random_uuid(),organization_id uuid,lead_id uuid,development_id uuid,unit_id uuid,status text,proposed_price numeric,payment_plan jsonb,snapshot jsonb);
create table agenda_events(id uuid primary key default gen_random_uuid(),organization_id uuid,lead_id uuid,assigned_to uuid,created_by uuid,created_by_kind text,title text,status text default 'scheduled',starts_at timestamptz,ends_at timestamptz,event_type text,metadata jsonb default '{}');
create table lead_funnel_milestones(id uuid);
create table messages(id uuid primary key,organization_id uuid,lead_id uuid,created_at timestamptz,direction text,sender_kind text,status text,body text);
create table lead_handoffs(id uuid primary key,organization_id uuid,lead_id uuid,created_at timestamptz,accepted_at timestamptz,status text,requested_by text);
create table nara_operational_settings(organization_id uuid,business_timezone text,business_days int[],business_open time,business_close time,hot_lead_sla_minutes integer);
create function private.is_org_member(uuid) returns boolean language sql as $$ select exists(select 1 from public.memberships where organization_id=$1 and user_id=auth.uid()) $$;
create function private.can_edit_org(uuid) returns boolean language sql as $$ select exists(select 1 from public.memberships where organization_id=$1 and user_id=auth.uid() and role in ('admin','comercial')) $$;
create function private.is_org_admin(uuid) returns boolean language sql as $$ select exists(select 1 from public.memberships where organization_id=$1 and user_id=auth.uid() and role='admin') $$;
`);
  for (const name of [
    '20261021011240_commercial_metrics_foundation.sql',
    '20261021011422_commercial_metrics_queries.sql',
    '20261021012121_commercial_operations_insights.sql',
    '20261021094500_commercial_development_attribution.sql',
  ]) await db.exec(fs.readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  const org = id(1), other = id(2), user = id(10), buyer = id(20), foreignBuyer = id(21);
  await q('insert into organizations values($1),($2)', [org, other]);
  await q('insert into profiles values($1)', [user]);
  await q("insert into memberships values($1,$2,'comercial')", [org, user]);
  await q("insert into leads(id,organization_id,kind) values($1,$2,'cliente'),($3,$4,'cliente')", [buyer, org, foreignBuyer, other]);
  await q('insert into commercial_settings(organization_id,auto_link_enabled) values($1,true),($2,false)', [org, other]);
  await q("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  const [op] = await q("insert into commercial_opportunities(organization_id,title,primary_contact_id) values($1,'Compra documentada',$2) returning id", [org, buyer]);
  await db.exec(`
grant usage on schema public,private,auth to authenticated,service_role;
grant select on organizations,profiles,memberships,leads,developments,development_units,proposals to authenticated;
grant select,insert,update,delete on agenda_events to authenticated;
grant select,insert,update on all tables in schema public to service_role;
alter table agenda_events enable row level security;
create policy agenda_events_select_member on agenda_events for select to authenticated using(exists(select 1 from memberships m where m.organization_id=agenda_events.organization_id and m.user_id=auth.uid()));
create policy agenda_events_insert_staff on agenda_events for insert to authenticated with check(exists(select 1 from memberships m where m.organization_id=agenda_events.organization_id and m.user_id=auth.uid() and m.role in ('admin','comercial')));
create policy agenda_events_update_staff on agenda_events for update to authenticated using(private.can_edit_org(organization_id)) with check(private.can_edit_org(organization_id));
create policy agenda_events_delete_staff on agenda_events for delete to authenticated using(private.can_edit_org(organization_id));
set role authenticated;
`);
  const insert = async (company = org, contact = buyer) => (await q(
    "insert into agenda_events(organization_id,lead_id,assigned_to,created_by,created_by_kind,title,starts_at,ends_at,event_type) values($1,$2,$3,$3,'human','Visita Flow',now()+interval '1 day',now()+interval '25 hours','visita') returning id,opportunity_id,created_by",
    [company, contact, user],
  ))[0];
  const visit = await insert();
  assert.equal(visit.opportunity_id, op.id);
  assert.equal(visit.created_by, user);
  const [link] = await q('select status,resolved_by,initial_reason from commercial_link_reviews where entity_id=$1', [visit.id]);
  assert.deepEqual(link, { status: 'linked', resolved_by: user, initial_reason: 'unique_customer' });
  const [event] = await q("select actor_id,event_type from commercial_events where entity_id=$1 and entity_type='agenda_events'", [visit.id]);
  assert.equal(event.actor_id, user);
  assert.equal(event.event_type, 'visit_scheduled');
  await q("update agenda_events set title='Título atualizado pelo usuário' where id=$1", [visit.id]);
  const recorded = await q('select actor_id from commercial_events where entity_id=$1', [visit.id]);
  assert.equal(recorded.length, 2);
  assert.ok(recorded.every((row) => row.actor_id === user));
  await assert.rejects(() => insert(other, foreignBuyer));
  await assert.rejects(() => insert(org, foreignBuyer));
  assert.equal((await q('select * from commercial_link_reviews where organization_id=$1', [other])).length, 0);
  assert.equal((await q('update commercial_settings set auto_link_enabled=false where organization_id=$1 returning organization_id', [org])).length, 0);
  await db.exec('reset role');
  await q("select set_config('request.jwt.claim.sub','',false)");
  await db.exec('set role service_role');
  const systemVisit = await insert();
  assert.equal(systemVisit.opportunity_id, null, 'A created_by label alone must not impersonate a session');
  const [systemLink] = await q('select initial_reason,resolved_by from commercial_link_reviews where entity_id=$1', [systemVisit.id]);
  assert.equal(systemLink.initial_reason, 'system_review');
  assert.equal(systemLink.resolved_by, null);
  await db.exec('reset role');
  await q("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await q("update memberships set role='viewer' where user_id=$1", [user]);
  await db.exec('set role authenticated');
  await assert.rejects(() => insert());
  assert.equal((await q("update agenda_events set title='Forbidden' where id=$1 returning id", [visit.id])).length, 0);
  console.log('PASS: real authenticated PostgreSQL role preserves agenda actor and link reviewer; membership RLS, foreign contacts, viewer restrictions and service-role-without-user remain enforced. Isolated fixture, not full production schema.');
} finally {
  await db.close();
}
