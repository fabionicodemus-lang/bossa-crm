// Valida o registro de consumo de IA: cálculo do custo e gravação em
// ai_usage_logs pelas rotinas que antes chamavam a OpenAI sem registrar nada.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AI_USAGE_KINDS,
  buildUsageRecord,
  usageFromResponsesPayload,
  usageFromTranscription,
} from '../src/lib/ai-pricing.ts';
import { recordAiUsage, recordAiUsageLog } from '../src/lib/ai-usage.ts';
import { runBrokerPerformance } from '../src/lib/broker-performance.ts';

const near = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: esperado ${expected}, veio ${actual}`);

// ── 1. Custo de uma chamada comum (gpt-5.6-luna: 1 / 0,10 / 1,25 / 6 por milhão) ──
const luna = usageFromResponsesPayload({
  id: 'resp_1',
  model: 'gpt-5.6-luna',
  usage: {
    input_tokens: 10_000,
    output_tokens: 500,
    input_tokens_details: { cached_tokens: 4_000, cache_write_tokens: 2_000 },
    output_tokens_details: { reasoning_tokens: 120 },
  },
}, { requestKind: 'broker_review', fallbackModel: 'gpt-5.6-terra' });
assert.ok(luna);
assert.equal(luna.request_kind, 'broker_review');
assert.equal(luna.model, 'gpt-5.6-luna', 'usa o modelo que respondeu, não o pedido');
assert.equal(luna.request_id, 'resp_1');
assert.equal(luna.input_tokens, 10_000);
assert.equal(luna.cached_tokens, 4_000);
assert.equal(luna.cache_write_tokens, 2_000);
assert.equal(luna.output_tokens, 500);
assert.equal(luna.reasoning_tokens, 120);
// 4.000 sem cache × 1 + 4.000 em cache × 0,10 + 2.000 gravados × 1,25 + 500 saída × 6 = 9.900 / 1.000.000
near(luna.estimated_cost_usd, 0.0099, 'custo luna');

// ── 2. Sem `usage` não há o que registrar; a Nara mantém a contagem prévia ──
assert.equal(usageFromResponsesPayload({ id: 'resp_2' }, { requestKind: 'broker_review', fallbackModel: 'gpt-5.6-luna' }), null);
assert.equal(usageFromResponsesPayload(null, { requestKind: 'broker_review', fallbackModel: 'gpt-5.6-luna' }), null);
const nara = buildUsageRecord({ id: 'resp_3' }, {
  requestKind: 'response', fallbackModel: 'gpt-5.6-terra', preflightInputTokens: 2_000, preflightEstimated: true,
  fallbackUsed: true, compacted: true,
});
assert.equal(nara.model, 'gpt-5.6-terra');
assert.equal(nara.input_tokens, 2_000);
assert.equal(nara.preflight_input_tokens, 2_000);
assert.equal(nara.preflight_estimated, true);
assert.equal(nara.fallback_used, true);
assert.equal(nara.compacted, true);
near(nara.estimated_cost_usd, 0.005, 'custo terra só com entrada');

// ── 3. Contexto longo dobra a entrada e multiplica a saída por 1,5 ──
const long = buildUsageRecord({ model: 'gpt-5.6-luna', usage: { input_tokens: 300_000, output_tokens: 1_000 } },
  { requestKind: 'broker_performance', fallbackModel: 'gpt-5.6-luna' });
assert.equal(long.long_context, true);
near(long.estimated_cost_usd, (300_000 * 1 * 2 + 1_000 * 6 * 1.5) / 1_000_000, 'custo contexto longo');

// ── 4. Transcrição: por tokens (texto e áudio com preços diferentes) e por duração ──
const mini = usageFromTranscription({
  type: 'tokens', input_tokens: 1_000, output_tokens: 200, input_token_details: { text_tokens: 100, audio_tokens: 900 },
}, 'gpt-4o-mini-transcribe');
assert.ok(mini);
assert.equal(mini.request_kind, 'audio_transcription');
assert.equal(mini.input_tokens, 1_000);
assert.equal(mini.output_tokens, 200);
near(mini.estimated_cost_usd, (100 * 1.25 + 900 * 3 + 200 * 5) / 1_000_000, 'custo transcrição mini');
const semDetalhe = usageFromTranscription({ type: 'tokens', input_tokens: 1_000, output_tokens: 200 }, 'gpt-4o-mini-transcribe');
near(semDetalhe.estimated_cost_usd, (1_000 * 3 + 200 * 5) / 1_000_000, 'sem detalhamento a entrada conta como áudio');
const duracao = usageFromTranscription({ type: 'duration', seconds: 90 }, 'whisper-1');
near(duracao.estimated_cost_usd, 0.009, 'custo por duração');
assert.equal(usageFromTranscription(undefined, 'gpt-transcribe'), null);
assert.equal(usageFromTranscription({ type: 'tokens' }, 'gpt-transcribe'), null);

// ── 5. A migration libera exatamente os tipos que o código grava ──
const migration = readFileSync(new URL('../supabase/migrations/20261008141500_ai_usage_request_kinds.sql', import.meta.url), 'utf8');
const allowed = [...migration.slice(migration.indexOf('check (request_kind in')).matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
assert.deepEqual([...allowed].sort(), [...AI_USAGE_KINDS].sort(), 'tipos do código e da migration precisam ser os mesmos');

// ── Banco simulado: guarda o que foi gravado e o que foi alterado ──
function fakeDb({ tables = {}, rpc = {}, insertError = null } = {}) {
  const calls = { inserts: [], updates: [] };
  const builder = (table) => {
    const state = { op: 'select', payload: null };
    const result = () => {
      if (state.op === 'insert') {
        if (table === 'ai_usage_logs' && insertError) return { data: null, error: { message: insertError } };
        calls.inserts.push({ table, rows: state.payload });
        return { data: null, error: null };
      }
      if (state.op === 'update') {
        calls.updates.push({ table, values: state.payload });
        return { data: null, error: null };
      }
      const rows = tables[table] ?? [];
      return { data: state.single ? rows[0] ?? null : rows, error: null };
    };
    const chain = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') return (resolve, reject) => Promise.resolve(result()).then(resolve, reject);
        if (prop === 'insert' || prop === 'update' || prop === 'upsert') return (payload) => { state.op = prop === 'upsert' ? 'insert' : prop; state.payload = payload; return chain; };
        if (prop === 'single' || prop === 'maybeSingle') return () => { state.single = true; return chain; };
        return () => chain;
      },
    });
    return chain;
  };
  return {
    calls,
    from: builder,
    rpc: async (name) => ({ data: typeof rpc[name] === 'function' ? rpc[name]() : rpc[name] ?? null, error: null }),
  };
}

const record = usageFromResponsesPayload({ id: 'resp_4', model: 'gpt-5.6-luna', usage: { input_tokens: 100, output_tokens: 10 } },
  { requestKind: 'commercial_intelligence', fallbackModel: 'gpt-5.6-luna' });

// ── 6. Rotinas em segundo plano gravam o log e NÃO mexem no lead ──
const background = fakeDb();
assert.equal(await recordAiUsageLog({ admin: background, organizationId: 'org', leadId: 'lead', records: [record] }), true);
assert.equal(background.calls.inserts.length, 1);
assert.equal(background.calls.inserts[0].table, 'ai_usage_logs');
assert.equal(background.calls.inserts[0].rows[0].request_kind, 'commercial_intelligence');
assert.equal(background.calls.inserts[0].rows[0].lead_id, 'lead');
assert.equal(background.calls.updates.length, 0, 'análise em segundo plano não pode alterar o lead');
await recordAiUsageLog({ admin: background, organizationId: 'org', leadId: 'lead', records: [] });
assert.equal(background.calls.inserts.length, 1, 'sem consumo, nada é gravado');

// ── 7. Banco recusando ou caindo não derruba a rotina ──
assert.equal(await recordAiUsageLog({ admin: fakeDb({ insertError: 'violates check constraint' }), organizationId: 'org', leadId: 'lead', records: [record] }), false);
assert.equal(await recordAiUsageLog({ admin: { from() { throw new Error('rede fora'); } }, organizationId: 'org', leadId: 'lead', records: [record] }), false);

// ── 8. A Nara continua gravando o log e somando o total no cartão do lead ──
const naraDb = fakeDb({ tables: { leads: [{ metadata: { ai_usage: { calls: 2, estimated_cost_usd: 0.5 }, outro: 'preservado' } }] } });
await recordAiUsage({ admin: naraDb, organizationId: 'org', leadId: 'lead', records: [record] });
assert.equal(naraDb.calls.inserts.length, 1);
assert.equal(naraDb.calls.updates.length, 1);
assert.equal(naraDb.calls.updates[0].table, 'leads');
assert.equal(naraDb.calls.updates[0].values.metadata.outro, 'preservado');
assert.equal(naraDb.calls.updates[0].values.metadata.ai_usage.calls, 3);
near(naraDb.calls.updates[0].values.metadata.ai_usage.estimated_cost_usd, 0.5 + record.estimated_cost_usd, 'total no lead');

// ── 9. Ponta a ponta: o desempenho do corretor chama a OpenAI e registra o custo ──
const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = 'test-key';
const job = { lead_id: 'broker-1', organization_id: 'org-1', cutoff: '2026-10-08T00:00:00Z', scanned: 0, message_count: 1, lease_token: 'lease', attempts: 0, unread_media: 0 };
const brokerTables = {
  leads: [{ id: 'broker-1', name: 'Corretor Teste', kind: 'corretor', organization_id: 'org-1' }],
  messages: [{ id: 'm1', body: 'Tenho um cliente interessado no Flow', direction: 'in', sender_kind: 'lead', created_at: '2026-10-07T12:00:00Z', raw_payload: null }],
};

async function runJob(openAiResponse) {
  let claimed = false;
  const db = fakeDb({ tables: brokerTables, rpc: { claim_broker_performance: () => (claimed ? [] : (claimed = true, [job])) } });
  let openAiCalls = 0;
  globalThis.fetch = async (url) => {
    assert.equal(String(url), 'https://api.openai.com/v1/responses');
    openAiCalls += 1;
    return openAiResponse();
  };
  const results = await runBrokerPerformance(db);
  return { db, results, openAiCalls };
}

try {
  const ok = await runJob(() => new Response(JSON.stringify({
    id: 'resp_bp', model: 'gpt-5.6-luna', status: 'completed',
    usage: { input_tokens: 3_000, output_tokens: 400 },
    output: [{ content: [{ type: 'output_text', text: '{"events":[]}' }] }],
  }), { status: 200 }));
  assert.equal(ok.openAiCalls, 1);
  const logged = ok.db.calls.inserts.filter((call) => call.table === 'ai_usage_logs');
  assert.equal(logged.length, 1, 'a chamada precisa aparecer em ai_usage_logs');
  assert.equal(logged[0].rows[0].request_kind, 'broker_performance');
  assert.equal(logged[0].rows[0].organization_id, 'org-1');
  assert.equal(logged[0].rows[0].lead_id, 'broker-1');
  assert.equal(logged[0].rows[0].request_id, 'resp_bp');
  near(Number(logged[0].rows[0].estimated_cost_usd), (3_000 * 1 + 400 * 6) / 1_000_000, 'custo do desempenho');
  assert.equal(ok.db.calls.updates.filter((call) => call.table === 'leads').length, 0, 'o lead do corretor não é alterado');
  assert.ok(!ok.results[0].error, 'a rotina conclui normalmente');

  // Resposta cobrada porém inaproveitável: a rotina falha como antes, mas o custo fica registrado.
  const broken = await runJob(() => new Response(JSON.stringify({
    id: 'resp_bad', model: 'gpt-5.6-luna', status: 'incomplete',
    usage: { input_tokens: 3_000, output_tokens: 10_000 }, output: [],
  }), { status: 200 }));
  assert.ok(broken.results[0].error, 'extração incompleta continua sendo erro');
  const brokenLog = broken.db.calls.inserts.filter((call) => call.table === 'ai_usage_logs');
  assert.equal(brokenLog.length, 1, 'chamada cobrada e descartada também é registrada');
  assert.equal(brokenLog[0].rows[0].request_id, 'resp_bad');

  // Erro HTTP da OpenAI não é cobrado: nada a registrar.
  const refused = await runJob(() => new Response(JSON.stringify({ error: { message: 'rate limit' } }), { status: 429 }));
  assert.ok(refused.results[0].error);
  assert.equal(refused.db.calls.inserts.filter((call) => call.table === 'ai_usage_logs').length, 0);
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
}

console.log('Consumo de IA validado: custo calculado e gravado para todas as rotinas, sem alterar o lead nas análises em segundo plano.');
