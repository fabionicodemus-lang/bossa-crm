import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {session, literal as lit, json, pause} from './runtime.mjs';

const id = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=id(1), other=id(2), admin=id(10), editor=id(11), viewer=id(12), foreign=id(13);
const buyer=id(20), alias=id(21), aiBuyer=id(22), foreignBuyer=id(23), dev=id(30), unit=id(31);
const data={lead_id:buyer,development_id:dev,unit_id:unit,status:'rascunho',list_price:100000,
  proposed_price:90000,discount_amount:10000,payment_plan:{entry_total:90000},snapshot:{workflow_status:'rascunho'}};
const items=[{kind:'entrada',label:'Synthetic entry',quantity:1,amount:90000}];

export async function validateIntegration(db,report,output) {
  const {sql} = db;
  const as = (user,statement,role='authenticated') => sql(session(user,statement,role));
  const one = async query => JSON.parse(await sql(`select row_to_json(q) from (${query}) q;`));
  const rows = async query => JSON.parse(await sql(`select coalesce(json_agg(q),'[]') from (${query}) q;`));
  const human = async (statement,user=editor) => JSON.parse(await as(user,`select to_jsonb(${statement});`));
  const service = async statement => JSON.parse(await as(null,`select to_jsonb(${statement});`,'service_role'));
  const fail = (run,pattern) => assert.rejects(run,pattern);
  async function check(name,run) {
    try {await run(); report.checks.push({name,status:'passed'}); console.log(`PASS integrated: ${name}`);}
    catch(error) {report.checks.push({name,status:'failed',error:String(error)});throw error;}
  }
  const prepare = (request,type,payload,user=editor) => human(`commercial_prepare_source_request('${org}','${id(request)}','${type}',${json(payload)})`,user);
  const finish = (request,action='acknowledge',user=editor) => human(`commercial_finish_source_recovery('${org}','${id(request)}','${action}')`,user);
  const save = (request,incoming=data) => `commercial_save_proposal_once('${org}','${id(request)}',${json(incoming)},${json(items)},null,null)`;
  const payload = incoming => ({data:incoming,items,id:null,expected_updated_at:null});
  const counts = () => one(`select (select count(*) from proposals) proposals,(select count(*) from proposal_payment_items) items,
    (select count(*) from activities) activities,(select count(*) from commercial_events) events,
    (select count(*) from commercial_proposal_versions) versions,(select count(*) from commercial_source_requests) receipts,
    (select count(*) from commercial_ai_proposal_detections) detections`);
  let proposal, opportunity, agenda;

  await check('actual legacy constraints, enums, triggers and synthetic identities',async()=>{
    await sql(`insert into organizations(id,name,slug) values('${org}','Synthetic organization A','synthetic-a'),('${other}','Synthetic organization B','synthetic-b');
      insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at) values
      ('${admin}','admin@example.invalid','{}',now(),now()),('${editor}','editor@example.invalid','{}',now(),now()),
      ('${viewer}','viewer@example.invalid','{}',now(),now()),('${foreign}','foreign@example.invalid','{}',now(),now());
      insert into memberships(organization_id,user_id,role) values
      ('${org}','${admin}','admin'),('${org}','${editor}','comercial'),('${org}','${viewer}','viewer'),('${other}','${foreign}','admin');
      insert into commercial_settings(organization_id) values('${org}'),('${other}');
      insert into commercial_ranking_settings(organization_id) values('${org}'),('${other}');
      insert into developments(id,organization_id,name,slug) values('${dev}','${org}','Synthetic development','synthetic'),('${id(32)}','${other}','Foreign synthetic development','synthetic');
      insert into development_units(id,organization_id,development_id,unit_code,list_price) values('${unit}','${org}','${dev}','101',100000),('${id(33)}','${other}','${id(32)}','201',100000);
      insert into leads(id,organization_id,kind,name,stage) values
      ('${buyer}','${org}','cliente','Synthetic buyer','novo_triagem'),('${alias}','${org}','cliente','Synthetic alias','novo_triagem'),
      ('${aiBuyer}','${org}','cliente','Synthetic AI buyer','novo_triagem'),('${foreignBuyer}','${other}','cliente','Foreign synthetic buyer','novo_triagem');`);
    assert.equal((await one("select count(*)::int n from pg_constraint where conname='agenda_prevent_assignee_overlap'")).n,1);
    assert.equal((await one("select count(*)::int n from pg_trigger where tgname='commercial_00_lock_contacts' and not tgisinternal")).n,4);
    assert.equal(await sql("select 'lead'::sender_kind;"),'lead');
    await fail(()=>sql(`insert into messages(organization_id,lead_id,direction,sender_kind,body) values('${org}','${buyer}','in','contact','Invalid enum');`),/invalid input value for enum/);
  });

  await check('human proposal, installments, recovery receipt and activity commit once',async()=>{
    await prepare(100,'proposals',payload(data));
    const result=await human(save(100)); proposal=result.record;
    assert.equal(result.replayed,false);assert.equal(proposal.created_by,editor);
    const before=await counts(); assert.equal((await human(save(100))).replayed,true);assert.deepEqual(await counts(),before);
    await fail(()=>human(save(100,{...data,notes:'changed command'})),/COMMERCIAL_REQUEST_REUSED/);
    assert.equal((await rows(`select * from proposal_payment_items where proposal_id='${proposal.id}'`)).length,1);
    await finish(100);
  });

  await check('verified intention links original proposal and snapshots in the same database',async()=>{
    const command=`commercial_create_verified_intent('${org}','proposals','${proposal.id}','${buyer}',
      'Synthetic purchase intention','Review synthetic conditions','Synthetic signed review evidence only',${lit(proposal.updated_at)}::timestamptz,true)`;
    const result=await human(command);opportunity=result.opportunity_id;assert.ok(opportunity);
    assert.equal((await human(command)).created,false);
    const record=await one(`select * from commercial_intent_confirmations where opportunity_id='${opportunity}'`);
    assert.equal(record.source_snapshot.id,proposal.id);assert.equal(record.confirmed_by,editor);
    assert.equal((await one(`select primary_contact_id from commercial_opportunities where id='${opportunity}'`)).primary_contact_id,buyer);
    proposal=await one(`select * from proposals where id='${proposal.id}'`);
  });

  const statusPayload=(row,status)=>({data:{operation:'status',workflow_status:status,expected_version:row.version},items:[],id:row.id,expected_updated_at:row.updated_at});
  const status=(request,row,workflow)=>`commercial_proposal_status_once('${org}','${id(request)}','${row.id}',${lit(row.updated_at)}::timestamptz,${row.version},'${workflow}')`;
  await check('quick status preserves finances and keeps sending evidence pending',async()=>{
    const beforeItems=await rows(`select * from proposal_payment_items where proposal_id='${proposal.id}'`);
    await prepare(101,'proposals',statusPayload(proposal,'enviada'));
    const result=await human(status(101,proposal,'enviada'));const old=proposal;proposal=result.record;
    assert.equal(proposal.version,old.version+1);assert.equal(proposal.sent_at,null);
    const count=await counts();assert.equal((await human(status(101,old,'enviada'))).replayed,true);assert.deepEqual(await counts(),count);
    assert.deepEqual(await rows(`select * from proposal_payment_items where proposal_id='${proposal.id}'`),beforeItems);
    assert.equal((await one(`select count(*)::int n from commercial_events where event_type='proposal_sent' and confirmation='confirmed'`)).n,0);
    assert.equal((await one(`select count(*)::int n from commercial_facts('${org}','{}') where metric in ('proposals','contracts','receipts')`)).n,0);
    await finish(101);
  });

  await check('activity failure rolls linked proposal, ledger, version and receipt back',async()=>{
    const before=await counts(); const original=await one(`select * from proposals where id='${proposal.id}'`);
    await prepare(102,'proposals',statusPayload(proposal,'aprovada'));
    await sql(`create function test_integrated_activity_failure() returns trigger language plpgsql as $$ begin
      if new.metadata->>'request_id'='${id(102)}' then raise exception 'INTEGRATED_ACTIVITY_FAILURE'; end if; return new; end $$;
      create trigger test_integrated_activity_failure before insert on activities for each row execute function test_integrated_activity_failure();`);
    await fail(()=>human(status(102,proposal,'aprovada')),/INTEGRATED_ACTIVITY_FAILURE/);
    assert.deepEqual(await counts(),before);assert.deepEqual(await one(`select * from proposals where id='${proposal.id}'`),original);
    await sql('drop trigger test_integrated_activity_failure on activities; drop function test_integrated_activity_failure();');
    await finish(102,'abandon');
  });

  await check('agenda recovery, opportunity link and actual legacy overlap exclusion',async()=>{
    const event={lead_id:buyer,assigned_to:editor,title:'Synthetic visit',event_type:'visita',meeting_mode:'presencial',
      starts_at:'2035-01-01T12:00:00Z',ends_at:'2035-01-01T13:00:00Z'};
    await prepare(103,'agenda_events',event);
    const command=`commercial_create_agenda_once('${org}','${id(103)}',${json(event)})`;
    agenda=(await human(command)).record;assert.equal((await human(command)).replayed,true);await finish(103);
    await human(`commercial_resolve_link('${org}','agenda_events','${agenda.id}','${opportunity}')`);
    await as(editor,`update agenda_events set visit_kind='buyer' where id='${agenda.id}';`);
    await fail(()=>as(editor,`insert into agenda_events(organization_id,assigned_to,title,starts_at,ends_at)
      values('${org}','${editor}','Synthetic conflicting slot','2035-01-01T12:30:00Z','2035-01-01T13:30:00Z');`),/agenda_prevent_assignee_overlap/);
    await fail(()=>as(editor,`update agenda_events set status='completed' where id='${agenda.id}';`),/Future visit cannot be completed/);
    await as(editor,`insert into agenda_events(organization_id,lead_id,assigned_to,created_by,title,starts_at,ends_at,status,visit_kind,opportunity_id,event_type)
      values('${org}','${buyer}','${editor}','${editor}','Synthetic completed visit',now()-interval '2 days',now()-interval '2 days'+interval '1 hour','completed','buyer','${opportunity}','visita');`);
    assert.equal((await one(`select count(*)::int n from commercial_facts('${org}','{}') where metric='visits'`)).n,1);
    assert.equal((await one(`select stage from commercial_opportunities where id='${opportunity}'`)).stage,'contact');
  });

  await check('documented sending, admin contract and receipt appear in scoped indicators',async()=>{
    await as(editor,`update proposals set status='rascunho',commercial_request=null where id='${proposal.id}';
      update proposals set status='enviada',sent_at=clock_timestamp() where id='${proposal.id}';`);
    assert.equal((await one(`select count(*)::int n from commercial_facts('${org}','{}') where metric='proposals'`)).n,1);
    const contract=`insert into commercial_contracts(id,organization_id,opportunity_id,proposal_id,unit_id,signed_at,amount,document_reference,created_by)
      values('${id(200)}','${org}','${opportunity}','${proposal.id}','${unit}',now()-interval '1 hour',90000,'synthetic-document-only','${admin}');`;
    await fail(()=>as(editor,contract),/row-level security/);await as(admin,contract);
    const receipt=`insert into commercial_receipts(organization_id,contract_id,received_at,amount,kind,source,external_id,evidence,confirmed_by)
      values('${org}','${id(200)}',now()-interval '30 minutes',9000,'entry','synthetic','receipt-1','Synthetic receipt evidence','${admin}');`;
    await as(admin,receipt);await fail(()=>as(admin,receipt),/duplicate key/);
    const facts=await rows(`select metric,count(*)::int n,sum(amount) amount from commercial_facts('${org}',${json({development:dev})}) group by metric`);
    assert.equal(facts.find(x=>x.metric==='contracts').n,1);assert.equal(Number(facts.find(x=>x.metric==='receipts').amount),9000);
    const dashboard=await human(`commercial_dashboard('${org}',now()-interval '7 days',now()+interval '1 day','{}')`);assert.ok(dashboard);
    const detail=await human(`commercial_detail('${org}',now()-interval '7 days',now()+interval '1 day','contracts','{}',0)`);
    assert.equal(detail.total,1);assert.equal(detail.rows[0].entity_id,id(200));
    assert.ok(await human(`commercial_operations('${org}',now()-interval '7 days',now()+interval '1 day')`));
    await as(editor,`select * from commercial_stage_durations('${org}',now()-interval '7 days',now()+interval '1 day','{}');`);
  });

  const aiData=(source,price=91000)=>({lead_id:aiBuyer,development_id:dev,unit_id:unit,list_price:100000,proposed_price:price,
    discount_amount:100000-price,notes:'Synthetic AI detection',payment_plan:{entry_total:price},
    snapshot:{workflow_status:'rascunho',source:'whatsapp_commercial_intelligence',auto_detected:true,auto_confidence:0.93,
      auto_signature:`whatsapp-auto:${aiBuyer}:${dev}:101:${price}:2026-10-21`,unit_code:'101',source_message_ids:[id(source)]},summary:'Synthetic detection review'});
  const detect=(source,price=91000)=>{const incoming=aiData(source,price);return `commercial_record_detected_proposal('${org}','${id(source)}',${lit(incoming.snapshot.auto_signature)},${json(incoming)},${json([{kind:'entrada',quantity:1,amount:price}])})`;};
  let detected;
  await check('WhatsApp detection uses full lead/message schema and protects subsequent human edits',async()=>{
    await sql(`insert into messages(id,organization_id,lead_id,direction,sender_kind,body,created_at) values
      ('${id(300)}','${org}','${aiBuyer}','in','lead','Synthetic detected offer','2026-10-21T15:00:00Z'),
      ('${id(301)}','${org}','${aiBuyer}','in','lead','Synthetic follow-up','2026-10-21T15:00:00Z');`);
    const before=await one("select count(*)::int n from commercial_events where event_type in ('proposal_sent','contract_signed') and confirmation='confirmed'");
    detected=await service(detect(300));assert.equal(detected.outcome,'created');const count=await counts();
    assert.equal((await service(detect(300))).replayed,true);assert.deepEqual(await counts(),count);
    const record=await one(`select * from proposals where id='${detected.proposalId}'`);assert.equal(record.status,'rascunho');assert.equal(record.created_by,null);
    const lead=await one(`select owner_mode,ai_enabled,automation_paused from leads where id='${aiBuyer}'`);
    assert.equal(lead.owner_mode,'human');assert.equal(lead.ai_enabled,false);assert.equal(lead.automation_paused,true);
    await as(editor,`update proposals set notes='Human review on real schema',updated_by='${editor}',version=version+1 where id='${record.id}';`);
    assert.equal((await service(detect(301))).outcome,'protected');
    assert.equal((await one(`select notes from proposals where id='${record.id}'`)).notes,'Human review on real schema');
    assert.deepEqual(await one("select count(*)::int n from commercial_events where event_type in ('proposal_sent','contract_signed') and confirmation='confirmed'"),before);
    await fail(()=>human(detect(300)),/permission denied/);
  });

  await check('reviewed contact alias preserves source IDs, events and snapshots',async()=>{
    const before=await counts();const original=await one(`select primary_contact_id from commercial_opportunities where id='${opportunity}'`);
    const proposalBefore=await one(`select * from proposals where id='${proposal.id}'`);
    const reason='Synthetic identity documents reviewed by separate humans';
    const command=`commercial_propose_contact_reconciliation('${org}','${buyer}','${alias}','${buyer}',${lit(reason)},'synthetic-document-reference')`;
    const relation=await human(command);assert.equal(relation.status,'pending');assert.equal((await human(command)).idempotent,true);
    const review=`commercial_review_contact_reconciliation('${org}','${relation.id}',true,${lit(reason)})`;
    await fail(()=>human(review),/FORBIDDEN|SELF_REVIEW/);
    assert.equal((await human(review,admin)).status,'confirmed');assert.equal((await human(review,admin)).idempotent,true);
    assert.deepEqual(await counts(),before);assert.deepEqual(await one(`select primary_contact_id from commercial_opportunities where id='${opportunity}'`),original);
    assert.deepEqual(await one(`select * from proposals where id='${proposal.id}'`),proposalBefore);
    await fail(()=>as(admin,`delete from leads where id='${alias}';`),/COMMERCIAL_HISTORY_PROTECTED/);
  });

  await check('organization boundaries, viewers and anonymous callers cannot write or see foreign evidence',async()=>{
    assert.equal(await as(foreign,'select count(*) from commercial_opportunities;'),'0');
    assert.equal(await as(foreign,'select count(*) from commercial_contact_reconciliations;'),'0');
    assert.equal(await as(foreign,`select count(*) from commercial_facts('${org}','{}');`),'0');
    await fail(()=>human(`commercial_dashboard('${org}',now()-interval '7 days',now(),'{}')`,foreign),/Not authorized/);
    assert.equal(await as(viewer,'select count(*) from commercial_opportunities;'),'1');
    await fail(()=>prepare(400,'proposals',payload(data),viewer),/COMMERCIAL_REQUEST_FORBIDDEN/);
    await fail(()=>prepare(400,'proposals',payload(data),foreign),/COMMERCIAL_REQUEST_FORBIDDEN/);
    await fail(()=>as(null,'select * from commercial_opportunities;','anon'),/permission denied/);
    await fail(()=>as(null,`select next_client_handoff_owner('${org}',null);`,'anon'),/permission denied/);
    await fail(()=>human(`next_client_handoff_owner('${org}',null)`),/permission denied/);
    assert.equal((await service(`next_client_handoff_owner('${org}',null)`)).user_id,null);
    await fail(()=>human(`commercial_propose_contact_reconciliation('${org}','${buyer}','${foreignBuyer}','${buyer}','Synthetic cross organization attempt','synthetic-evidence')`),/CONTACT_UNAVAILABLE/);
    await fail(()=>as(null,`select commercial_record_detected_proposal('${other}','${id(300)}','invalid','{}','[]');`,'service_role'),/SOURCE_UNAVAILABLE/);
  });

  await check('direct legacy proposal and installment writes cannot reference a foreign organization',async()=>{
    report.scopeProbes=[];
    const probe=async(name,statement)=>{
      try {await as(editor,statement);report.scopeProbes.push({name,refused:false});}
      catch(error) {assert.match(String(error),/COMMERCIAL_SOURCE_SCOPE/);report.scopeProbes.push({name,refused:true});}
    };
    await probe('unlinked-proposal-foreign-product',`insert into proposals(organization_id,lead_id,development_id,unit_id,proposed_price)
      values('${org}','${buyer}','${id(32)}','${id(33)}',100000);`);
    await sql(`insert into proposals(id,organization_id,lead_id,development_id,unit_id,proposed_price)
      values('${id(201)}','${other}','${foreignBuyer}','${id(32)}','${id(33)}',100000);`);
    await probe('installment-foreign-proposal',`insert into proposal_payment_items(organization_id,proposal_id,kind,quantity,amount)
      values('${org}','${id(201)}','entrada',1,100000);`);
    await probe('agenda-foreign-assignee',`insert into agenda_events(organization_id,lead_id,assigned_to,title,starts_at,ends_at)
      values('${org}','${buyer}','${foreign}','Foreign assignee','2035-02-01T12:00:00Z','2035-02-01T13:00:00Z');`);
    assert.ok(report.scopeProbes.every(p=>p.refused),JSON.stringify(report.scopeProbes));
  });

  await check('independent concurrent quick status commands have one winner and one stale-version conflict',async()=>{
    const row=await one(`select * from proposals where id='${proposal.id}'`);
    await prepare(410,'proposals',statusPayload(row,'aprovada'),editor);
    await prepare(411,'proposals',statusPayload(row,'recusada'),admin);
    const before=await counts();
    const first=as(editor,`select ${status(410,row,'aprovada')}; select pg_advisory_xact_lock(970001); select pg_sleep(2);`);
    try {
      for(let i=0;i<80;i++) {if(await sql("select exists(select 1 from pg_locks where locktype='advisory' and objid=970001 and granted);")==='t')break;if(i===79)throw Error('Concurrent gate missing');await pause(30);}
      await fail(()=>human(status(411,row,'recusada'),admin),/COMMERCIAL_SOURCE_CHANGED/);await first;
    } catch(error) {await first.catch(()=>{});throw error;}
    const after=await counts();assert.equal(Number(after.activities)-Number(before.activities),1);
    assert.equal((await one(`select version from proposals where id='${row.id}'`)).version,row.version+1);
    await finish(410,'acknowledge',editor);await finish(411,'abandon',admin);
  });

  let concurrentDetected;
  await check('simultaneous identical AI sources create one receipt, item set and activity',async()=>{
    await sql(`insert into messages(id,organization_id,lead_id,direction,sender_kind,body,created_at)
      values('${id(302)}','${org}','${aiBuyer}','in','lead','Synthetic concurrent detection','2026-10-21T15:00:00Z');`);
    const before=await counts();const results=await Promise.all([service(detect(302,92000)),service(detect(302,92000))]);
    assert.equal(results[0].proposalId,results[1].proposalId);assert.equal(results.filter(r=>r.replayed).length,1);
    concurrentDetected=results[0].proposalId;
    const after=await counts();for(const key of ['proposals','items','activities','detections'])assert.equal(Number(after[key])-Number(before[key]),1);
  });

  await check('concurrent human edit wins over a delayed AI update on the complete repository schema',async()=>{
    await sql(`insert into messages(id,organization_id,lead_id,direction,sender_kind,body,created_at)
      values('${id(303)}','${org}','${aiBuyer}','in','lead','Synthetic revised detection','2026-10-21T15:00:00Z');`);
    const first=as(editor,`update proposals set notes='Concurrent human evidence',updated_by='${editor}',version=version+1 where id='${concurrentDetected}';
      select pg_advisory_xact_lock(970002);select pg_sleep(2);`);
    try {
      for(let i=0;i<80;i++) {if(await sql("select exists(select 1 from pg_locks where locktype='advisory' and objid=970002 and granted);")==='t')break;if(i===79)throw Error('AI/human gate missing');await pause(30);}
      assert.equal((await service(detect(303,92000))).outcome,'protected');await first;
    } catch(error) {await first.catch(()=>{});throw error;}
    assert.equal((await one(`select notes from proposals where id='${concurrentDetected}'`)).notes,'Concurrent human evidence');
  });

  await check('AI activity failure rolls the whole detection back and the same source remains retryable',async()=>{
    await sql(`insert into messages(id,organization_id,lead_id,direction,sender_kind,body,created_at)
      values('${id(304)}','${org}','${aiBuyer}','in','lead','Synthetic retryable detection','2026-10-21T15:00:00Z');
      create function test_integrated_ai_failure() returns trigger language plpgsql as $$ begin
       if new.metadata->>'source_message_id'='${id(304)}' then raise exception 'INTEGRATED_AI_FAILURE';end if;return new;end $$;
      create trigger test_integrated_ai_failure before insert on activities for each row execute function test_integrated_ai_failure();`);
    const before=await counts();await fail(()=>service(detect(304,93000)),/INTEGRATED_AI_FAILURE/);assert.deepEqual(await counts(),before);
    await sql('drop trigger test_integrated_ai_failure on activities;drop function test_integrated_ai_failure();');
    assert.equal((await service(detect(304,93000))).outcome,'created');assert.equal((await service(detect(304,93000))).replayed,true);
  });

  await check('all commercial automation remains disabled and no delivery job was created',async()=>{
    assert.equal((await one('select count(*)::int n from commercial_settings where auto_stage_enabled')).n,0);
    assert.equal((await one('select count(*)::int n from commercial_settings where auto_link_enabled')).n,0);
    assert.equal((await one('select count(*)::int n from client_handoff_alert_jobs')).n,0);
    assert.equal((await one('select count(*)::int n from broker_after_hours_alert_jobs')).n,0);
    // A managed Supabase baseline includes pg_cron. Its presence is not an
    // automation: require zero active jobs without removing the platform table.
    if (await sql("select to_regclass('cron.job') is not null;")==='t') {
      assert.equal((await one('select count(*)::int n from cron.job where active')).n,0);
    }
  });
  fs.writeFileSync(path.join(output,'integration-summary.json'),JSON.stringify({checks:report.checks,counts:await counts()},null,2)+'\n');
  const {inspectCatalog} = await import('./inspect-catalog.mjs');
  await inspectCatalog(db,report,output,{org,buyer,aiBuyer});
}
