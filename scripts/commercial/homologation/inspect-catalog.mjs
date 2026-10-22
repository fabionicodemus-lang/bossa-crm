import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {session} from './runtime.mjs';

export async function inspectCatalog(db,report,output,{org,buyer}) {
  const {sql}=db;
  const rows=async query=>JSON.parse(await sql(`select coalesce(json_agg(q),'[]') from (${query}) q;`));
  const catalog={};
  catalog.tables=await rows(`select c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,
    has_table_privilege('anon',c.oid,'SELECT') anon_select,
    has_table_privilege('authenticated',c.oid,'SELECT') authenticated_select,
    has_table_privilege('authenticated',c.oid,'INSERT') authenticated_insert,
    has_table_privilege('authenticated',c.oid,'UPDATE') authenticated_update,
    has_table_privilege('authenticated',c.oid,'DELETE') authenticated_delete,
    has_table_privilege('service_role',c.oid,'SELECT') service_select
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' order by c.relname`);
  catalog.functions=await rows(`select p.oid::regprocedure::text identity,n.nspname schema,p.proname,p.prosecdef,p.provolatile,p.proconfig,
    has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
    has_function_privilege('service_role',p.oid,'EXECUTE') service_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
    and p.prokind='f' order by 1`);
  catalog.triggers=await rows(`select tgrelid::regclass::text relation,tgname,tgenabled,pg_get_triggerdef(oid) definition
    from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace='public'::regnamespace)
    order by 1,2`);
  catalog.constraints=await rows(`select conrelid::regclass::text relation,conname,contype,convalidated,pg_get_constraintdef(oid) definition
    from pg_constraint where connamespace='public'::regnamespace order by 1,2`);
  catalog.indexes=await rows(`select i.indrelid::regclass::text relation,c.relname,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) definition
    from pg_index i join pg_class c on c.oid=i.indexrelid where c.relnamespace='public'::regnamespace order by 1,2`);
  catalog.policies=await rows(`select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies
    where schemaname in ('public','storage') order by schemaname,tablename,policyname`);
  catalog.foreignKeysWithoutUnconditionalLeadingIndex=await rows(`select c.conrelid::regclass::text relation,c.conname,pg_get_constraintdef(c.oid) definition
    from pg_constraint c where c.contype='f' and c.connamespace='public'::regnamespace
    and not exists(select 1 from pg_index i where i.indrelid=c.conrelid and i.indisvalid and i.indisready and i.indpred is null
      and (select array_agg(k order by ord) from unnest(i.indkey::smallint[]) with ordinality t(k,ord)
        where ord<=cardinality(c.conkey))=c.conkey) order by 1,2`);
  assert.equal(catalog.tables.filter(t=>t.relname.startsWith('commercial_')&&!t.relrowsecurity).length,0);
  assert.equal(catalog.tables.filter(t=>t.relname.startsWith('commercial_')&&t.anon_select).length,0);
  assert.equal(catalog.constraints.filter(c=>!c.convalidated).length,0);
  assert.equal(catalog.indexes.filter(i=>!i.indisvalid||!i.indisready).length,0);
  const privileged=catalog.functions.filter(f=>f.schema==='public'&&f.proname.startsWith('commercial_')&&f.prosecdef);
  assert.equal(privileged.length,2);
  for(const f of privileged) {
    assert.equal(f.anon_execute,false);assert.equal(f.service_execute,false);assert.equal(f.authenticated_execute,true);
    assert.ok(f.proconfig.includes('search_path=pg_catalog, public, pg_temp'));
  }
  const ai=catalog.functions.find(f=>f.proname==='commercial_record_detected_proposal');
  assert.equal(ai.prosecdef,false);assert.equal(ai.authenticated_execute,false);assert.equal(ai.service_execute,true);
  const handoff=catalog.functions.find(f=>f.proname==='next_client_handoff_owner');
  assert.equal(handoff.anon_execute,false);assert.equal(handoff.authenticated_execute,false);assert.equal(handoff.service_execute,true);
  try {await sql('create extension plpgsql_check;');catalog.plpgsqlCheck='available';}
  catch(error) {catalog.plpgsqlCheck={available:false,reason:String(error).split('\n').slice(0,3).join('\n')};}
  fs.writeFileSync(path.join(output,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
  report.catalog={tables:catalog.tables.length,functions:catalog.functions.length,triggers:catalog.triggers.length,
    constraints:catalog.constraints.length,indexes:catalog.indexes.length,policies:catalog.policies.length,
    commercialTables:catalog.tables.filter(t=>t.relname.startsWith('commercial_')).length,
    commercialSecurityDefiners:privileged.map(f=>f.identity),
    legacySecurityDefiners:catalog.functions.filter(f=>f.prosecdef&&!privileged.includes(f)).map(f=>f.identity),
    foreignKeysWithoutUnconditionalLeadingIndex:catalog.foreignKeysWithoutUnconditionalLeadingIndex.filter(f=>f.relation.startsWith('commercial_')).length,
    plpgsqlCheck:catalog.plpgsqlCheck};
  const preflight=fs.readFileSync(new URL('./preflight-source-scope.sql',import.meta.url),'utf8').trim().replace(/;$/,'');
  report.preflightViolations=await rows(preflight);
  assert.deepEqual(report.preflightViolations,[]);
  console.log('PASS catalog: commercial RLS, no anonymous table grant, valid constraints/indexes and restricted write gates');

  // Synthetic volume only. Keep automatic stage/link settings disabled.
  await sql(`insert into leads(id,organization_id,kind,name,stage)
    select md5('synthetic-performance-contact-'||n)::uuid,'${org}','cliente','Synthetic performance contact '||n,'novo_triagem' from generate_series(1,2000)n;
    insert into commercial_opportunities(organization_id,title,primary_contact_id,stage)
    select '${org}','Synthetic performance purchase '||n,md5('synthetic-performance-contact-'||n)::uuid,'contact' from generate_series(1,2000)n;
    analyze leads;
    analyze commercial_opportunities; analyze commercial_events; analyze commercial_proposal_versions;`);
  const editor='10000000-0000-4000-8000-000000000011';
  const plans={};
  for(const [name,query] of [
    ['contact-history-negative',`select commercial_contact_has_history('${org}','10000000-0000-4000-8000-999999999999')`],
    ['snapshot-history-scan',`select id from commercial_events where organization_id='${org}' and
      (commercial_snapshot_has_contact(previous_state,'10000000-0000-4000-8000-999999999999') or
       commercial_snapshot_has_contact(new_state,'10000000-0000-4000-8000-999999999999'))`],
    ['dashboard',`select commercial_dashboard('${org}',now()-interval '7 days',now()+interval '1 day','{}')`],
    ['opportunity-contact-lookup',`select id from commercial_opportunities where organization_id='${org}' and primary_contact_id='${buyer}'`]
  ]) {
    plans[name]=JSON.parse(await sql(session(editor,`explain (analyze,buffers,format json) ${query};`)));
  }
  fs.writeFileSync(path.join(output,'explain.json'),JSON.stringify(plans,null,2)+'\n');
  report.performance={syntheticOpportunities:2000,plans:Object.fromEntries(Object.entries(plans).map(([name,plan])=>[name,{
    executionMs:plan[0]['Execution Time'],planningMs:plan[0]['Planning Time'],plan:plan[0].Plan['Node Type']}]))};
  console.log('PASS performance diagnostics: actual authenticated query plans on 2,000 synthetic opportunities');
}
