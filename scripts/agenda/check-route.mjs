import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GET, POST, PATCH, DELETE } from '../../src/app/api/agenda/route.ts';

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const ORG = id(1), OTHER = id(2), USER = id(10), BUYER = id(20), SECOND = id(21), FOREIGN = id(22), EVENT = id(50), OP = id(60);
const base = { title: 'Visita Flow', assigned_to: USER, lead_id: BUYER, event_type: 'visita', meeting_mode: 'presencial', starts_at: '2030-10-21T15:00:00Z', ends_at: '2030-10-21T16:00:00Z' };
function fixture() {
  const s = {
    context: { userId: USER, role: 'comercial', organization: { id: ORG } }, sessionClients: 0,
    availability: [], conflicts: [], pushes: [], cancellations: [], writes: [], calls: [],
    receipts: new Map(), rpcCalls: [], replayError: null, malformedReplay: false, concurrentReplay: false,
    failRead: '', writeCode: '', stale: false, availabilityError: false, syncError: false,
    tables: {
      memberships: [{ organization_id: ORG, user_id: USER }, { organization_id: OTHER, user_id: FOREIGN }],
      leads: [{ id: BUYER, organization_id: ORG, archived_at: null }, { id: SECOND, organization_id: ORG, archived_at: null }, { id: FOREIGN, organization_id: OTHER, archived_at: null }],
      agenda_events: [{ ...base, id: EVENT, organization_id: ORG, status: 'scheduled', opportunity_id: null, created_by: USER, created_by_kind: 'human', updated_at: '2026-10-21T14:00:00Z', microsoft_event_id: null, microsoft_sync_status: 'not_connected' }],
      commercial_link_reviews: [],
    },
  };
  class Query {
    constructor(table) { this.table = table; this.op = 'select'; this.filters = []; }
    select() { return this; }
    insert(value) { this.op = 'insert'; this.value = value; return this; }
    update(value) { this.op = 'update'; this.value = value; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(k, v) { this.filters.push([k, v, 'eq']); return this; }
    gte(k, v) { this.filters.push([k, v, 'gte']); return this; }
    lt(k, v) { this.filters.push([k, v, 'lt']); return this; }
    order() { return this; }
    limit() { return this; }
    single() { return this.run(true); }
    maybeSingle() { return this.run(true); }
    then(resolve, reject) { return this.run(false).then(resolve, reject); }
    async run(one) {
      s.calls.push({ table: this.table, op: this.op, filters: structuredClone(this.filters) });
      if (this.op === 'select' && s.failRead === this.table) return { data: null, error: { code: 'XX000', message: 'private database detail' } };
      if (this.op !== 'select' && s.writeCode) return { data: null, error: { code: s.writeCode, message: 'private database detail' } };
      if (this.op !== 'select' && s.stale) return { data: null, error: null };
      const matches = (r) => this.filters.every(([k, v, op]) => op === 'eq' ? r[k] === v : op === 'gte' ? r[k] >= v : r[k] < v);
      let rows = s.tables[this.table].filter(matches);
      if (this.op === 'insert') {
        rows = [{ id: id(51), opportunity_id: null, updated_at: '2026-10-21T15:00:00Z', ...structuredClone(this.value) }];
        s.tables[this.table].push(...rows);
      } else if (this.op === 'update') {
        rows.forEach((r) => Object.assign(r, structuredClone(this.value)));
      } else if (this.op === 'delete') {
        s.tables[this.table] = s.tables[this.table].filter((r) => !matches(r));
      }
      if (this.op !== 'select') s.writes.push({ op: this.op, table: this.table, value: structuredClone(this.value), rows: structuredClone(rows) });
      return { data: structuredClone(one ? rows[0] ?? null : rows), error: null };
    }
  }
  s.db = { from: (table) => new Query(table), async rpc(name, args) {
    s.rpcCalls.push({ name, args: structuredClone(args) });
    if (name === 'commercial_prepare_source_request' && s.prepareMalformed) return { data: {}, error: null };
    if (name === 'commercial_prepare_source_request') return s.prepareError ? { data: null, error: s.prepareError } : { data: { request_id: args.p_request, status: 'pending' }, error: null };
    if (name === 'commercial_replay_source_request' && s.replayError) return { data: null, error: s.replayError };
    if (name === 'commercial_replay_source_request' && s.malformedReplay) return { data: {}, error: null };
    const receipt = s.receipts.get(args.p_request);
    const payload = args.p_payload ?? args.p_data;
    if (receipt) {
      if (JSON.stringify(receipt.payload) !== JSON.stringify(payload)) return { data: null, error: { code: '23505', message: 'COMMERCIAL_REQUEST_REUSED' } };
      return { data: { replayed: true, record: structuredClone(s.tables.agenda_events.find((e) => e.id === receipt.id)) }, error: null };
    }
    if (name === 'commercial_replay_source_request') return { data: null, error: null };
    if (name !== 'commercial_create_agenda_once') throw Error('Unknown RPC');
    if (s.concurrentReplay) return { data: { replayed: true, record: structuredClone(s.tables.agenda_events[0]) }, error: null };
    const result = await new Query('agenda_events').insert({ ...args.p_data, organization_id: args.p_org,
      created_by: s.context.userId, created_by_kind: 'human', status: 'scheduled' }).single();
    if (result.error) return result;
    s.receipts.set(args.p_request, { id: result.data.id, payload: structuredClone(payload) });
    return { data: { replayed: false, record: result.data }, error: null };
  } };
  globalThis.__agendaHarness = s;
  return s;
}
const request = (method, body, suffix = '') => new Request(`https://crm.test/api/agenda${suffix}`, {
  method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...(method === 'POST' ? { 'Idempotency-Key': id(2000) } : {}) } }),
});
const remove = () => request('DELETE', undefined, `?id=${EVENT}`);
let passed = 0;
async function check(name, run) {
  const s = fixture();
  await run(s);
  passed++;
  console.log(`PASS ${name}`);
}
const noSideEffects = (s) => { assert.equal(s.writes.length, 0); assert.equal(s.pushes.length, 0); assert.equal(s.cancellations.length, 0); };

await check('anonymous requests never reach the database or Outlook', async (s) => {
  s.context = null;
  for (const [fn, req] of [[GET, request('GET')], [POST, request('POST', base)], [PATCH, request('PATCH', { id: EVENT, title: 'X' })], [DELETE, remove()]]) assert.equal((await fn(req)).status, 401);
  assert.equal(s.sessionClients, 0); noSideEffects(s);
});
await check('viewer can read but cannot write', async (s) => {
  s.context.role = 'viewer';
  assert.equal((await GET(request('GET'))).status, 200);
  for (const [fn, req] of [[POST, request('POST', base)], [PATCH, request('PATCH', { id: EVENT, title: 'X' })], [DELETE, remove()]]) assert.equal((await fn(req)).status, 403);
  noSideEffects(s);
});
await check('manual creation carries the session actor, not client-supplied identity', async (s) => {
  const r = await POST(request('POST', { ...base, organization_id: OTHER, created_by: FOREIGN, created_by_kind: 'ai', opportunity_id: OP, metadata: { source: 'forged' } }));
  assert.equal(r.status, 201);
  const event = (await r.json()).event;
  assert.equal(event.created_by, USER); assert.equal(event.created_by_kind, 'human'); assert.equal(event.organization_id, ORG);
  assert.equal(event.opportunity_id, null); assert.equal(event.metadata, undefined); assert.equal(event.status, 'scheduled');
  assert.equal(s.sessionClients, 1); assert.equal(s.pushes.length, 1);
  assert.ok(s.calls.every((c) => c.op === 'insert' || c.filters.some(([key, value]) => key === 'organization_id' && value === ORG)));
});
await check('admin creation uses the same session-bound write path', async (s) => {
  s.context.role = 'admin'; assert.equal((await POST(request('POST', base))).status, 201); assert.equal(s.sessionClients, 1);
});
await check('malformed and scalar bodies return 400 without writes', async (s) => {
  for (const body of [null, [], 'text', { ...base, title: 42 }, { ...base, lead_id: {} }, { ...base, assigned_to: 'not-a-uuid' }]) assert.equal((await POST(request('POST', body))).status, 400);
  assert.equal((await POST(new Request('https://crm.test/api/agenda', { method: 'POST', body: '{bad json' }))).status, 400);
  noSideEffects(s);
});
await check('foreign assignee rejected before availability or external effects', async (s) => {
  assert.equal((await POST(request('POST', { ...base, assigned_to: FOREIGN }))).status, 400);
  assert.equal(s.availability.length, 0); noSideEffects(s);
});
await check('foreign buyer rejected before availability or external effects', async (s) => {
  assert.equal((await POST(request('POST', { ...base, lead_id: FOREIGN }))).status, 400);
  assert.equal(s.availability.length, 0); noSideEffects(s);
});
await check('archived buyer cannot receive a new manual event', async (s) => {
  s.tables.leads[0].archived_at = '2026-10-20'; assert.equal((await POST(request('POST', base))).status, 400); noSideEffects(s);
});
await check('unknown membership is not confused with a read failure', async (s) => {
  s.failRead = 'memberships'; assert.equal((await POST(request('POST', base))).status, 503); noSideEffects(s);
});
await check('contact read failure stops creation', async (s) => {
  s.failRead = 'leads'; assert.equal((await POST(request('POST', base))).status, 503); noSideEffects(s);
});
await check('availability failure stops creation', async (s) => {
  s.availabilityError = true; assert.equal((await POST(request('POST', base))).status, 503); noSideEffects(s);
});
await check('overlap check and database race both block external publication', async (s) => {
  s.conflicts = [{ id: EVENT }]; assert.equal((await POST(request('POST', base))).status, 409); noSideEffects(s);
  s.conflicts = []; s.writeCode = '23P01'; assert.equal((await POST(request('POST', base))).status, 409); noSideEffects(s);
});
await check('denied session write has no privileged fallback', async (s) => {
  s.writeCode = '42501'; const r = await POST(request('POST', base)); assert.equal(r.status, 403);
  assert.ok(!(await r.text()).includes('private database detail')); noSideEffects(s);
});
await check('Outlook failure is explicit and does not repeat the CRM insertion', async (s) => {
  s.syncError = true; const r = await POST(request('POST', base)); assert.equal(r.status, 202);
  assert.ok((await r.json()).warning); assert.equal(s.writes.length, 1); assert.equal(s.pushes.length, 1);
});
await check('create cannot falsely claim completed status', async (s) => {
  assert.equal((await POST(request('POST', { ...base, status: 'completed' }))).status, 400); noSideEffects(s);
});
await check('invalid time and event formats are rejected', async (s) => {
  for (const patch of [{ ends_at: base.starts_at }, { starts_at: 'invalid' }, { meeting_mode: 'bad' }, { event_type: 'bad' }]) assert.equal((await POST(request('POST', { ...base, ...patch }))).status, 400);
  noSideEffects(s);
});
await check('editing preserves creator, uses session and optimistic timestamp', async (s) => {
  const r = await PATCH(request('PATCH', { id: EVENT, title: 'Visita revisada', created_by: FOREIGN, organization_id: OTHER }));
  assert.equal(r.status, 200); assert.equal((await r.json()).event.created_by, USER);
  const query = s.calls.find((c) => c.op === 'update'); assert.ok(query.filters.some(([key]) => key === 'updated_at'));
  assert.deepEqual(Object.keys(s.writes[0].value), ['title']);
});
await check('stale event cannot be overwritten or synced', async (s) => {
  s.stale = true; assert.equal((await PATCH(request('PATCH', { id: EVENT, title: 'X' }))).status, 409); noSideEffects(s);
});
await check('failed agenda read is 503, not false 404', async (s) => {
  s.failRead = 'agenda_events'; assert.equal((await PATCH(request('PATCH', { id: EVENT, title: 'X' }))).status, 503); noSideEffects(s);
});
await check('missing or foreign event cannot be edited', async (s) => {
  s.tables.agenda_events[0].organization_id = OTHER; assert.equal((await PATCH(request('PATCH', { id: EVENT, title: 'X' }))).status, 404); noSideEffects(s);
});
await check('foreign assignee or buyer cannot be installed through PATCH', async (s) => {
  for (const patch of [{ assigned_to: FOREIGN }, { lead_id: FOREIGN }]) assert.equal((await PATCH(request('PATCH', { id: EVENT, ...patch }))).status, 400);
  noSideEffects(s);
});
await check('explicit null assignee cannot silently retain old assignment', async (s) => {
  assert.equal((await PATCH(request('PATCH', { id: EVENT, assigned_to: null }))).status, 400); noSideEffects(s);
});
await check('commercial visit identity cannot be changed through the general agenda', async (s) => {
  s.tables.agenda_events[0].opportunity_id = OP;
  for (const patch of [{ lead_id: SECOND }, { lead_id: null }, { event_type: 'tarefa' }]) assert.equal((await PATCH(request('PATCH', { id: EVENT, ...patch }))).status, 409);
  noSideEffects(s);
});
await check('pending review source identity is also protected', async (s) => {
  s.tables.commercial_link_reviews.push({ organization_id: ORG, entity_type: 'agenda_events', entity_id: EVENT });
  assert.equal((await PATCH(request('PATCH', { id: EVENT, lead_id: SECOND }))).status, 409); noSideEffects(s);
});
await check('cancellation preserves commercial event rather than deleting it', async (s) => {
  s.tables.agenda_events[0].opportunity_id = OP; s.tables.leads[0].archived_at = '2026-10-20';
  assert.equal((await PATCH(request('PATCH', { id: EVENT, status: 'cancelled' }))).status, 200);
  assert.equal(s.tables.agenda_events.length, 1); assert.equal(s.tables.agenda_events[0].status, 'cancelled'); assert.equal(s.cancellations.length, 1);
});
await check('linked visit deletion is blocked before Outlook', async (s) => {
  s.tables.agenda_events[0].opportunity_id = OP; assert.equal((await DELETE(remove())).status, 409); noSideEffects(s);
});
await check('pending commercial source deletion is also blocked', async (s) => {
  s.tables.commercial_link_reviews.push({ organization_id: ORG, entity_type: 'agenda_events', entity_id: EVENT });
  assert.equal((await DELETE(remove())).status, 409); noSideEffects(s);
});
await check('audit lookup failure does not become permission to delete', async (s) => {
  s.failRead = 'commercial_link_reviews'; assert.equal((await DELETE(remove())).status, 503); noSideEffects(s);
});
await check('pre-migration legacy event deletion does not query missing tables', async (s) => {
  delete s.tables.agenda_events[0].opportunity_id; s.failRead = 'commercial_link_reviews';
  assert.equal((await DELETE(remove())).status, 200); assert.ok(!s.calls.some((c) => c.table === 'commercial_link_reviews'));
});
await check('noncommercial event can still be deleted after migrations', async (s) => {
  assert.equal((await DELETE(remove())).status, 200); assert.equal(s.tables.agenda_events.length, 0);
});
await check('Outlook-imported blocks cannot be edited or removed here', async (s) => {
  s.tables.agenda_events[0].microsoft_sync_status = 'imported';
  assert.equal((await PATCH(request('PATCH', { id: EVENT, title: 'X' }))).status, 403);
  assert.equal((await DELETE(remove())).status, 403); noSideEffects(s);
});
await check('read filters cannot return another organization', async (s) => {
  s.tables.agenda_events.push({ ...s.tables.agenda_events[0], id: id(99), organization_id: OTHER });
  assert.equal((await (await GET(request('GET'))).json()).events.length, 1); noSideEffects(s);
});
await check('calendar end filter still uses event start, not duration', async (s) => {
  const response = await GET(request('GET', undefined, '?start=2030-10-21T14:00:00Z&end=2030-10-21T15:30:00Z'));
  assert.equal(response.status, 200); assert.equal((await response.json()).events.length, 1);
  const query = s.calls.find((c) => c.table === 'agenda_events');
  assert.ok(query.filters.some(([key, , op]) => key === 'starts_at' && op === 'lt'));
});
await check('read failure is unavailable, never an empty calendar', async (s) => {
  s.failRead = 'agenda_events'; const r = await GET(request('GET')); assert.equal(r.status, 503); assert.ok(!(await r.text()).includes('private database detail'));
});
await check('invalid query IDs fail without access', async (s) => {
  assert.equal((await DELETE(request('DELETE', undefined, '?id=bad'))).status, 400);
  assert.equal((await GET(request('GET', undefined, '?assigned_to=bad'))).status, 400); assert.equal(s.sessionClients, 0);
});
await check('create requires a valid explicit request key', async (s) => {
  for (const key of [null, 'not-a-uuid']) {
    const req = request('POST', base); if (key) req.headers.set('Idempotency-Key', key); else req.headers.delete('Idempotency-Key');
    assert.equal((await POST(req)).status, 400);
  }
  assert.equal(s.sessionClients, 0); noSideEffects(s);
});
await check('same request replays before availability and never repeats Outlook', async (s) => {
  const first = await POST(request('POST', base)); const created = (await first.json()).event;
  s.conflicts = [{ id: created.id }]; s.availabilityError = true;
  const replay = await POST(request('POST', base)); assert.equal(replay.status, 200);
  const payload = await replay.json(); assert.equal(payload.event.id, created.id); assert.equal(payload.replayed, true);
  assert.equal(s.availability.length, 1); assert.equal(s.writes.length, 1); assert.equal(s.pushes.length, 1);
});
await check('uncertain Outlook response still replays the committed CRM event once', async (s) => {
  s.syncError = true; assert.equal((await POST(request('POST', base))).status, 202);
  assert.equal((await POST(request('POST', base))).status, 200);
  assert.equal(s.writes.length, 1); assert.equal(s.pushes.length, 1);
});
await check('same key with changed fields returns 409 without a second write', async (s) => {
  await POST(request('POST', base)); const second = await POST(request('POST', { ...base, title: 'Changed' }));
  assert.equal(second.status, 409); assert.equal(s.writes.length, 1); assert.equal(s.pushes.length, 1);
});
await check('missing migration fails closed without falling back to direct insertion', async (s) => {
  s.replayError = { code: 'PGRST202', message: 'missing RPC' };
  assert.equal((await POST(request('POST', base))).status, 503); noSideEffects(s);
});
await check('malformed replay cannot be presented as a successful save', async (s) => {
  s.malformedReplay = true; assert.equal((await POST(request('POST', base))).status, 503); noSideEffects(s);
});
await check('concurrent winner recovered by create RPC does not call Outlook again', async (s) => {
  s.concurrentReplay = true; const r = await POST(request('POST', base)); assert.equal(r.status, 200);
  assert.equal((await r.json()).replayed, true); noSideEffects(s);
});
await check('cancelled record replay preserves its current status without remote write', async (s) => {
  const first = (await (await POST(request('POST', base))).json()).event;
  s.tables.agenda_events.find((event) => event.id === first.id).status = 'cancelled';
  const repeat = (await (await POST(request('POST', base))).json()).event;
  assert.equal(repeat.status, 'cancelled'); assert.equal(s.pushes.length, 1);
});
const source = fs.readFileSync(new URL('../../src/app/api/agenda/route.ts', import.meta.url), 'utf8');
assert.ok(!source.includes('createAdminClient'), 'A human route must not bypass its session');
await check('durable preparation refuses another unresolved command before source writes and Outlook', async (s) => {
  s.prepareError = { code: '23505', message: 'COMMERCIAL_RECOVERY_PENDING' };
  assert.equal((await POST(request('POST', base))).status, 409); noSideEffects(s); assert.equal(s.availability.length, 0);
});
await check('durable preparation missing migration fails closed without source fallback', async (s) => {
  s.prepareError = { code: 'PGRST202', message: 'not deployed' };
  assert.equal((await POST(request('POST', base))).status, 503); noSideEffects(s);
});
await check('malformed preparation is not treated as authorization to save', async (s) => {
  s.prepareMalformed = true; assert.equal((await POST(request('POST', base))).status, 503); noSideEffects(s);
});
process.env.BOSSA_HOMOLOGATION_MODE = 'remote';
try {
  await check('isolated manual POST uses atomic RPC and replay never sends invitations', async s => {
    const first = await POST(request('POST', base));
    assert.equal(first.status, 201);
    assert.equal((await first.json()).syncStatus, 'internal_only');
    assert.equal(s.rpcCalls.filter(c => c.name === 'commercial_create_agenda_once').length, 1);
    const writes = s.writes.length;
    const retry = await POST(request('POST', base));
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).replayed, true);
    assert.equal(s.writes.length, writes);
    assert.equal(s.pushes.length, 0); assert.equal(s.cancellations.length, 0);
  });
  await check('isolated PATCH retains timestamp comparison and skips Outlook for edits and cancellation', async s => {
    assert.equal((await PATCH(request('PATCH', { id: EVENT, title: 'Manual' }))).status, 200);
    assert.ok(s.calls.some(c => c.op === 'update' && c.filters.some(([k]) => k === 'updated_at')));
    assert.equal((await PATCH(request('PATCH', { id: EVENT, status: 'cancelled' }))).status, 200);
    assert.equal(s.pushes.length, 0); assert.equal(s.cancellations.length, 0);
  });
  await check('isolated viewer and foreign organization cannot write', async s => {
    s.context.role = 'viewer';
    assert.equal((await POST(request('POST', base))).status, 403);
    assert.equal((await PATCH(request('PATCH', { id: EVENT, title: 'Forbidden' }))).status, 403);
    s.context.role = 'comercial'; s.context.organization.id = OTHER;
    assert.equal((await PATCH(request('PATCH', { id: EVENT, title: 'Forbidden' }))).status, 404);
    noSideEffects(s);
  });
  await check('isolated conflict and concurrent edit fail without writes', async s => {
    s.conflicts = [{ id: EVENT }];
    assert.equal((await POST(request('POST', base))).status, 409);
    noSideEffects(s);
    s.conflicts = []; s.stale = true;
    assert.equal((await PATCH(request('PATCH', { id: EVENT, title: 'Stale' }))).status, 409);
    assert.equal(s.pushes.length, 0); assert.equal(s.cancellations.length, 0);
  });
  await check('isolated imported and AI events cannot enter the manual path', async s => {
    for (const change of [{ microsoft_event_id: 'remote' }, { created_by_kind: 'ai' }, { agent: 'nara' }]) {
      Object.assign(s.tables.agenda_events[0], change);
      assert.equal((await PATCH(request('PATCH', { id: EVENT, title: 'Forbidden' }))).status, 403);
    }
    assert.equal((await DELETE(remove())).status, 403);
    noSideEffects(s);
  });
} finally { delete process.env.BOSSA_HOMOLOGATION_MODE; }
console.log(`PASS ${passed} isolated agenda API scenarios. Supabase/Outlook adapters mocked; not production or browser homologation.`);
