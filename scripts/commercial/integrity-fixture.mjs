import fs from 'node:fs';
import { schemaSQL, seedSQL, migrations, id, org, user } from './intake-fixture.mjs';
export { id,org,other,user,viewer,broker,dev,unit } from './intake-fixture.mjs';
export const integrityMigration='20261021165139_commercial_contact_integrity.sql';
const read=(file)=>fs.readFileSync(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8');
// Minimal extra legacy schema so the ACTUAL existing merge function is exercised,
// not a substitute implementation. This is still not a complete production restore.
const legacyExtra=`
alter table leads add column phone text, add column metadata jsonb default '{}',
 add column first_name text, add column last_name text, add column email text,
 add column enterprise text, add column group_name text, add column creci text,
 add column kommo_id text, add column backup_owner_id uuid, add column priority_class text,
 add column last_inbound_at timestamptz, add column last_outbound_at timestamptz,
 add column last_human_activity_at timestamptz, add column last_ai_activity_at timestamptz,
 add column opt_out boolean default false, add column archived_reason text,
 add column ai_enabled boolean default false, add column automation_paused boolean default false,
 add column owner_mode text, add column updated_at timestamptz default now();
alter table lead_funnel_milestones add column lead_id uuid;
create table activities(id uuid primary key default gen_random_uuid(),organization_id uuid,lead_id uuid,type text,title text,description text,metadata jsonb);
${['whatsapp_ai_conversation_memory','broker_human_review_state','broker_business_events','broker_performance_jobs','broadcast_recipients','lead_tasks','whatsapp_messages','whatsapp_conversations','ai_usage_logs','client_handoff_alert_jobs','lead_intake_jobs','nara_deferred_replies','nara_followup_sequences','nara_offer_logs','meta_lead_ads_events'].map(t=>`create table ${t}(id uuid primary key default gen_random_uuid(),organization_id uuid,lead_id uuid,status text,dedupe_key text,event_key text,broadcast_id uuid,conversation_id uuid,metadata jsonb);`).join('\n')}
`;
export function integritySetupSql() {
 const phoneOnly=read('042_merge_duplicate_leads.sql').split('create or replace function public.merge_duplicate_lead')[0];
 const baseSeed=seedSQL.replace(/^insert into commercial_settings\(organization_id\).*$/m,'');
 return [schemaSQL,legacyExtra,phoneOnly,read('20261001211000_canonical_whatsapp_identity.sql'),baseSeed,
 `update memberships set role='admin' where user_id='${user}';
  update leads set phone='5547991234567' where id='${id(20)}';
  update leads set phone='5547991234567',archived_at=now() where id='${id(21)}';
  insert into messages(id,organization_id,lead_id,body,status) values('${id(800)}','${org}','${id(21)}','Mensagem anterior à nova coleta','sent');
  insert into proposals(id,organization_id,lead_id,status,proposed_price) values('${id(801)}','${org}','${id(21)}','rascunho',100000);
  insert into agenda_events(id,organization_id,lead_id,title,status,starts_at,event_type) values('${id(802)}','${org}','${id(21)}','Visita antiga','scheduled',now()+interval '1 day','visita');
  insert into activities(id,organization_id,lead_id,type,title) values('${id(803)}','${org}','${id(21)}','nota','Histórico anterior');`,
 ...[...migrations,'20261021162332_commercial_fact_stage_sync.sql',integrityMigration].map(read),
 `grant select,update on leads to service_role;
 grant select on messages,whatsapp_messages,whatsapp_conversations,activities to service_role;
 grant select,insert,update,delete on messages,whatsapp_messages,whatsapp_conversations to authenticated;
 grant delete on leads to authenticated;
 create policy test_leads_delete on leads for delete to authenticated using(private.is_org_admin(organization_id));
 alter table messages enable row level security;
 create policy test_messages_read on messages for select to authenticated using(private.is_org_member(organization_id));
 create policy test_messages_write on messages for all to authenticated using(private.can_edit_org(organization_id)) with check(private.can_edit_org(organization_id));`];
}
