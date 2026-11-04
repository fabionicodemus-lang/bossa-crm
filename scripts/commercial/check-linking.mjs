import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";

process.on("uncaughtException", (e) => {
  console.error("Commercial linking:", e.message, e.where ?? "", e.stack ?? "");
  process.exit(1);
});
const db = new PGlite();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const rejects = async (sql, params = []) => assert.rejects(() => q(sql, params));
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema private;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table organizations(id uuid primary key);
create table profiles(id uuid primary key);
create table memberships(organization_id uuid,user_id uuid,role text);
create table leads(id uuid primary key,organization_id uuid,kind text,name text,company text,owner_id uuid,next_action text,source text,archived_at timestamptz);
create table developments(id uuid primary key,organization_id uuid);
create table development_units(id uuid primary key,organization_id uuid,development_id uuid);
create table proposals(id uuid primary key default gen_random_uuid(),organization_id uuid,lead_id uuid,development_id uuid,unit_id uuid,status text,proposed_price numeric,payment_plan jsonb,snapshot jsonb);
create table agenda_events(id uuid primary key default gen_random_uuid(),organization_id uuid,lead_id uuid,status text,starts_at timestamptz,event_type text,created_by_kind text,metadata jsonb);
create table lead_funnel_milestones(id uuid);
create table messages(id uuid primary key,organization_id uuid,lead_id uuid,created_at timestamptz,direction text,sender_kind text,status text,body text);
create table lead_handoffs(id uuid primary key,organization_id uuid,lead_id uuid,created_at timestamptz,accepted_at timestamptz,status text,requested_by text);
create table nara_operational_settings(organization_id uuid,business_timezone text,business_days int[],business_open time,business_close time,hot_lead_sla_minutes integer);
create function private.is_org_member(uuid) returns boolean language sql as $$ select exists(select 1 from public.memberships where organization_id=$1 and user_id=auth.uid()) $$;
create function private.can_edit_org(uuid) returns boolean language sql as $$ select exists(select 1 from public.memberships where organization_id=$1 and user_id=auth.uid() and role in ('admin','comercial')) $$;
create function private.is_org_admin(uuid) returns boolean language sql as $$ select exists(select 1 from public.memberships where organization_id=$1 and user_id=auth.uid() and role='admin') $$;
`);
for (const name of [
  "20261021011240_commercial_metrics_foundation.sql",
  "20261021011422_commercial_metrics_queries.sql",
  "20261021012121_commercial_operations_insights.sql",
  "20261021094500_commercial_development_attribution.sql",
]) await db.exec(fs.readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8"));
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const org = id(1), other = id(2), user = id(10), buyer = id(20), spouse = id(21), broker = id(22), fresh = id(23), archived = id(24), outsider = id(25), dev = id(30), altDev = id(31), unit = id(40);
await q("insert into organizations values($1),($2)", [org, other]);
await q("insert into profiles values($1)", [user]);
await q("insert into memberships values($1,$2,'admin')", [org, user]);
await q("select set_config('request.jwt.claim.sub',$1,false)", [user]);
for (const [contact, company, kind] of [[buyer, org, "cliente"], [spouse, org, "cliente"], [broker, org, "corretor"], [fresh, org, "cliente"], [archived, org, "cliente"], [outsider, other, "cliente"]]) {
  await q("insert into leads(id,organization_id,kind,name) values($1,$2,$3,$4)", [contact, company, kind, `Teste ${contact}`]);
}
await q("update leads set archived_at=now() where id=$1", [archived]);
await q("insert into commercial_settings(organization_id) values($1),($2)", [org, other]);
await q("insert into developments values($1,$2),($3,$2)", [dev, org, altDev]);
await q("insert into development_units values($1,$2,$3)", [unit, org, dev]);
const [op] = await q("insert into commercial_opportunities(organization_id,title,primary_contact_id,broker_id) values($1,'Compra familiar',$2,$3) returning id,created_at,owner_id,stage", [org, buyer, broker]);
const [foreign] = await q("insert into commercial_opportunities(organization_id,title,primary_contact_id) values($1,'Outra organização',$2) returning id", [other, outsider]);
await q("insert into commercial_participants values($1,$2,$3,'spouse')", [org, op.id, spouse]);
await q("insert into commercial_interests(organization_id,opportunity_id,development_id,is_primary) values($1,$2,$3,true),($1,$2,$4,false)", [org, op.id, dev, altDev]);
const proposal = async (contact = buyer, snapshot = {}, status = "rascunho", opportunity = null) => (await q(
  "insert into proposals(organization_id,lead_id,development_id,unit_id,status,proposed_price,payment_plan,snapshot,opportunity_id) values($1,$2,$3,$4,$5,100000,'{}',$6,$7) returning id,opportunity_id,status",
  [org, contact, dev, unit, status, JSON.stringify(snapshot), opportunity],
))[0];
const review = async (source, entity = "proposals") => (await q("select * from commercial_link_reviews where organization_id=$1 and entity_type=$2 and entity_id=$3", [org, entity, source.id]))[0];
const resolve = async (source, opportunity, entity = "proposals") => (await q("select commercial_resolve_link($1,$2,$3,$4) id", [org, entity, source.id, opportunity]))[0].id;

const disabled = await proposal();
assert.equal(disabled.opportunity_id, null);
assert.equal((await review(disabled)).initial_reason, "disabled");
await q("update commercial_settings set auto_link_enabled=true where organization_id=$1", [org]);
assert.equal((await q("select opportunity_id from proposals where id=$1", [disabled.id]))[0].opportunity_id, null, "Activation never backfills existing records");

const single = await proposal();
assert.equal(single.opportunity_id, op.id);
assert.equal((await review(single)).initial_reason, "unique_customer");
assert.equal((await review(single)).candidate_count, 1);
assert.equal((await proposal(spouse)).opportunity_id, op.id, "Known spouse shares purchase");
assert.equal((await q("select count(*) n from commercial_opportunities where organization_id=$1", [org]))[0].n, 1, "Two interests never create another purchase");

const [second] = await q("insert into commercial_opportunities(organization_id,title,primary_contact_id,broker_id) values($1,'Segunda intenção real',$2,$3) returning id", [org, buyer, broker]);
const ambiguous = await proposal();
assert.equal(ambiguous.opportunity_id, null);
assert.equal((await review(ambiguous)).initial_reason, "ambiguous");
assert.equal((await review(ambiguous)).candidate_count, 2);
assert.equal(await resolve(ambiguous, second.id), second.id);
const eventsBefore = (await q("select count(*) n from commercial_events where entity_id=$1", [ambiguous.id]))[0].n;
assert.equal(await resolve(ambiguous, second.id), second.id);
assert.equal((await q("select count(*) n from commercial_events where entity_id=$1", [ambiguous.id]))[0].n, eventsBefore, "Replay cannot duplicate events");
assert.equal((await review(ambiguous)).initial_reason, "ambiguous", "Original reason remains immutable");
assert.equal((await review(ambiguous)).resolved_by, user);
await rejects("select commercial_resolve_link($1,'proposals',$2,$3)", [org, ambiguous.id, op.id]);

const brokerProposal = await proposal(broker);
assert.equal(brokerProposal.opportunity_id, null);
assert.equal((await review(brokerProposal)).initial_reason, "buyer_not_identified");
assert.equal(await resolve(brokerProposal, op.id), op.id, "Broker assignment requires explicit review");
const missing = await proposal(fresh);
assert.equal((await review(missing)).initial_reason, "no_candidate");
await rejects("select commercial_resolve_link($1,'proposals',$2,$3)", [org, missing.id, op.id]);
assert.equal((await review(await proposal(archived))).initial_reason, "archived_contact");

await q("update commercial_opportunities set stage='lost',loss_reason='postponed' where id=$1", [second.id]);
const detected = await proposal(buyer, { auto_detected: true, source: "whatsapp_commercial_intelligence" }, "enviada");
assert.equal(detected.opportunity_id, null);
assert.equal((await review(detected)).initial_reason, "automation_review");
await resolve(detected, op.id);
assert.equal((await q("select count(*) n from commercial_events where entity_id=$1 and event_type='proposal_sent' and confirmation='confirmed'", [detected.id]))[0].n, 0, "Linking a detection never invents sending");
const linkedDetection = await proposal(buyer, { auto_detected: true }, "enviada", op.id);
assert.equal((await q("select confirmation from commercial_events where entity_id=$1 and event_type='proposal_sent'", [linkedDetection.id]))[0].confirmation, "pending");
const sent = await proposal(buyer, {}, "enviada");
assert.equal((await q("select confirmation from commercial_events where entity_id=$1 and event_type='proposal_sent'", [sent.id]))[0].confirmation, "confirmed");

await q("select set_config('request.jwt.claim.sub','',false)");
assert.equal((await review(await proposal())).initial_reason, "system_review");
await q("select set_config('request.jwt.claim.sub',$1,false)", [user]);
const [visit] = await q("insert into agenda_events(organization_id,lead_id,status,starts_at,event_type,created_by_kind) values($1,$2,'scheduled',now()+interval '1 day','visita','human') returning id,opportunity_id,status,starts_at", [org, buyer]);
assert.equal(visit.opportunity_id, op.id);
assert.equal(visit.status, "scheduled");
assert.equal((await review(visit, "agenda_events")).initial_reason, "unique_customer");
const [aiVisit] = await q("insert into agenda_events(organization_id,lead_id,status,starts_at,event_type,created_by_kind) values($1,$2,'scheduled',now()+interval '1 day','visita','ai') returning id,opportunity_id", [org, buyer]);
assert.equal(aiVisit.opportunity_id, null);
assert.equal((await review(aiVisit, "agenda_events")).initial_reason, "automation_review");
const [oldVisit] = await q("insert into agenda_events(organization_id,lead_id,status,starts_at,event_type) values($1,$2,'completed',now()-interval '1 day','visita') returning id,opportunity_id", [org, buyer]);
assert.equal(oldVisit.opportunity_id, null);
assert.equal((await review(oldVisit, "agenda_events")).initial_reason, "historical_or_closed");
const [task] = await q("insert into agenda_events(organization_id,lead_id,status,starts_at,event_type) values($1,$2,'scheduled',now()+interval '1 day','tarefa') returning id", [org, buyer]);
assert.equal(await review(task, "agenda_events"), undefined, "Internal task is not a commercial visit");
await rejects("select commercial_resolve_link($1,'agenda_events',$2,$3)", [org, task.id, op.id]);

const purchaseCount = (await q("select count(*) n from commercial_opportunities", []))[0].n;
await q("update leads set owner_id=$1,next_action='Atendimento humano' where id=$2", [user, buyer]);
assert.equal((await q("select count(*) n from commercial_opportunities"))[0].n, purchaseCount, "Handoff must not create a purchase");
const unchanged = (await q("select id,created_at,owner_id,stage from commercial_opportunities where id=$1", [op.id]))[0];
assert.deepEqual(unchanged, op, "Linking preserves original stage, creation and attribution");
await rejects("insert into proposals(organization_id,lead_id,status) values($1,$2,'rascunho')", [org, outsider]);
await rejects("select commercial_resolve_link($1,'proposals;drop table leads',$2,$3)", [org, missing.id, op.id]);

// Real authenticated role, not just a superuser with a fake JWT.
await db.exec(`grant usage on schema public,private,auth to authenticated;
grant select on organizations,memberships,leads,developments,development_units to authenticated;
grant select,insert,update on proposals,agenda_events to authenticated;
alter table proposals enable row level security;
create policy test_proposals_read on proposals for select to authenticated using(private.is_org_member(organization_id));
create policy test_proposals_write on proposals for insert to authenticated with check(private.can_edit_org(organization_id));
create policy test_proposals_update on proposals for update to authenticated using(private.can_edit_org(organization_id)) with check(private.can_edit_org(organization_id));
set role authenticated;`);
assert.equal((await q("select * from commercial_link_candidates($1,$2)", [other, outsider])).length, 0);
await rejects("select commercial_resolve_link($1,'proposals',$2,$3)", [other, missing.id, foreign.id]);
await rejects("select commercial_resolve_link($1,'proposals',$2,$3)", [org, missing.id, foreign.id]);
assert.equal((await proposal()).opportunity_id, op.id, "Authorized source writes retain invoker privileges");
await rejects("update commercial_link_reviews set initial_reason='forged' where entity_id=$1", [missing.id]);
await rejects("insert into commercial_link_reviews(organization_id,entity_type,entity_id,status,initial_reason) values($1,'proposals',gen_random_uuid(),'pending','forged')", [org]);
await db.exec("reset role");
await q("update memberships set role='comercial' where user_id=$1", [user]);
await db.exec("set role authenticated");
assert.equal((await q("update commercial_settings set auto_link_enabled=false where organization_id=$1 returning organization_id", [org])).length, 0, "Commercial user cannot toggle configuration");
assert.equal(await resolve(disabled, op.id), op.id, "Commercial user can explicitly resolve matching buyer");
await db.exec("reset role");
await q("update memberships set role='viewer' where user_id=$1", [user]);
await db.exec("set role authenticated");
await rejects("select commercial_resolve_link($1,'agenda_events',$2,$3)", [org, aiVisit.id, op.id]);
await rejects("insert into proposals(organization_id,lead_id,status) values($1,$2,'rascunho')", [org, buyer]);
assert.equal((await q("select count(*) n from commercial_link_reviews where organization_id=$1", [other]))[0].n, 0);
await db.exec("reset role");
console.log("PASS: conservative linking, disabled default, no backfill, couple/multiple interests, ambiguity, broker review, no inferred buyers, archived contacts, AI pending facts, system actor, visits versus tasks, atomic/idempotent resolution, handoff preservation, organization isolation, audit integrity and admin/commercial/viewer permissions.");
await db.close();
