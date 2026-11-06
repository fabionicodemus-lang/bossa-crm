// Production funnel logic with synthetic in-memory data only. No database,
// provider, account, real contact, message or calendar is accessed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import {
  NARA_FUNNEL_ACTIVITY_TYPE, NARA_FUNNEL_EVENTS,
  buildNaraFunnelActivity, recordNaraFunnelEvent, tryRecordNaraFunnelEvent,
  summarizeNaraFunnelEvents, loadNaraFunnelSummary, previewNaraExperimentAssignment,
} from '../src/lib/nara-funnel-events.ts';

const FROM = '2026-11-01T00:00:00.000Z';
const TO = '2026-12-01T00:00:00.000Z';
const WHEN = '2026-11-06T14:00:00.000Z';
const base = {
  organizationId: 'org-qa', leadId: 'lead-qa', event: 'compromisso_confirmado',
  source: 'agenda', occurredAt: WHEN, evidence: { agenda_event_id: 'agenda-qa' },
  dimensions: { contact_kind: 'cliente', development: 'Empreendimento sintético', meeting_mode: 'video' },
};
const row = (overrides = {}) => ({ ...buildNaraFunnelActivity({ ...base, ...overrides }), created_at: WHEN });

function nested(row, key) {
  return key.split(/->>?/).reduce((value, part) => value?.[part], row);
}
function memoryClient(initial = [], options = {}) {
  const rows = structuredClone(initial); const calls = []; let sequence = 0;
  return {
    rows, calls,
    from(table) {
      assert.equal(table, 'activities', 'The explicit funnel must never query legacy milestones or alter leads.');
      let payload; let operation = 'select'; let upsertOptions; const filters = []; let range = null;
      const query = {
        select(fields) { calls.push({ table, method: 'select', fields }); return query; },
        upsert(value, config) { operation = 'upsert'; payload = value; upsertOptions = config; return query; },
        eq(key, value) { calls.push({ table, method: 'eq', key, value }); filters.push((row) => String(nested(row, key)) === String(value)); return query; },
        gte(key, value) { filters.push((row) => nested(row, key) >= value); return query; },
        lt(key, value) { filters.push((row) => nested(row, key) < value); return query; },
        order() { return query; },
        range(from, to) { range = [from, to]; calls.push({ table, method: 'range', from, to }); return query; },
        then(resolve, reject) { return Promise.resolve().then(() => {
          if (options.fail) return { data: null, error: { message: 'Synthetic DB failure' } };
          if (operation === 'upsert') {
            assert.deepEqual(upsertOptions, { onConflict: 'id', ignoreDuplicates: true });
            const exists = rows.find((row) => row.id === payload.id);
            if (exists) return { data: [], error: null };
            rows.push({ ...structuredClone(payload), created_at: WHEN, _sequence: sequence++ });
            return { data: [{ id: payload.id }], error: null };
          }
          let selected = rows.filter((row) => filters.every((test) => test(row)));
          if (range) selected = selected.slice(range[0], range[1] + 1);
          return { data: structuredClone(selected), error: null };
        }).then(resolve, reject); },
      };
      return query;
    },
  };
}

let passed = 0;
async function check(name, run) { await run(); passed += 1; console.log(`✓ ${name}`); }

await check('Gera UUID estável válido sem incluir texto, telefone ou credenciais na chave', () => {
  const activity = row();
  assert.match(activity.id, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(activity.metadata.event_key, /^nara-funnel-v1:[0-9a-f]{64}$/);
  assert.equal(activity.type, NARA_FUNNEL_ACTIVITY_TYPE);
  assert.equal(activity.metadata.event, 'compromisso_confirmado');
});

await check('Reprocessamento ignora hora do retry e mensagem secundária para a mesma confirmação', () => {
  assert.equal(row().id, row({ occurredAt: '2026-11-07T14:00:00Z', evidence: { agenda_event_id: 'agenda-qa', source_message_id: 'retry-qa' } }).id);
});

await check('Mesma entidade de outra organização ou pessoa não colide', () => {
  assert.notEqual(row().id, row({ organizationId: 'org-other-qa' }).id);
  assert.notEqual(row().id, row({ leadId: 'lead-other-qa' }).id);
});

await check('Upsert idempotente preserva a primeira ocorrência e não duplica em concorrência', async () => {
  const db = memoryClient();
  const results = await Promise.all(Array.from({ length: 8 }, () => recordNaraFunnelEvent(db, base)));
  assert.equal(db.rows.length, 1);
  assert.equal(results.filter((result) => result.recorded).length, 1);
  await recordNaraFunnelEvent(db, { ...base, occurredAt: '2026-11-09T18:00:00Z' });
  assert.equal(db.rows[0].metadata.occurred_at, WHEN);
});

await check('Falha de telemetria não altera a operação e retorna indisponibilidade explícita', async () => {
  const db = memoryClient([], { fail: true });
  await assert.rejects(() => recordNaraFunnelEvent(db, base), /registrar o marco/);
  const outcome = await tryRecordNaraFunnelEvent(db, base);
  assert.equal(outcome.recorded, false);
  assert.equal(outcome.error, 'funnel_event_not_recorded');
  assert.equal(db.rows.length, 0);
});

for (const [name, overrides, pattern] of [
  ['tipo inválido', { event: 'stage_agendado' }, /tipo do evento/],
  ['data inválida', { occurredAt: 'invalid' }, /Data/],
  ['sem evidência', { evidence: {} }, /evidência/],
  ['confirmação sem agenda', { evidence: { source_message_id: 'msg-qa' } }, /compromisso/],
  ['realizado sem humano', { event: 'compromisso_realizado' }, /humano/],
  ['no-show sem humano', { event: 'nao_compareceu' }, /humano/],
  ['assumido sem passagem', { event: 'assumido' }, /passagem/],
  ['envio de tabela não é proposta', { event: 'proposta_enviada', evidence: { outbound_message_id: 'table-qa' } }, /proposta personalizada/],
  ['proposta criada não é enviada', { event: 'proposta_enviada', evidence: { proposal_id: 'proposal-qa' } }, /não comprova envio/],
  ['proposta enviada não é apresentada', { event: 'proposta_apresentada', evidence: { proposal_id: 'proposal-qa', outbound_message_id: 'send-qa' } }, /humano/],
  ['resposta gerada não é enviada', { event: 'resposta_enviada', evidence: { source_message_id: 'msg-qa' } }, /efetivamente enviada/],
  ['resposta enviada não é útil sem revisão', { event: 'primeira_resposta_util', evidence: { outbound_message_id: 'send-qa' } }, /revisão explícita/],
  ['reagendamento sem identidade da mudança', { event: 'reagendado' }, /identidade estável/],
]) await check(`Rejeita ${name}`, () => assert.throws(() => row(overrides), pattern));

await check('Realização explícita preserva ator, agenda e data reais declarados pelo operador', () => {
  const activity = row({ event: 'compromisso_realizado', actorId: 'human-qa' });
  assert.equal(activity.user_id, 'human-qa');
  assert.equal(activity.metadata.evidence.agenda_event_id, 'agenda-qa');
});

await check('Proposta com envio identificado e apresentação humana são eventos diferentes', () => {
  const sent = row({ event: 'proposta_enviada', evidence: { proposal_id: 'proposal-qa', outbound_message_id: 'sent-qa' } });
  const presented = row({ event: 'proposta_apresentada', actorId: 'human-qa', evidence: { proposal_id: 'proposal-qa' } });
  const result = summarizeNaraFunnelEvents([sent, presented], { organizationId: 'org-qa' });
  assert.equal(result.counts.proposta_enviada.events, 1);
  assert.equal(result.counts.proposta_apresentada.events, 1);
  assert.equal(result.counts.compromisso_realizado.events, 0);
});

await check('Reagendamentos distintos contam separadamente; retries da mesma transição não', () => {
  const first = row({ event: 'reagendado', dedupeKey: 'agenda-qa:2026-11-08T15:00Z' });
  const again = row({ event: 'reagendado', dedupeKey: 'agenda-qa:2026-11-08T15:00Z' });
  const second = row({ event: 'reagendado', dedupeKey: 'agenda-qa:2026-11-09T15:00Z' });
  const summary = summarizeNaraFunnelEvents([first, again, second], { organizationId: 'org-qa' });
  assert.equal(summary.counts.reagendado.events, 2);
  assert.equal(summary.counts.reagendado.unique_leads, 1);
  assert.equal(summary.coverage.duplicate_records, 1);
});

await check('Trilha legada e auto-detecção não entram nos contadores explícitos', () => {
  const legacy = [
    { ...row(), type: 'proposta_detectada_whatsapp' },
    { ...row(), type: 'agendamento_detectado_whatsapp' },
    { ...row(), type: 'analise_hibrida_ia' },
    { ...row(), metadata: { stage: 'fechado_ganho', meeting_at: WHEN, proposal_at: WHEN } },
  ];
  const summary = summarizeNaraFunnelEvents(legacy, { organizationId: 'org-qa' });
  assert.equal(summary.coverage.accepted_events, 0);
  assert.equal(summary.coverage.legacy_milestones_included, false);
  assert.equal(summary.coverage.retrospective_inference, false);
});

await check('Agendamento vencido não se transforma em realizado/no-show', () => {
  const summary = summarizeNaraFunnelEvents([row({ occurredAt: '2026-01-01T09:00:00Z' })], { organizationId: 'org-qa' });
  assert.equal(summary.counts.compromisso_confirmado.events, 1);
  assert.equal(summary.counts.compromisso_realizado.events, 0);
  assert.equal(summary.counts.nao_compareceu.events, 0);
});

await check('Solicitado, encaminhado e assumido são separados, sem efeito cascata', () => {
  const request = row({ event: 'atendimento_humano_solicitado', evidence: { handoff_id: 'handoff-qa' } });
  const summary = summarizeNaraFunnelEvents([request], { organizationId: 'org-qa' });
  assert.equal(summary.counts.atendimento_humano_solicitado.events, 1);
  assert.equal(summary.counts.encaminhado.events, 0);
  assert.equal(summary.counts.assumido.events, 0);
});

await check('Leitura segrega clientes, corretores e desconhecidos, contando pessoas únicas', () => {
  const data = [row(), row({ evidence: { agenda_event_id: 'agenda-two-qa' } }),
    row({ leadId: 'broker-qa', dimensions: { contact_kind: 'corretor' } }),
    row({ leadId: 'unknown-qa', dimensions: {} })];
  const summary = summarizeNaraFunnelEvents(data, { organizationId: 'org-qa' });
  assert.equal(summary.counts.compromisso_confirmado.events, 4);
  assert.equal(summary.counts.compromisso_confirmado.unique_leads, 3);
  assert.equal(summary.by_contact_kind.cliente.compromisso_confirmado.unique_leads, 1);
  assert.equal(summary.by_contact_kind.corretor.compromisso_confirmado.events, 1);
  assert.equal(summary.by_contact_kind.desconhecido.compromisso_confirmado.events, 1);
});

await check('Filtra organização, início inclusivo e término exclusivo sem retrospectiva', () => {
  const data = [row({ occurredAt: FROM }), row({ occurredAt: TO, evidence: { agenda_event_id: 'future-qa' } }),
    row({ organizationId: 'other-org-qa' })];
  const summary = summarizeNaraFunnelEvents(data, { organizationId: 'org-qa', from: FROM, to: TO });
  assert.equal(summary.counts.compromisso_confirmado.events, 1);
  assert.equal(summary.coverage.observed_from, FROM);
  assert.equal(summary.conversion_rates, null);
});

await check('Nenhum registro vira indisponibilidade de coorte, não taxa 0% inventada', () => {
  const summary = summarizeNaraFunnelEvents([], { organizationId: 'org-qa' });
  assert.equal(summary.conversion_rates, null);
  assert.equal(summary.coverage.observed_from, null);
  assert.equal(Object.keys(summary.counts).length, NARA_FUNNEL_EVENTS.length);
});

await check('Evento sem coletor aparece indisponível, nunca zero de conversão inventado', () => {
  const summary = summarizeNaraFunnelEvents([], { organizationId: 'org-qa' });
  for (const event of ['primeira_resposta_util', 'interesse_identificado', 'proximo_passo_oferecido', 'negociacao_iniciada', 'venda_fechada', 'perdido', 'sem_interesse']) {
    assert.equal(summary.counts[event].events, null);
    assert.equal(summary.counts[event].unique_leads, null);
    assert.equal(summary.counts[event].collection, 'not_instrumented');
  }
  assert.equal(summary.counts.proposta_apresentada.collection, 'human_record');
  assert.equal(summary.counts.nao_compareceu.collection, 'human_record');
});

await check('Consulta usa organização explícita, tipo novo, schema e cliente de sessão', async () => {
  const db = memoryClient([row(), row({ organizationId: 'other-org-qa' }), { ...row(), type: 'proposta' }]);
  const summary = await loadNaraFunnelSummary(db, { organizationId: 'org-qa', from: FROM, to: TO });
  assert.equal(summary.counts.compromisso_confirmado.events, 1);
  assert.ok(db.calls.some((call) => call.key === 'organization_id' && call.value === 'org-qa'));
  assert.ok(db.calls.some((call) => call.key === 'type' && call.value === NARA_FUNNEL_ACTIVITY_TYPE));
  assert.equal(summary.coverage.truncated, false);
});

await check('Paginação e limite anunciam truncamento, nunca total falso', async () => {
  const data = Array.from({ length: 503 }, (_, index) => row({ leadId: `lead-${index}-qa` }));
  const db = memoryClient(data);
  const summary = await loadNaraFunnelSummary(db, { organizationId: 'org-qa', from: FROM, to: TO, maxRows: 501 });
  assert.equal(summary.counts.compromisso_confirmado.events, 501);
  assert.equal(summary.coverage.truncated, true);
  assert.equal(db.calls.filter((call) => call.method === 'range').length, 2);
});

await check('Falha de leitura não retorna contadores vazios como sucesso', async () => {
  await assert.rejects(() => loadNaraFunnelSummary(memoryClient([], { fail: true }), {
    organizationId: 'org-qa', from: FROM, to: TO,
  }), /consultar/);
});

const routeSource = await readFile(new URL('../src/app/api/nara/funnel/route.ts', import.meta.url), 'utf8');
const executable = stripTypeScriptTypes(routeSource)
  .replace(/^import\s.*?;\s*$/gm, '')
  .replace(/^export const /gm, 'const ')
  .replace(/^export async function /gm, 'async function ');
function testRoute(options = {}) {
  const calls = [];
  const get = new Function('getCurrentContext', 'createClient', 'loadNaraFunnelSummary', `${executable}\nreturn GET;`)(
    async () => options.unauthenticated ? null : { organization: { id: 'session-org-qa' }, role: 'comercial' },
    async () => { calls.push({ sessionClient: true }); return { session: true }; },
    async (client, args) => { calls.push({ client, args }); if (options.fail) throw new Error('synthetic'); return { ok: true }; },
  );
  return { get, calls };
}

await check('API rejeita não autenticado sem criar cliente ou consultar dados', async () => {
  const { get, calls } = testRoute({ unauthenticated: true });
  const response = await get(new Request('https://synthetic.invalid/api/nara/funnel'));
  assert.equal(response.status, 401); assert.equal(calls.length, 0);
});

for (const query of ['from=no-date', `from=${TO}&to=${FROM}`, 'from=2020-01-01&to=2026-01-01', 'kind=admin']) {
  await check(`API rejeita filtro inválido: ${query}`, async () => {
    const { get, calls } = testRoute();
    const response = await get(new Request(`https://synthetic.invalid/api/nara/funnel?${query}`));
    assert.equal(response.status, 400); assert.equal(calls.length, 0);
  });
}

await check('API ignora organização adulterada e não permite cache compartilhado', async () => {
  const { get, calls } = testRoute();
  const response = await get(new Request(`https://synthetic.invalid/api/nara/funnel?organizationId=attacker&from=${FROM}&to=${TO}&kind=cliente`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(calls[1].args.organizationId, 'session-org-qa');
  assert.equal(calls[1].args.contactKind, 'cliente');
  assert.equal(calls[1].client.session, true);
});

await check('API retorna 503 em falha de dados, não um funil zerado', async () => {
  const { get } = testRoute({ fail: true });
  const response = await get(new Request(`https://synthetic.invalid/api/nara/funnel?from=${FROM}&to=${TO}`));
  assert.equal(response.status, 503);
});

await check('A/B fica desligado por padrão e nunca aciona banco ou roteamento', () => {
  assert.deepEqual(previewNaraExperimentAssignment({ organizationId: 'org-qa', canonicalPersonId: 'person-qa', experimentId: 'exp-qa', seed: 'fixed-qa' }), { active: false, variant: null });
});

await check('Simulação offline mantém a variante da mesma pessoa com semente estável', () => {
  const args = { enabled: true, organizationId: 'org-qa', canonicalPersonId: 'person-qa', experimentId: 'exp-qa', seed: 'fixed-qa' };
  const assignment = previewNaraExperimentAssignment(args);
  for (let i = 0; i < 20; i++) assert.deepEqual(previewNaraExperimentAssignment(args), assignment);
  const variants = new Set(Array.from({ length: 100 }, (_, index) => previewNaraExperimentAssignment({ ...args, canonicalPersonId: `person-${index}-qa` }).variant));
  assert.equal(variants.size, 2);
  assert.throws(() => previewNaraExperimentAssignment({ ...args, canonicalPersonId: '' }), /identidade canônica/);
});

console.log(`\nFunil explícito: ${passed}/${passed} verificações sintéticas aprovadas. Sem banco, mensagens ou experimento real.`);
