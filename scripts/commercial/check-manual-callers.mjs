import assert from 'node:assert/strict';
import { build } from 'esbuild';
const state = { session: 0, admin: 0, remote: 0, filters: [], fail: false };
globalThis.__manualCallers = state;
const built = await build({
  entryPoints: ['src/lib/agenda.ts', 'src/lib/manual-pipeline-lead.ts'], outdir: '/virtual',
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'deny-external-services', setup(b) {
    b.onResolve({ filter: /^@\/lib\/homologation\/policy$/ }, () => ({ path: `${process.cwd()}/src/lib/homologation/policy.ts` }));
    b.onResolve({ filter: /^@\/lib\/(supabase\/(server|admin)|microsoft-calendar)$/ }, a => ({ path: a.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'js', contents: path.endsWith('microsoft-calendar')
      ? `export async function microsoftBusyConflicts(){globalThis.__manualCallers.remote++;return [{id:'outlook'}]}`
      : `function db(){const f=globalThis.__manualCallers; const q={select(){return q},eq(k,v){f.filters.push([k,v]);return q},lt(){return q},gt(){return q},neq(){return q},order(){return q},then(resolve){resolve({data:[{id:'internal'}],error:f.fail?new Error('Read failed'):null})}};return {from:()=>q}};
         export function ${path.endsWith('server') ? 'createClient' : 'createAdminClient'}(){globalThis.__manualCallers.${path.endsWith('server') ? 'session' : 'admin'}++;return db()}` }));
  } }],
});
const load = async name => import(`data:text/javascript;base64,${Buffer.from(built.outputFiles.find(f => f.path.endsWith(name + '.js')).text).toString('base64')}`);
const agenda = await load('agenda'); const lead = await load('manual-pipeline-lead');
const saved = { ...process.env }; const oldFetch = globalThis.fetch;
globalThis.fetch = () => { throw Error('External egress forbidden'); };
try {
  delete process.env.VERCEL_PROJECT_ID; delete process.env.VERCEL_ENV; delete process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION;
  process.env.BOSSA_HOMOLOGATION_MODE = 'remote';
  assert.deepEqual(lead.pipelineLeadAutomation(), { ai_enabled: false, owner_mode: 'human', automation_paused: true });
  if (process.env.BOSSA_H22_PRIVATE_PACKAGE) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { readFileSync } = await import('node:fs');
    const directory = process.env.BOSSA_H22_PRIVATE_PACKAGE;
    const catalog = JSON.parse(readFileSync(`${directory}/final-catalog.json`, 'utf8'));
    const grants = readFileSync(`${directory}/permissions-reviewed.sql`, 'utf8');
    const insertGrant = grants.match(/GRANT INSERT \([^;]+\) ON public\.leads TO authenticated;/)?.[0];
    assert.ok(insertGrant);
    const db = new PGlite();
    const org = '00000000-0000-0000-0000-000000000001';
    const user = role => `00000000-0000-0000-0000-00000000000${role}`;
    try {
      await db.exec(`create role authenticated; create schema auth; create schema private;
        create table memberships(organization_id uuid,user_id uuid,role text);
        create function auth.uid() returns uuid language sql as $$select current_setting('request.jwt.claim.sub')::uuid$$;
        create function private.is_org_member(uuid) returns boolean language sql as $$select exists(select 1 from memberships where organization_id=$1 and user_id=auth.uid())$$;
        create function private.can_edit_org(uuid) returns boolean language sql as $$select exists(select 1 from memberships where organization_id=$1 and user_id=auth.uid() and role in ('admin','comercial'))$$;
        create table leads(id uuid default gen_random_uuid(), organization_id uuid,kind text,name text,phone text,email text,stage text,source text,enterprise text,company text,group_name text,temperature int,ai_enabled boolean,owner_mode text,priority_class text,metadata jsonb,automation_paused boolean default false);
        alter table leads enable row level security;
        grant usage on schema public,auth,private to authenticated;
        grant select on leads,memberships to authenticated; ${insertGrant}`);
      for (const p of catalog.policies.filter(p => p.tablename === 'leads' && ['INSERT','SELECT'].includes(p.cmd))) {
        const quoted = '"' + p.policyname.replaceAll('"','""') + '"';
        await db.exec(`create policy ${quoted} on leads as ${p.permissive} for ${p.cmd} to authenticated ${p.qual ? `using (${p.qual})` : ''} ${p.with_check ? `with check (${p.with_check})` : ''}`);
      }
      for (const [n, role] of [[2,'admin'],[3,'comercial'],[4,'viewer']])
        await db.query('insert into memberships values($1,$2,$3)',[org,user(n),role]);
      await db.exec('set role authenticated');
      const insert = async (organization, flags = lead.pipelineLeadAutomation()) => {
        return db.query("insert into leads(organization_id,kind,name,stage,ai_enabled,owner_mode,automation_paused) values($1,'cliente','Synthetic','novo',$2,$3,$4) returning id",
          [organization,flags.ai_enabled,flags.owner_mode,flags.automation_paused ?? false]);
      };
      for (const n of [2,3]) {
        await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user(n)]);
        assert.equal((await insert(org)).rows.length,1);
        await assert.rejects(() => insert(user(9)), e => e.code === '42501');
        await assert.rejects(() => insert(org,{ai_enabled:true,owner_mode:'ai'}), e => e.code === '42501');
      }
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user(4)]);
      await assert.rejects(() => insert(org), e => e.code === '42501');
      console.log('PASS: private H2.2 lead column grants and RLS accept manual admin/comercial and deny AI payload, viewer and foreign organization in disposable PGlite. Full managed triggers not simulated.');
    } finally { await db.close(); }
  }
  const input = { organizationId: 'org-a', assignedTo: 'human', startsAt: '2030-01-01T10:00:00Z', endsAt: '2030-01-01T11:00:00Z' };
  assert.deepEqual(await agenda.findAgendaConflicts(input), [{ id: 'internal' }]);
  assert.ok(state.filters.some(([k,v]) => k === 'organization_id' && v === 'org-a'));
  assert.ok(state.filters.some(([k,v]) => k === 'assigned_to' && v === 'human'));
  assert.equal(state.session, 1); assert.equal(state.admin, 0); assert.equal(state.remote, 0);
  state.fail = true; await assert.rejects(() => agenda.findAgendaConflicts(input), /Read failed/); state.fail = false;
  await assert.rejects(() => agenda.createAgendaEventFromAi({}), /HOMOLOGATION_EXTERNAL_EFFECT_BLOCKED/);
  assert.equal(state.admin, 0); assert.equal(state.remote, 0);
  delete process.env.BOSSA_HOMOLOGATION_MODE;
  assert.deepEqual(lead.pipelineLeadAutomation(), { ai_enabled: true, owner_mode: 'ai' });
  assert.equal((await agenda.findAgendaConflicts(input)).length, 2);
  assert.equal(state.admin, 1); assert.equal(state.remote, 1);
  console.log('PASS: manual-only lead flags, session-scoped internal availability, fail-closed reads and AI, zero administrative/Microsoft access in isolation, production behavior preserved. Adapters, not remote acceptance.');
} finally {
  globalThis.fetch = oldFetch;
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved); delete globalThis.__manualCallers;
}
