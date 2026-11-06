// Executes the actual HTTP handlers with in-memory persistence and blocked transport.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { readNaraJourney } from '../src/lib/nara-journey.ts';
import { tryRecordNaraFunnelEvent } from '../src/lib/nara-funnel-events.ts';

globalThis.fetch = () => { throw new Error('Network is forbidden in human outcome tests.'); };
const NOW = Date.parse('2026-11-06T15:00:00Z');
const realClock = Date.now; Date.now = () => NOW;
const org = 'org-a', userId = 'human-a', otherUser = 'human-b', leadId = 'lead-a', eventId = 'agenda-a';
const pastStart = '2026-11-06T12:00:00.000Z', pastEnd = '2026-11-06T13:00:00.000Z';
const nextStart = '2026-11-07T12:00:00.000Z', nextEnd = '2026-11-07T13:00:00.000Z';
const initialVersion = '2026-11-06T10:00:00.000Z';
async function executable(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  return stripTypeScriptTypes(source).replace(/^import\s.*?;\s*$/gm, '').replace(/^export\s+(?=(?:async\s+)?function|const)/gm, '');
}
const agendaSource = await executable('../src/app/api/agenda/route.ts');
const handoffSource = await executable('../src/app/api/leads/[id]/handoff/route.ts');

function scenario(options = {}) {
  const tables = {
    memberships: [
      { user_id: userId, organization_id: org, role: options.role ?? 'comercial', profiles: { full_name: 'Comercial QA', email: 'qa@example.invalid' } },
      { user_id: otherUser, organization_id: org, role: 'comercial', profiles: { full_name: 'Destino QA', email: 'destino@example.invalid' } },
      { user_id: 'viewer', organization_id: org, role: 'viewer', profiles: { full_name: 'Leitura QA' } },
      { user_id: 'foreign-human', organization_id: 'org-b', role: 'admin', profiles: { full_name: 'Outra empresa' } },
    ],
    leads: [{ id: leadId, organization_id: org, name: 'Pessoa sintética', kind: 'cliente', owner_id: null, owner_mode: 'ai',
      stage: 'qualificacao_ia', ai_enabled: true, opt_out: false, automation_paused: false, priority_class: 'A1',
      metadata: { nara_journey: { schema_version: 1, requested_next_step: 'human' } }, updated_at: initialVersion,
      ai_next_action: 'Continuar o atendimento', ai_summary: 'Contexto sintético' },
    { id: 'foreign-lead', organization_id: 'org-b', kind: 'cliente', updated_at: initialVersion }],
    agenda_events: [{ id: eventId, organization_id: org, lead_id: leadId, assigned_to: userId, title: 'Visita sintética',
      event_type: 'visita', meeting_mode: 'presencial', starts_at: pastStart, ends_at: pastEnd, status: 'scheduled', metadata: {}, updated_at: initialVersion },
    { id: 'foreign-event', organization_id: 'org-b', assigned_to: 'foreign-human', starts_at: pastStart, ends_at: pastEnd, status: 'scheduled', metadata: {}, updated_at: initialVersion }],
    lead_handoffs: [], lead_tasks: [], activities: [], user_notifications: [],
  };
  const writes = [], availability = [], calendar = [];
  let counter = 0;
  function from(table) {
    assert.ok(Object.hasOwn(tables, table), `Unexpected table ${table}`);
    const filters = []; let operation = 'select', payload, upsert = {}, limit, order;
    const query = {
      select() { return query; },
      eq(key, value) { filters.push((row) => row[key] === value); return query; },
      neq(key, value) { filters.push((row) => row[key] !== value); return query; },
      in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
      is(key, value) { filters.push((row) => (row[key] ?? null) === value); return query; },
      gte(key, value) { filters.push((row) => row[key] >= value); return query; },
      lt(key, value) { filters.push((row) => row[key] < value); return query; },
      order(key, opts = {}) { order = [key, opts.ascending !== false]; return query; },
      limit(value) { limit = value; return query; },
      insert(value) { operation = 'insert'; payload = value; return query; },
      update(value) { operation = 'update'; payload = value; return query; },
      upsert(value, config) { operation = 'upsert'; payload = value; upsert = config; return query; },
      delete() { operation = 'delete'; return query; },
      maybeSingle() { return Promise.resolve(execute('maybe')); },
      single() { return Promise.resolve(execute('single')); },
      then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); },
    };
    function execute(single) {
      options.beforeExecute?.({ table, operation, payload, tables });
      if (options.fail?.table === table && options.fail?.operation === operation) return { data: null, error: { code: options.fail.code || 'QA_FAIL', message: 'Synthetic DB failure' } };
      let rows = tables[table].filter((row) => filters.every((matches) => matches(row)));
      if (operation === 'update') {
        for (const row of rows) {
          Object.assign(row, structuredClone(payload));
          row.updated_at = new Date(NOW + ++counter).toISOString();
          writes.push({ table, operation, payload: structuredClone(payload), id: row.id });
        }
      } else if (operation === 'insert' || operation === 'upsert') {
        const existing = operation === 'upsert' ? tables[table].find((row) => row[upsert.onConflict] === payload[upsert.onConflict]) : null;
        if (existing && upsert.ignoreDuplicates) rows = [];
        else if (existing) { Object.assign(existing, structuredClone(payload)); rows = [existing]; }
        else {
          const row = { id: `${table}-${++counter}`, created_at: new Date(NOW).toISOString(), updated_at: new Date(NOW + counter).toISOString(),
            ...(table === 'agenda_events' ? { status: 'scheduled', metadata: {} } : {}), ...structuredClone(payload) };
          tables[table].push(row); rows = [row]; writes.push({ table, operation, payload: structuredClone(payload), id: row.id });
        }
      } else if (operation === 'delete') {
        tables[table] = tables[table].filter((row) => !rows.includes(row));
        if (rows.length) writes.push({ table, operation });
      }
      if (order) rows.sort((a, b) => (a[order[0]] > b[order[0]] ? 1 : -1) * (order[1] ? 1 : -1));
      if (limit !== undefined) rows = rows.slice(0, limit);
      if (single && (rows.length > 1 || (single === 'single' && rows.length !== 1))) return { data: null, error: { code: 'PGRST116', message: 'Expected one row' } };
      return { data: structuredClone(single ? rows[0] ?? null : rows), error: null };
    }
    return query;
  }
  const client = { from, auth: { getUser: async () => ({ data: { user: options.authenticated === false ? null : { id: options.userId ?? userId } }, error: null }) } };
  const getContext = async () => options.authenticated === false ? null : { userId: options.userId ?? userId, role: options.role ?? 'comercial', organization: { id: org } };
  const findConflicts = async (args) => { availability.push(args); if (options.availabilityError) throw new Error('Synthetic availability failure'); return options.conflicts ?? []; };
  const push = async (event) => { calendar.push({ action: 'push', event: structuredClone(event) }); if (options.calendarError) throw new Error('Synthetic calendar failure'); return 'synced'; };
  const remove = async (event) => { calendar.push({ action: 'delete', event: structuredClone(event) }); };
  const agenda = new Function('getCurrentContext', 'findAgendaConflicts', 'deleteMicrosoftEvent', 'pushMicrosoftEvent', 'createAdminClient', 'createClient', 'tryRecordNaraFunnelEvent', `${agendaSource}\nreturn {GET,POST,PATCH,DELETE};`)(
    getContext, findConflicts, remove, push, () => client, async () => client, tryRecordNaraFunnelEvent);
  const handoff = new Function('NextResponse', 'createClient', 'createAdminClient', 'readNaraJourney', 'tryRecordNaraFunnelEvent', `${handoffSource}\nreturn POST;`)(
    { json: (body, init) => Response.json(body, init) }, async () => client, () => client, readNaraJourney, tryRecordNaraFunnelEvent);
  const request = (method, body) => new Request('https://crm.example.invalid/api/qa', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { tables, writes, availability, calendar,
    patch: (body) => agenda.PATCH(request('PATCH', body)),
    post: (body) => agenda.POST(request('POST', body)),
    handoff: (body, id = leadId) => handoff(request('POST', body), { params: Promise.resolve({ id }) }),
  };
}
const outcome = (kind = 'no_show', extra = {}) => ({ id: eventId, expected_starts_at: pastStart, ...(kind === 'completed' ? { status: 'completed' } : { outcome: 'no_show' }), ...extra });
const proposal = (extra = {}) => ({ title: 'Visita QA', assigned_to: userId, lead_id: leadId, starts_at: nextStart, ends_at: nextEnd, event_type: 'visita', meeting_mode: 'presencial', ...extra });
const funnel = (fixture, event) => fixture.tables.activities.filter((row) => row.type === 'nara_funil' && row.metadata.event === event);
function noSideEffects(fixture) { assert.equal(fixture.writes.length, 0); assert.equal(fixture.calendar.length, 0); }
let passed = 0;
async function check(name, run) { await run(); passed++; console.log(`✓ ${name}`); }

try {
  for (const [label, options, code] of [['sem sessão', { authenticated: false }, 401], ['viewer', { role: 'viewer' }, 403], ['papel desconhecido', { role: 'unknown' }, 403]]) {
    await check(`Autorização ${label} bloqueia ambos handlers`, async () => {
      const f = scenario(options); assert.equal((await f.patch(outcome())).status, code); assert.equal((await f.handoff({ action: 'accept' })).status, code); noSideEffects(f);
    });
  }
  await check('Escopo de empresa não depende de um mock de RLS', async () => {
    const f = scenario(); assert.equal((await f.patch(outcome('no_show', { id: 'foreign-event' }))).status, 404);
    assert.equal((await f.handoff({ action: 'accept' }, 'foreign-lead')).status, 404); noSideEffects(f);
  });
  await check('Payloads inválidos e limites rejeitados sem escrita', async () => {
    for (const body of [null, [], { id: eventId, expected_starts_at: 42, outcome: 'no_show' }, outcome('no_show', { expected_starts_at: '2026-02-31T10:00:00Z' }), outcome('no_show', { expected_starts_at: undefined }), { id: 'x'.repeat(201), outcome: 'no_show' }]) {
      const f = scenario(); assert.equal((await f.patch(body)).status, 400); noSideEffects(f);
    }
    for (const body of [null, [], { action: 42 }, { action: 'transfer', ownerId: {} }, { action: 'transfer', ownerId: 'x'.repeat(201) }, { action: 'invent' }]) {
      const f = scenario(); assert.equal((await f.handoff(body)).status, 400); noSideEffects(f);
    }
    const f = scenario(); assert.equal((await f.post(proposal({ description: {} }))).status, 400); assert.equal((await f.post(proposal({ title: 'x'.repeat(501) }))).status, 400); noSideEffects(f);
  });
  for (const kind of ['no_show', 'completed']) {
    await check(`${kind}: não mistura resultado com data, lead, responsável ou outro status`, async () => {
      for (const extra of [{ starts_at: nextStart }, { ends_at: nextEnd }, { lead_id: 'foreign-lead' }, { assigned_to: otherUser }, { title: 'outro' }, kind === 'no_show' ? { status: 'completed' } : { outcome: 'no_show' }]) {
        const f = scenario(); assert.equal((await f.patch(outcome(kind, extra))).status, 400); noSideEffects(f); assert.equal(f.availability.length, 0);
      }
    });
    await check(`${kind}: compromisso futuro não produz resultado`, async () => {
      const f = scenario(); Object.assign(f.tables.agenda_events[0], { starts_at: nextStart, ends_at: nextEnd });
      assert.equal((await f.patch(outcome(kind, { expected_starts_at: nextStart }))).status, 409); noSideEffects(f);
    });
    await check(`${kind}: versão antiga e reagendamento concorrente são bloqueados`, async () => {
      let f = scenario(); assert.equal((await f.patch(outcome(kind, { expected_starts_at: '2026-11-05T12:00:00Z' }))).status, 409); noSideEffects(f);
      f = scenario({ beforeExecute({ table, operation, tables }) { if (table === 'agenda_events' && operation === 'update') Object.assign(tables.agenda_events[0], { starts_at: nextStart, ends_at: nextEnd, updated_at: new Date(NOW).toISOString() }); } });
      assert.equal((await f.patch(outcome(kind))).status, 409); noSideEffects(f); assert.equal(funnel(f, 'compromisso_realizado').length, 0);
    });
    await check(`${kind}: resultado real é idempotente e nunca chama Outlook`, async () => {
      const f = scenario(); assert.equal((await f.patch(outcome(kind))).status, 200);
      const first = structuredClone(f.tables.agenda_events[0]); const writes = f.writes.length;
      const response = await f.patch(outcome(kind)); assert.equal(response.status, 200); assert.equal((await response.json()).idempotent, true);
      assert.equal(f.writes.length, writes); assert.deepEqual(f.tables.agenda_events[0], first); assert.equal(f.calendar.length, 0);
      assert.equal(funnel(f, kind === 'no_show' ? 'nao_compareceu' : 'compromisso_realizado').length, 1);
    });
  }
  await check('Resultado sem lead também não cria convite', async () => {
    const f = scenario(); f.tables.agenda_events[0].lead_id = null;
    assert.equal((await f.patch(outcome())).status, 200); assert.equal(f.calendar.length, 0); assert.equal(f.tables.activities.length, 0);
  });
  await check('Cancelado, importado e resultado oposto não são convertidos em presença', async () => {
    for (const [change, code] of [[{ status: 'cancelled' }, 409], [{ microsoft_sync_status: 'imported' }, 403], [{ metadata: { nara_outcome: 'no_show' } }, 409]]) {
      const f = scenario(); Object.assign(f.tables.agenda_events[0], change); assert.equal((await f.patch(outcome('completed'))).status, code); noSideEffects(f);
    }
  });
  await check('Falha na métrica não repete resultado e fica visível como pendência', async () => {
    const f = scenario({ fail: { table: 'activities', operation: 'upsert' } }); const response = await f.patch(outcome('completed'));
    assert.equal(response.status, 200); assert.match((await response.json()).warning, /funil.*pendente/); assert.equal(f.tables.agenda_events[0].status, 'completed'); assert.equal(f.calendar.length, 0);
  });
  await check('Edição comum continua consultando disponibilidade e falha fechada', async () => {
    for (const [options, code] of [[{ conflicts: [{ id: 'occupied' }] }, 409], [{ availabilityError: true }, 503]]) {
      const f = scenario(options); assert.equal((await f.patch({ id: eventId, starts_at: nextStart, ends_at: nextEnd })).status, code);
      noSideEffects(f); assert.equal(f.availability.length, 1);
    }
  });
  await check('Agenda valida referências cruzadas e erros de consulta', async () => {
    let f = scenario(); assert.equal((await f.post(proposal({ assigned_to: 'foreign-human' }))).status, 404); assert.equal((await f.post(proposal({ lead_id: 'foreign-lead' }))).status, 404); noSideEffects(f);
    f = scenario({ fail: { table: 'memberships', operation: 'select' } }); assert.equal((await f.patch(outcome())).status, 503); noSideEffects(f);
  });
  await check('Edição comum e criação válidas preservam sincronização', async () => {
    const f = scenario(); assert.equal((await f.patch({ id: eventId, starts_at: nextStart, ends_at: nextEnd })).status, 200);
    assert.equal(f.calendar.length, 1); assert.equal(funnel(f, 'reagendado').length, 1);
    assert.equal((await f.post(proposal())).status, 201); assert.equal(f.calendar.length, 2);
  });
  await check('Ninguém aceita pelo outro e transferência exige membro comercial da empresa', async () => {
    for (const body of [{ action: 'accept', ownerId: otherUser }, { action: 'transfer' }, { action: 'transfer', ownerId: 'foreign-human' }, { action: 'transfer', ownerId: 'viewer' }]) {
      const f = scenario(); assert.equal((await f.handoff(body)).status, 400); noSideEffects(f);
    }
  });
  await check('Transferir cria oferta/tarefa pendentes, nunca aceite ou primeiro contato concluído', async () => {
    const f = scenario(); f.tables.lead_tasks.push({ id: 'old-task', organization_id: org, lead_id: leadId, status: 'pending', dedupe_key: 'human:first-contact' });
    assert.equal((await f.handoff({ action: 'transfer', ownerId: otherUser })).status, 200);
    const handoff = f.tables.lead_handoffs[0]; assert.equal(handoff.status, 'pending'); assert.equal(handoff.accepted_at, null); assert.equal(handoff.accepted_by, null);
    assert.equal(f.tables.leads[0].handoff_accepted_at, null); assert.equal(f.tables.leads[0].ai_enabled, false);
    assert.equal(f.tables.lead_tasks.find((row) => row.id === 'old-task').status, 'cancelled');
    const task = f.tables.lead_tasks.find((row) => row.dedupe_key === 'handoff:pending');
    assert.equal(task.status, 'pending'); assert.equal(task.assigned_to, otherUser); assert.equal(task.metadata.accepted_at, undefined); assert.ok(task.metadata.offered_at);
    const activity = f.tables.activities.find((row) => row.type === 'atendimento_transferido'); assert.equal(activity.metadata.accepted_at, undefined); assert.ok(activity.metadata.offered_at);
    assert.equal(funnel(f, 'assumido').length, 0); assert.equal(funnel(f, 'encaminhado').length, 1);
    assert.equal(f.tables.user_notifications[0].accepted_at, null); assert.equal(f.tables.user_notifications[0].status, 'open');
    const writes = f.writes.length; const repeat = await f.handoff({ action: 'transfer', ownerId: otherUser });
    assert.equal((await repeat.json()).idempotent, true); assert.equal(f.writes.length, writes);
  });
  await check('Aceite real encerra a pendência, cria primeiro contato e é idempotente', async () => {
    const f = scenario(); f.tables.lead_handoffs.push({ id: 'handoff-a', organization_id: org, lead_id: leadId, offered_to: userId, status: 'pending', created_at: initialVersion });
    f.tables.lead_tasks.push({ id: 'pending-task', organization_id: org, lead_id: leadId, status: 'pending', dedupe_key: 'handoff:pending' });
    f.tables.leads[0].automation_paused = true;
    assert.equal((await f.handoff({ action: 'accept' })).status, 200);
    assert.equal(f.tables.lead_handoffs[0].accepted_by, userId); assert.equal(f.tables.lead_handoffs[0].status, 'accepted');
    assert.equal(f.tables.lead_tasks.find((row) => row.id === 'pending-task').status, 'completed');
    assert.equal(f.tables.lead_tasks.find((row) => row.dedupe_key === 'human:first-contact').status, 'pending');
    assert.equal(f.tables.leads[0].automation_paused, true); assert.equal(funnel(f, 'assumido').length, 1);
    const writes = f.writes.length; assert.equal((await (await f.handoff({ action: 'accept' })).json()).idempotent, true);
    assert.equal(f.writes.length, writes); assert.equal(f.tables.lead_handoffs.length, 1);
  });
  await check('Versão concorrente do lead impede criação de falso aceite', async () => {
    const f = scenario({ beforeExecute({ table, operation, tables }) { if (table === 'leads' && operation === 'update') tables.leads[0].updated_at = new Date(NOW).toISOString(); } });
    assert.equal((await f.handoff({ action: 'accept' })).status, 409); noSideEffects(f); assert.equal(f.tables.lead_handoffs.length, 0);
  });
  await check('Passagem cancelada em corrida não produz evento assumido', async () => {
    const f = scenario({ beforeExecute({ table, operation, tables }) { if (table === 'lead_handoffs' && operation === 'update') tables.lead_handoffs[0].status = 'cancelled'; } });
    f.tables.lead_handoffs.push({ id: 'handoff-a', organization_id: org, lead_id: leadId, offered_to: userId, status: 'pending', created_at: initialVersion });
    assert.equal((await f.handoff({ action: 'accept' })).status, 409); assert.equal(funnel(f, 'assumido').length, 0);
    assert.equal(f.tables.activities.length, 0); assert.equal(f.tables.lead_tasks.length, 0);
  });
  await check('Devolução explícita limpa próximo passo humano sem reativar opt-out e sem duplicar histórico', async () => {
    const f = scenario(); Object.assign(f.tables.leads[0], { owner_mode: 'human', owner_id: userId, opt_out: true });
    assert.equal((await f.handoff({ action: 'release' })).status, 200); assert.equal(f.tables.leads[0].ai_enabled, false);
    assert.equal(f.tables.leads[0].metadata.nara_journey.requested_next_step, null);
    const writes = f.writes.length; assert.equal((await (await f.handoff({ action: 'release' })).json()).idempotent, true); assert.equal(f.writes.length, writes);
  });
  console.log(`\nResultados humanos: ${passed}/${passed} verificações aprovadas, handlers reais e rede proibida.`);
} finally { Date.now = realClock; }
