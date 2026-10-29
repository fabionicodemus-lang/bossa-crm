import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {commercialFiles, migrationFiles, legacySchema, repositoryMigrationRoot, hash} from './homologation/repository-schema.mjs';
import {startDatabase, docker} from './homologation/runtime.mjs';

const output = path.resolve(process.env.BOSSA_HOMOLOGATION_OUTPUT || '/tmp/bossa-commercial-homologation');
if (!output.startsWith('/tmp/') && !output.startsWith('/workspace/')) throw Error('Evidence output must stay in the workspace or /tmp');
fs.mkdirSync(output,{recursive:true});
const report = {scope:'repository-schema-with-explicit-platform-adapter',productionSchemaVerified:false,
  baseRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),migrations:[],checks:[]};
const db = await startDatabase();
try {
  report.postgres = await db.sql('select version();');
  report.image = await docker(['image','inspect','postgres:17','--format','{{.Id}}']);
  const adapter = fs.readFileSync(new URL('./homologation/platform-adapter.sql',import.meta.url),'utf8');
  report.platformAdapterSha256 = hash(adapter);
  await db.sql(adapter);
  for (const file of migrationFiles()) {
    const commercial = commercialFiles().includes(file);
    const source = fs.readFileSync(new URL(file,repositoryMigrationRoot),'utf8');
    const item = commercial ? {file,sha256:hash(source),skipped:[]} : legacySchema(file);
    try { await db.sql(commercial?source:item.sql); }
    catch (error) { report.failure={migration:file,error:String(error)}; throw error; }
    const {sql: ignoredSql, ...evidence} = item; void ignoredSql;
    if(commercial) {
      const target='supabase/migrations/'+file;
      const history=execFileSync('git',['log','--reverse','--format=%H','--',target],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
      evidence.introducedIn=history[0]??'working-tree';evidence.changedIn=history.slice(1);
      if(history.length) evidence.introducedSha256=hash(execFileSync('git',['show',`${history[0]}:${target}`],{encoding:'utf8'}));
    }
    report.migrations.push(evidence);
  }
  console.log(`PASS repository replay: ${report.migrations.length} migration files, including ${commercialFiles().length} unmodified commercial migrations`);
  const dump = await docker(['exec',db.container,'pg_dump','-U','postgres','-d',db.database,'--schema-only','--schema=public','--schema=private','--no-owner']);
  fs.writeFileSync(path.join(output,'repository-schema.sql'),dump);
  report.schemaDumpSha256=hash(dump);
  // Integrated scenarios and catalog inspection use the SAME database below.
  if (process.env.BOSSA_HOMOLOGATION_APPLY_ONLY !== '1') {
    const {validateIntegration} = await import('./homologation/integration.mjs');
    await validateIntegration(db,report,output);
  }
} finally {
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');
  await db.close();
  console.log(`Evidence: ${path.join(output,'results.json')}`);
}
