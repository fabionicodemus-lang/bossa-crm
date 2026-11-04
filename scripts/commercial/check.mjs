process.on("uncaughtException", (e) => {
  console.error(e.message, e.where ?? "");
  process.exit(1);
});
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
import { periodRange, relativeChange } from "../../src/lib/commercial/model.ts";
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema private;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table organizations(id uuid primary key); create table profiles(id uuid primary key);
create table memberships(organization_id uuid,user_id uuid,role text);
create table leads(id uuid primary key,organization_id uuid,kind text,name text,company text,owner_id uuid,next_action text);
create table developments(id uuid primary key,organization_id uuid);
create table development_units(id uuid primary key,organization_id uuid,development_id uuid);
create table proposals(id uuid primary key default gen_random_uuid(),organization_id uuid,lead_id uuid,development_id uuid,unit_id uuid,status text,proposed_price numeric,payment_plan jsonb,snapshot jsonb);
create table agenda_events(id uuid primary key default gen_random_uuid(),organization_id uuid,lead_id uuid,status text,starts_at timestamptz,event_type text);
create table lead_funnel_milestones(id uuid);create table messages(id uuid primary key,organization_id uuid,lead_id uuid,created_at timestamptz,direction text,sender_kind text,status text,body text);create table lead_handoffs(id uuid primary key,organization_id uuid,lead_id uuid,created_at timestamptz,accepted_at timestamptz,status text,requested_by text);create table nara_operational_settings(organization_id uuid,business_timezone text,business_days int[],business_open time,business_close time,hot_lead_sla_minutes integer);create function private.is_org_member(uuid) returns boolean language sql as $$ select exists(select 1 from public.memberships where organization_id=$1 and user_id=auth.uid()) $$;
create function private.can_edit_org(uuid) returns boolean language sql as $$ select exists(select 1 from public.memberships where organization_id=$1 and user_id=auth.uid() and role in ('admin','comercial')) $$;
create function private.is_org_admin(uuid) returns boolean language sql as $$ select exists(select 1 from public.memberships where organization_id=$1 and user_id=auth.uid() and role='admin') $$;
`);
const root = new URL("../../", import.meta.url).pathname;
await db.exec(
  fs.readFileSync(
    root +
      "supabase/migrations/20261021011240_commercial_metrics_foundation.sql",
    "utf8",
  ),
);
await db.exec(
  fs.readFileSync(
    root + "supabase/migrations/20261021011422_commercial_metrics_queries.sql",
    "utf8",
  ),
);
await db.exec(
  fs.readFileSync(
    root +
      "supabase/migrations/20261021012121_commercial_operations_insights.sql",
    "utf8",
  ),
);
await db.exec(
  fs.readFileSync(
    root +
      "supabase/migrations/20261021094500_commercial_development_attribution.sql",
    "utf8",
  ),
);
const org = "00000000-0000-0000-0000-000000000001",
  other = "00000000-0000-0000-0000-000000000002",
  user = "00000000-0000-0000-0000-000000000010",
  buyer = "00000000-0000-0000-0000-000000000020",
  broker = "00000000-0000-0000-0000-000000000021",
  spouse = "00000000-0000-0000-0000-000000000022",
  dev = "00000000-0000-0000-0000-000000000030",
  dev2 = "00000000-0000-0000-0000-000000000031",
  unit = "00000000-0000-0000-0000-000000000040";
await db.exec(`insert into organizations values('${org}'),('${other}'); insert into profiles values('${user}'); insert into memberships values('${org}','${user}','admin'); select set_config('request.jwt.claim.sub','${user}',false);
insert into leads(id,organization_id,kind) values('${buyer}','${org}','cliente'),('${broker}','${org}','corretor'),('${spouse}','${org}','cliente');insert into developments values('${dev}','${org}'),('${dev2}','${org}');insert into development_units values('${unit}','${org}','${dev}'); insert into commercial_settings(organization_id) values('${org}'),('${other}');`);
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
async function rejects(sql, params = []) {
  await assert.rejects(() => q(sql, params));
}
await q(
  `insert into leads(id,organization_id,kind) values('00000000-0000-0000-0000-000000000023',$1,'cliente')`,
  [other],
);
await q(
  `insert into commercial_opportunities(organization_id,title,primary_contact_id) values($1,'Other org','00000000-0000-0000-0000-000000000023')`,
  [other],
);
const [op] = await q(
  `insert into commercial_opportunities(organization_id,title,primary_contact_id,broker_id,owner_id,next_action) values($1,'Compra familiar',$2,$3,$4,'Conversar') returning id,created_at`,
  [org, buyer, broker, user],
);
await q(`insert into commercial_participants values($1,$2,$3,'spouse')`, [
  org,
  op.id,
  spouse,
]);
await q(
  `insert into commercial_interests(organization_id,opportunity_id,development_id,is_primary) values($1,$2,$3,true),($1,$2,$4,false)`,
  [org, op.id, dev, dev2],
);
await rejects(
  `update commercial_opportunities set stage='qualified' where id=$1`,
  [op.id],
);
await q(
  `update commercial_opportunities set stage='qualified',qualification='{"need":"morar","product":"apto","horizon":"ano","commercial_fit":"ok"}' where id=$1`,
  [op.id],
);
const [proposal] = await q(
  `insert into proposals(organization_id,lead_id,development_id,unit_id,status,proposed_price,payment_plan,snapshot,opportunity_id) values($1,$2,$3,$4,'enviada',100000,'{}','{}',$5) returning id`,
  [org, buyer, dev, unit, op.id],
);
await q(`update proposals set proposed_price=99000 where id=$1`, [proposal.id]);
await q(`update proposals set proposed_price=98000 where id=$1`, [proposal.id]);
assert.equal(
  Number(
    (
      await q(
        `select count(*) n from commercial_proposal_versions where proposal_id=$1`,
        [proposal.id],
      )
    )[0].n,
  ),
  3,
);
assert.equal(
  Number(
    (
      await q(
        `select count(*) n from commercial_facts($1) where metric='proposals'`,
        [org],
      )
    )[0].n,
  ),
  1,
);
const [visit] = await q(
  `insert into agenda_events(organization_id,lead_id,status,starts_at,event_type,opportunity_id,visit_kind,visit_outcome) values($1,$2,'completed',now()-interval '1 hour','visita',$3,'buyer','completed') returning id`,
  [org, buyer, op.id],
);
const [rescheduled] = await q(
  `insert into agenda_events(organization_id,lead_id,status,starts_at,event_type,opportunity_id,visit_kind,visit_outcome) values($1,$2,'scheduled',now()-interval '1 hour','visita',$3,'buyer','rescheduled') returning id`,
  [org, buyer, op.id],
);
await q(
  `insert into agenda_events(organization_id,lead_id,status,starts_at,event_type,opportunity_id,visit_kind,replaces_event_id) values($1,$2,'scheduled',now()+interval '1 day','visita',$3,'buyer',$4)`,
  [org, buyer, op.id, rescheduled.id],
);
await rejects(
  `insert into agenda_events(organization_id,status,starts_at,event_type,opportunity_id,visit_kind,visit_outcome) values($1,'completed',now()+interval '1 day','visita',$2,'buyer','completed')`,
  [org, op.id],
);
await q(
  `update commercial_opportunities set stage='lost',loss_reason='postponed' where id=$1`,
  [op.id],
);
await q(`update commercial_opportunities set stage='contact' where id=$1`, [
  op.id,
]);
assert.deepEqual(
  (
    await q(`select created_at from commercial_opportunities where id=$1`, [
      op.id,
    ])
  )[0].created_at,
  op.created_at,
);
await rejects(
  `insert into commercial_events(organization_id,opportunity_id,event_type,entity_type,entity_id,occurred_at,source,external_id) values($1,$2,'proposal_sent','proposals',$2,now(),'manual','fake')`,
  [org, op.id],
);
await rejects(
  `update commercial_opportunities set organization_id=$1 where id=$2`,
  [other, op.id],
);
await rejects(
  `update commercial_opportunities set stage='signed' where id=$1`,
  [op.id],
);
const [contract] = await q(
  `insert into commercial_contracts(organization_id,opportunity_id,proposal_id,unit_id,signed_at,amount,document_reference,created_by) values($1,$2,$3,$4,now(),98000,'doc:verified',$5) returning id`,
  [org, op.id, proposal.id, unit, user],
);
await rejects(`update commercial_contracts set amount=1 where id=$1`, [
  contract.id,
]);
await q(
  `insert into commercial_receipts(organization_id,contract_id,received_at,amount,kind,source,external_id,evidence,confirmed_by) values($1,$2,now(),10000,'entry','bank','tx1','receipt',$3)`,
  [org, contract.id, user],
);
await rejects(
  `insert into commercial_receipts(organization_id,contract_id,received_at,amount,kind,source,external_id,evidence,confirmed_by) values($1,$2,now(),10000,'entry','bank','tx1','receipt',$3)`,
  [org, contract.id, user],
);
const dashboard = async () =>
  (
    await q(
      `select commercial_dashboard($1,now()-interval '1 day',now()+interval '1 day') data`,
      [org],
    )
  )[0].data;
let d = await dashboard();
await q(`insert into commercial_ranking_settings(organization_id) values($1)`, [
  org,
]);
await q(
  `select commercial_operations($1,now()-interval '1 day',now()+interval '1 day')`,
  [org],
);
assert.equal(d.metrics.proposals.value, 1);
assert.equal(d.metrics.visits.value, 1);
assert.equal(d.metrics.contracts.value, 1);
assert.equal(d.metrics.receipts.value, 10000);
// A family interested in two products must not count the Flow sale as an Alma sale.
const [flowFacts] = await q(
  `select commercial_dashboard($1,now()-interval '1 day',now()+interval '1 day',jsonb_build_object('development',$2::text)) data`,
  [org, dev],
);
const [almaFacts] = await q(
  `select commercial_dashboard($1,now()-interval '1 day',now()+interval '1 day',jsonb_build_object('development',$2::text)) data`,
  [org, dev2],
);
assert.equal(flowFacts.data.metrics.new.value, 1);
assert.equal(almaFacts.data.metrics.new.value, 1);
assert.equal(flowFacts.data.metrics.proposals.value, 1);
assert.equal(almaFacts.data.metrics.proposals.value, 0);
assert.equal(flowFacts.data.metrics.contracts.value, 1);
assert.equal(almaFacts.data.metrics.contracts.value, 0);
assert.equal(flowFacts.data.metrics.receipts.value, 10000);
assert.equal(almaFacts.data.metrics.receipts.value, 0);
const [brokerFacts] = await q(
  `select commercial_dashboard($1,now()-interval '1 day',now()+interval '1 day',jsonb_build_object('broker',$2::text)) data`,
  [org, broker],
);
assert.equal(brokerFacts.data.metrics.proposals.value, 1);
assert.equal(d.visit_cohort.converted, 0);
assert.equal(d.proposal_cohort.converted, 1);
assert.equal(d.attendance.no_show, 0);
assert.equal(d.history_incomplete, true);
await q(
  `update commercial_contracts set cancelled_at=now(),cancellation_reason='Distrato solicitado' where id=$1`,
  [contract.id],
);
d = await dashboard();
assert.equal(d.metrics.contracts.value, 1);
assert.equal(d.metrics.cancellations.value, 1);
const [detail] = await q(
  `select commercial_detail($1,now()-interval '1 day',now()+interval '1 day','proposals') data`,
  [org],
);
assert.equal(detail.data.total, d.metrics.proposals.value);
await q(`update proposals set proposed_price=98000 where id=$1`, [proposal.id]);
assert.equal(
  Number(
    (
      await q(
        `select count(*) n from commercial_proposal_versions where proposal_id=$1`,
        [proposal.id],
      )
    )[0].n,
  ),
  3,
);
// RLS: another organization cannot be queried even when the UUID is known.
await db.exec(
  `grant usage on schema public,private,auth to authenticated; grant select on organizations,memberships,leads,developments,development_units,proposals,agenda_events to authenticated; set role authenticated;`,
);
assert.equal(
  (
    await q(
      `select count(*) n from commercial_opportunities where organization_id=$1`,
      [other],
    )
  )[0].n,
  0,
);
await rejects(`select commercial_dashboard($1,now()-interval '1 day',now())`, [
  other,
]);
await db.exec("reset role");
await q(`update memberships set role='viewer' where user_id=$1`, [user]);
await db.exec("set role authenticated");
await rejects(
  `insert into commercial_opportunities(organization_id,title,primary_contact_id) values($1,'Forbidden',$2)`,
  [org, buyer],
);
await rejects(
  `insert into commercial_goals(organization_id,metric,starts_on,ends_on,target,created_by) values($1,'visits',current_date,current_date,12,$2)`,
  [org, user],
);
await db.exec("reset role");
assert.equal(relativeChange(1, 0), null);
assert.equal(relativeChange(15, 10), 50);
assert.equal(
  periodRange({ period: "today" }, new Date("2026-10-21T02:59:59Z")).start,
  "2026-10-20T03:00:00.000Z",
);
assert.equal(
  periodRange({ period: "today" }, new Date("2026-10-21T03:00:00Z")).start,
  "2026-10-21T03:00:00.000Z",
);
assert.throws(() =>
  periodRange({ period: "custom", start: "2026-02-30", end: "2026-03-01" }),
);
await rejects(`update commercial_opportunities set stage='lost',loss_reason='other',loss_note=null where id=$1`,[op.id]);
// A documented stage exit contributes to the actual time distribution.
const [timed] = await q(
  `insert into commercial_opportunities(organization_id,title,primary_contact_id,created_at)
   values($1,'Oportunidade com início documentado',$2,now()-interval '2 days') returning id`,
  [org, buyer],
);
await q(
  `update commercial_opportunities
   set stage='qualified', qualification='{"need":"morar","product":"apto","horizon":"ano","commercial_fit":"ok"}'
   where id=$1`, [timed.id],
);
const duration = await q(
  `select * from commercial_stage_durations($1,now()-interval '1 day',now()+interval '1 day') where stage='new'`,
  [org],
);
assert.equal(duration.length, 1);
assert.ok(Number(duration[0].sample_size) >= 1);
assert.ok(Number(duration[0].median_hours) >= 0);
// An unauthorized organization must not reveal any duration rows.
const outsideDurations = await q(
  `select * from commercial_stage_durations($1,now()-interval '1 day',now()+interval '1 day')`,
  [other],
);
assert.deepEqual(outsideDurations, []);
console.log(
  "PASS: isolated PostgreSQL migrations, qualification, couple, multiple interests, proposal revisions, visit chronology, rescheduling, reactivation, immutable history, financial idempotency, cohorts, reconciliation, organization RLS, viewer permissions, dates, zero reference, cross-development attribution, broker filters and stage duration distributions.",
);
await db.close();
