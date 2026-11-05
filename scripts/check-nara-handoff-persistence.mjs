// Execute the production persistence function with an in-memory transport.
// This verifies pending records/queues, NOT real delivery to a salesperson.
// No Supabase connection, provider, WhatsApp or external calendar is loaded.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { aiCanReply, deriveHybridDecision } from '../src/lib/hybrid.ts';
import { applyNaraFinancialHandoff } from '../src/lib/nara-sales-handoff.ts';
import { isAssistedSaleSignal, isBrokerRoutingSignal, isPostSaleRoutingSignal } from '../src/lib/nara-contact-routing.ts';
import { whatsappCanStillReply } from '../src/lib/whatsapp/aiTurnSafety.ts';

const source = await readFile(new URL('../src/lib/hybrid-server.ts', import.meta.url), 'utf8');
const executable = stripTypeScriptTypes(source)
  .replace(/^import\s.*?;\s*$/gm, '')
  .replace(/export async function applyHybridDecision/, 'async function applyHybridDecision');
const applyHybridDecision = new Function('deriveHybridDecision', 'isAssistedSaleSignal',
  'isBrokerRoutingSignal', 'isPostSaleRoutingSignal', `${executable}\nreturn applyHybridDecision;`)(
  deriveHybridDecision, isAssistedSaleSignal, isBrokerRoutingSignal, isPostSaleRoutingSignal,
);

const baseLead = {
  id: 'lead-handoff-qa', organization_id: 'org-handoff-qa', kind: 'cliente',
  name: 'Pessoa Sintética QA', phone: '5547999990000', enterprise: 'Flow Aptos',
  source: 'qa-only', stage: 'novo_triagem', owner_mode: 'ai', owner_id: null,
  backup_owner_id: null, ai_enabled: true, automation_paused: false, opt_out: false,
  priority_class: 'C', handoff_requested_at: null, metadata: { payment_method: 'parcelado' },
};
const sourceMessage = {
  id: 'inbound-handoff-qa', lead_id: baseLead.id, whatsapp_conversation_id: 'conversation-handoff-qa',
  direction: 'in', sender_kind: 'lead', created_at: new Date().toISOString(),
};
const settings = {
  organization_id: baseLead.organization_id, enabled: true,
  primary_owner_user_id: 'salesperson-qa', primary_owner_name: 'Comercial QA',
  secondary_owner_user_id: 'post-sale-qa', secondary_owner_name: 'Pós-venda QA',
  manager_user_id: 'manager-qa', manager_name: 'Gestor QA',
};

function createDb(options = {}) {
  const tables = {
    leads: [structuredClone(baseLead)],
    client_handoff_settings: options.noSettings ? [] : [{ ...settings, enabled: options.enabled !== false }],
    lead_handoffs: [], lead_tasks: [], activities: [], client_handoff_alert_jobs: [],
    messages: [structuredClone(sourceMessage)],
  };
  const writes = []; const rpcCalls = [];
  function from(table) {
    assert.ok(Object.hasOwn(tables, table), `Unexpected table ${table}`);
    let operation = 'select'; let payload; let upsertOptions = {}; let cap;
    const filters = [];
    const query = {
      select() { return query; },
      insert(value) { operation = 'insert'; payload = value; return query; },
      update(value) { operation = 'update'; payload = value; return query; },
      upsert(value, config) { operation = 'upsert'; payload = value; upsertOptions = config; return query; },
      eq(key, value) { filters.push((row) => row[key] === value); return query; },
      neq(key, value) { filters.push((row) => row[key] !== value); return query; },
      gt(key, value) { filters.push((row) => row[key] > value); return query; },
      in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
      limit(value) { cap = value; return query; },
      maybeSingle() { return Promise.resolve(execute('maybe')); },
      single() { return Promise.resolve(execute('required')); },
      then(resolve, reject) { return Promise.resolve(execute(false)).then(resolve, reject); },
    };
    function execute(single) {
      if (options.fail?.table === table && options.fail?.operation === operation) {
        return { data: null, error: { code: 'QA_DB_ERROR', message: 'Synthetic database failure' } };
      }
      let rows = tables[table].filter((row) => filters.every((test) => test(row)));
      if (operation === 'update') {
        rows.forEach((row) => Object.assign(row, structuredClone(payload)));
        writes.push({ table, operation, payload: structuredClone(payload) });
      } else if (operation === 'insert' || operation === 'upsert') {
        const existing = operation === 'upsert' && upsertOptions.onConflict
          ? tables[table].find((row) => row[upsertOptions.onConflict] === payload[upsertOptions.onConflict])
          : null;
        if (existing) {
          if (!upsertOptions.ignoreDuplicates) Object.assign(existing, structuredClone(payload));
          rows = [existing];
        } else {
          const row = { id: `${table}-${tables[table].length + 1}`, ...structuredClone(payload) };
          tables[table].push(row); rows = [row];
        }
        writes.push({ table, operation, payload: structuredClone(payload) });
      }
      if (cap !== undefined) rows = rows.slice(0, cap);
      if (single && (rows.length > 1 || (single === 'required' && rows.length !== 1))) {
        return { data: null, error: { code: 'PGRST116', message: 'Expected one synthetic row' } };
      }
      return { data: single ? structuredClone(rows[0] ?? null) : structuredClone(rows), error: null };
    }
    return query;
  }
  async function rpc(name, args) {
    rpcCalls.push({ name, args: structuredClone(args) });
    if (name === 'next_client_handoff_owner') return { data: {
      user_id: 'salesperson-qa', owner_name: 'Comercial QA', alert_phone: null,
      reused: tables.lead_handoffs.some((row) => row.status === 'pending'),
    }, error: null };
    if (name === 'whatsapp_ai_turn_is_current') return { data: options.claimCurrent !== false, error: null };
    throw new Error(`Unexpected RPC ${name}`);
  }
  return { from, rpc, tables, writes, rpcCalls };
}

function turn(overrides = {}) {
  return {
    reply: 'Resposta sintética sem valores ofertados.', classification: 'morno', score: 45,
    stage: 'ia', handoff: false, attachment_ids: [], summary: 'Histórico sintético.',
    next_action: 'Continuar a conversa.',
    extracted: {
      enterprise: 'Flow Aptos', purpose: 'morar', typology: '3 suítes', budget: '',
      deadline: '2027', decision_maker: 'casal', company: '', creci: '', region: 'Itapema', client_status: '',
    },
    ...overrides,
  };
}
function financialTurn(message) {
  const result = turn();
  assert.equal(applyNaraFinancialHandoff(result, [{ role: 'user', content: message }]), true);
  return result;
}
async function persist(db, result, message) {
  const lead = structuredClone(db.tables.leads[0]);
  return applyHybridDecision({ admin: db, organizationId: lead.organization_id, lead,
    turn: result, lastUserMessage: message, sourceMessageId: sourceMessage.id });
}
const replyIdentity = (db) => ({ admin: db, leadId: baseLead.id,
  conversationId: sourceMessage.whatsapp_conversation_id, sourceId: sourceMessage.id });

let passed = 0;
async function check(title, test) {
  await test(); passed += 1; console.log(`✓ ${title}`);
}

for (const message of [
  'Tenho R$ 200.000 de entrada e consigo R$ 8.000 por mês para o Flow.',
  'Quero fazer uma proposta de R$ 900.000 na unidade 1601 do Flow.',
  'Consigo parcelar o Alma em 100 vezes? Qual a entrada?',
]) await check(`Persistência comercial em memória: ${message}`, async () => {
  const db = createDb(); const result = financialTurn(message); const before = Date.now();
  const decision = await persist(db, result, message);
  const lead = db.tables.leads[0]; const handoff = db.tables.lead_handoffs[0];
  const task = db.tables.lead_tasks[0]; const queued = db.tables.client_handoff_alert_jobs[0];
  assert.equal(decision.handoffRequired, true);
  assert.equal(decision.priorityClass, 'A1');
  assert.equal(lead.stage, 'passagem_pendente');
  assert.equal(lead.priority_class, 'A1');
  assert.equal(lead.owner_id, 'salesperson-qa');
  assert.ok(lead.handoff_requested_at);
  assert.equal(lead.metadata.hybrid_last_decision.handoff_required, true);
  assert.equal(lead.metadata.hybrid_last_decision.handoff_owner_name, 'Comercial QA');
  assert.equal(db.tables.lead_handoffs.length, 1);
  assert.equal(handoff.status, 'pending');
  assert.equal(handoff.offered_to, 'salesperson-qa');
  assert.equal(handoff.priority_class, 'A1');
  assert.match(handoff.briefing.main_objection, /Pedido declarado, ainda não aprovado:/);
  assert.ok(handoff.briefing.main_objection.includes(message));
  assert.equal(Object.hasOwn(handoff.briefing, 'approved_price'), false);
  assert.equal(Object.hasOwn(handoff.briefing, 'approved_payment_terms'), false);
  assert.equal(db.tables.lead_tasks.length, 1);
  assert.equal(task.assigned_to, 'salesperson-qa');
  assert.equal(task.assigned_mode, 'human');
  assert.equal(task.priority, 'urgent');
  assert.equal(task.status, 'pending');
  assert.equal(task.dedupe_key, 'handoff:pending');
  assert.ok(new Date(task.due_at).getTime() >= before);
  assert.ok(new Date(task.due_at).getTime() <= Date.now() + 5 * 60_000 + 1000);
  assert.equal(db.tables.client_handoff_alert_jobs.length, 1);
  assert.equal(queued.handoff_id, handoff.id);
  assert.equal(queued.recipient_kind, 'commercial');
  assert.equal(queued.owner_status, 'queued');
  assert.equal(queued.manager_status, 'queued');
  assert.equal(queued.briefing.main_objection, handoff.briefing.main_objection);
  assert.equal(db.writes.some((write) => write.table === 'messages'), false);
  assert.equal(db.rpcCalls.filter((call) => call.name === 'next_client_handoff_owner').length, 1);
  assert.equal(await whatsappCanStillReply(replyIdentity(db)), true,
    'Pending handoff must permit the current acknowledgement before a person takes over.');
});

await check('Repetição atualiza passagem e tarefa sem duplicar fila pendente', async () => {
  const db = createDb();
  const first = 'Tenho R$ 200.000 de entrada para o Flow.';
  await persist(db, financialTurn(first), first);
  const requestedAt = db.tables.leads[0].handoff_requested_at;
  const second = 'Minha proposta agora é R$ 210.000 de entrada para o Flow.';
  await persist(db, financialTurn(second), second);
  assert.equal(db.tables.lead_handoffs.length, 1);
  assert.equal(db.tables.lead_tasks.length, 1);
  assert.equal(db.tables.client_handoff_alert_jobs.length, 1);
  assert.equal(db.tables.leads[0].handoff_requested_at, requestedAt);
  assert.ok(db.tables.lead_handoffs[0].briefing.main_objection.includes(second));
  assert.equal(db.tables.leads[0].metadata.hybrid_last_decision.handoff_reused_assignment, true);
});

await check('Recusa de contato impede passagem/fila, mesmo perguntando entrada', async () => {
  const db = createDb(); const message = 'Quanto é a entrada do Flow? Sem corretor, não me encaminhe.';
  const result = financialTurn(message);
  assert.equal(result.handoff, false);
  const decision = await persist(db, result, message);
  assert.equal(decision.handoffRequired, false);
  assert.notEqual(db.tables.leads[0].stage, 'passagem_pendente');
  assert.equal(db.tables.lead_handoffs.length, 0);
  assert.equal(db.tables.client_handoff_alert_jobs.length, 0);
  assert.equal(db.tables.lead_tasks.some((task) => task.dedupe_key === 'handoff:pending'), false);
  assert.equal(db.rpcCalls.some((call) => call.name === 'next_client_handoff_owner'), false);
});

await check('Preço total isolado não gera passagem financeira', async () => {
  const db = createDb(); const message = 'Quanto custa o apartamento mais barato do Flow?';
  const result = turn();
  assert.equal(applyNaraFinancialHandoff(result, [{ role: 'user', content: message }]), false);
  const decision = await persist(db, result, message);
  assert.equal(decision.handoffRequired, false);
  assert.equal(db.tables.lead_handoffs.length, 0);
  assert.equal(db.tables.client_handoff_alert_jobs.length, 0);
});

await check('Configuração de alerta desligada preserva passagem, sem fingir fila enviada', async () => {
  const db = createDb({ enabled: false });
  db.tables.leads[0].owner_id = 'existing-owner-qa';
  const message = 'Quero avaliar a entrada para comprar o Flow.';
  await persist(db, financialTurn(message), message);
  assert.equal(db.tables.lead_handoffs.length, 1);
  assert.equal(db.tables.lead_handoffs[0].offered_to, 'existing-owner-qa');
  assert.equal(db.tables.client_handoff_alert_jobs.length, 0);
  assert.equal(db.rpcCalls.some((call) => call.name === 'next_client_handoff_owner'), false);
});

await check('Etapa agendado inventada pelo modelo não vira agendamento persistido', async () => {
  const db = createDb();
  const result = turn({ stage: 'agendado', classification: 'agendamento', score: 85 });
  await persist(db, result, 'Amanhã às 10h funciona.');
  assert.notEqual(db.tables.leads[0].stage, 'agendado');
  assert.equal(db.tables.lead_handoffs.length, 0);
});

await check('Agenda confirmada permite mensagem atual e bloqueia nova resposta automática', async () => {
  const db = createDb();
  const result = turn({ stage: 'agendado', classification: 'agendamento', score: 85,
    agenda_confirmed: true, next_action: 'Apresentação por vídeo registrada; confirmar acesso com o cliente.' });
  const decision = await persist(db, result, 'Amanhã às 10h funciona.');
  const updated = db.tables.leads[0];
  assert.equal(decision.stage, 'agendado');
  assert.equal(decision.ownerMode, 'ai');
  assert.equal(decision.aiEnabled, true);
  assert.equal(updated.stage, 'agendado');
  assert.equal(await whatsappCanStillReply(replyIdentity(db)), true,
    'The final confirmation must remain eligible for delivery.');
  assert.equal(aiCanReply(updated), false,
    'The agendado stage must prevent a new automatic turn.');
  assert.equal(db.tables.lead_handoffs.length, 1);
  assert.equal(db.tables.client_handoff_alert_jobs[0].owner_status, 'queued');
});

await check('Pausa, opt-out ou assunção humana ainda bloqueiam confirmação concorrente', async () => {
  for (const change of [
    { automation_paused: true }, { opt_out: true }, { owner_mode: 'human', ai_enabled: false },
  ]) {
    const db = createDb();
    const result = turn({ stage: 'agendado', classification: 'agendamento', score: 85, agenda_confirmed: true });
    await persist(db, result, 'Amanhã às 10h funciona.');
    Object.assign(db.tables.leads[0], change);
    assert.equal(await whatsappCanStillReply(replyIdentity(db)), false);
  }
});

await check('Falha ao atualizar lead interrompe antes de criar passagem/fila', async () => {
  const db = createDb({ fail: { table: 'leads', operation: 'update' } });
  const message = 'Quero fazer uma proposta para o Flow.';
  await assert.rejects(persist(db, financialTurn(message), message), (error) => error.code === 'QA_DB_ERROR');
  assert.equal(db.tables.lead_handoffs.length, 0);
  assert.equal(db.tables.client_handoff_alert_jobs.length, 0);
  assert.equal(db.tables.lead_tasks.length, 0);
});

await check('Falha ao gravar passagem não cria fila de alerta nem retorna sucesso', async () => {
  const db = createDb({ fail: { table: 'lead_handoffs', operation: 'insert' } });
  const message = 'Tenho R$ 200.000 de entrada.';
  await assert.rejects(persist(db, financialTurn(message), message), (error) => error.code === 'QA_DB_ERROR');
  assert.equal(db.tables.lead_handoffs.length, 0);
  assert.equal(db.tables.client_handoff_alert_jobs.length, 0);
});

console.log(`Passagem persistente: ${passed} verificações aprovadas. Fila simulada; nenhum alerta real enviado.`);
