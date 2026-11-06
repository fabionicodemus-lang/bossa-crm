// Executes the production Outlook guard with injected in-memory dependencies.
// No Microsoft connection, Supabase, calendar, provider or real contact is loaded.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const source = await readFile(new URL('../src/lib/agenda-ai-microsoft.ts', import.meta.url), 'utf8');
const executable = stripTypeScriptTypes(source)
  .replace(/^import\s.*?;\s*$/gm, '')
  .replace(/^export async function /gm, 'async function ');
const created = {
  status: 'created', eventId: 'agenda-qa', assignedTo: 'human-qa',
  startsAt: '2026-11-09T15:00:00Z', endsAt: '2026-11-09T16:00:00Z', meetingMode: 'video', location: null,
};
function scenario(options = {}) {
  const calls = [];
  const args = {
    organizationId: 'org-qa', lead: { id: 'lead-qa' }, turn: { agenda_confirmed: false, handoff: false },
    lastUserMessage: 'Videochamada sintética segunda às 12h.',
    officeAddress: 'Endereço sintético', weekdayHours: '09:00-18:00', saturdayHours: '09:00-12:00',
    admin: { from(table) {
      assert.equal(table, 'agenda_events');
      const query = {
        select() { return query; },
        eq(key, value) { calls.push({ method: 'eq', key, value }); return query; },
        async single() {
          if (options.readThrows) throw new Error('synthetic read error');
          return { data: options.readMissing ? null : {
            id: 'agenda-qa', microsoft_sync_status: options.synced ? 'synced' : 'pending',
            microsoft_event_id: options.synced ? 'outlook-qa' : null,
          }, error: options.readError ? { message: 'synthetic DB failure' } : null };
        },
      };
      return query;
    } },
  };
  const run = new Function('maybeScheduleAgendaFromAi', 'getMicrosoftConnection', 'pushMicrosoftEvent', `${executable}\nreturn maybeScheduleAgendaWithMicrosoft;`)(
    async (received) => {
      assert.equal(received, args, 'The complete original arguments must reach the core unchanged.');
      calls.push({ method: 'core', officeAddress: received.officeAddress, weekdayHours: received.weekdayHours, saturdayHours: received.saturdayHours });
      const result = options.coreResult ?? created;
      received.turn.agenda_confirmed = result.status === 'created';
      return result;
    },
    async (org, user) => {
      calls.push({ method: 'connection', org, user });
      if (options.connectionThrows) throw new Error('synthetic connection read failure');
      return options.disconnected ? null : { user_id: 'human-qa' };
    },
    async (event) => {
      calls.push({ method: 'push', eventId: event.id });
      if (options.pushThrows) throw new Error('synthetic Microsoft failure');
      return options.pushResult ?? 'synced';
    },
  );
  return { run: () => run(args), args, calls };
}

let passed = 0;
async function check(name, run) { await run(); passed += 1; console.log(`✓ ${name}`); }

await check('Encaminha endereço e horários originais sem regressão', async () => {
  const fixture = scenario();
  await fixture.run();
  assert.deepEqual(fixture.calls[0], { method: 'core', officeAddress: 'Endereço sintético', weekdayHours: '09:00-18:00', saturdayHours: '09:00-12:00' });
});

for (const status of ['none', 'needs_details', 'conflict', 'cancelled']) {
  await check(`Resultado ${status} do core não cria confirmação ou sincronização indevida`, async () => {
    const coreResult = { status, message: 'Resultado sintético.' };
    const fixture = scenario({ coreResult });
    assert.deepEqual(await fixture.run(), coreResult);
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.args.turn.agenda_confirmed, false);
  });
}

await check('Sem conexão configurada preserva confirmação da agenda local', async () => {
  const fixture = scenario({ disconnected: true });
  assert.deepEqual(await fixture.run(), created);
  assert.equal(fixture.args.turn.agenda_confirmed, true);
  assert.equal(fixture.calls.some((call) => call.method === 'push'), false);
});

await check('Conexão existente só confirma após sincronização bem-sucedida', async () => {
  const fixture = scenario();
  assert.deepEqual(await fixture.run(), created);
  assert.equal(fixture.args.turn.agenda_confirmed, true);
  assert.ok(fixture.calls.some((call) => call.method === 'eq' && call.key === 'organization_id' && call.value === 'org-qa'));
  assert.equal(fixture.calls.filter((call) => call.method === 'push').length, 1);
});

await check('Evento já sincronizado não cria outro compromisso no Outlook', async () => {
  const fixture = scenario({ synced: true });
  assert.deepEqual(await fixture.run(), created);
  assert.equal(fixture.args.turn.agenda_confirmed, true);
  assert.equal(fixture.calls.some((call) => call.method === 'push'), false);
});

for (const [label, options] of [
  ['falha na consulta da conexão', { connectionThrows: true }],
  ['falha na consulta do evento', { readError: true }],
  ['evento ausente', { readMissing: true }],
  ['exceção de leitura', { readThrows: true }],
  ['exceção da Microsoft', { pushThrows: true }],
  ['resposta não sincronizada', { pushResult: 'failed' }],
  ['conexão perdida entre leitura e envio', { pushResult: 'not_connected' }],
]) await check(`Não confirma em ${label}; limpa flag e pede humano`, async () => {
  const fixture = scenario(options);
  const result = await fixture.run();
  assert.equal(result.status, 'needs_details');
  assert.equal(result.requiresHuman, true);
  assert.equal(fixture.args.turn.agenda_confirmed, false);
  assert.equal(fixture.args.turn.handoff, true);
  assert.match(result.message, /não consegui confirmar/);
});

const entryPoint = await readFile(new URL('../src/lib/agenda-ai.ts', import.meta.url), 'utf8');
await check('Entrada única exporta wrapper e contrato de resultado', () => {
  assert.match(entryPoint, /maybeScheduleAgendaWithMicrosoft as maybeScheduleAgendaFromAi/);
  assert.match(entryPoint, /export type \{ AgendaAiResult \}/);
});

console.log(`\nAgenda/Outlook: ${passed}/${passed} verificações sintéticas aprovadas. Sem compromisso ou envio real.`);
