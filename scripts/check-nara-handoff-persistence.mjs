// Execute the production persistence function with an in-memory transport.
// This verifies pending records/queues, NOT real delivery to a salesperson.
// No Supabase connection, provider, WhatsApp or external calendar is loaded.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { aiCanReply, deriveHybridDecision } from '../src/lib/hybrid.ts';
import { applyNaraFinancialHandoff } from '../src/lib/nara-sales-handoff.ts';
import { isAssistedSaleSignal, isBrokerRoutingSignal, isPostSaleRoutingSignal } from '../src/lib/nara-contact-routing.ts';
import { explicitHumanRequest, refusesHandoff } from '../src/lib/nara-conversation-signals.ts';
import { whatsappCanStillReply } from '../src/lib/whatsapp/aiTurnSafety.ts';
import { buildNaraHandoffBriefing, deliveredNaraMaterials, readNaraJourney, updateNaraJourney } from '../src/lib/nara-journey.ts';
import { tryRecordNaraFunnelEvent } from '../src/lib/nara-funnel-events.ts';

const source = await readFile(new URL('../src/lib/hybrid-server.ts', import.meta.url), 'utf8');
const executable = stripTypeScriptTypes(source)
  .replace(/^import\s.*?;\s*$/gm, '')
  .replace(/export async function applyHybridDecision/, 'async function applyHybridDecision');
const applyHybridDecision = new Function('deriveHybridDecision', 'isAssistedSaleSignal',
  'isBrokerRoutingSignal', 'isPostSaleRoutingSignal', 'explicitHumanRequest', 'refusesHandoff',
  'buildNaraHandoffBriefing', 'deliveredNaraMaterials', 'readNaraJourney', 'updateNaraJourney', 'tryRecordNaraFunnelEvent', `${executable}\nreturn applyHybridDecision;`)(
  deriveHybridDecision, isAssistedSaleSignal, isBrokerRoutingSignal, isPostSaleRoutingSignal, explicitHumanRequest, refusesHandoff,
  buildNaraHandoffBriefing, deliveredNaraMaterials, readNaraJourney, updateNaraJourney, tryRecordNaraFunnelEvent,
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
      is(key, value) { filters.push((row) => (row[key] ?? null) === value); return query; },
      like(key, pattern) {
        assert.equal(pattern, 'handoff:%');
        filters.push((row) => String(row[key] ?? '').startsWith('handoff:')); return query;
      },
      neq(key, value) { filters.push((row) => row[key] !== value); return query; },
      gt(key, value) { filters.push((row) => row[key] > value); return query; },
      gte(key, value) { filters.push((row) => row[key] >= value); return query; },
      order() { return query; },
      in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
      limit(value) { cap = value; return query; },
      maybeSingle() { return Promise.resolve(execute('maybe')); },
      single() { return Promise.resolve(execute('required')); },
      then(resolve, reject) { return Promise.resolve(execute(false)).then(resolve, reject); },
    };
    function execute(single) {
      if (options.beforeExecute) options.beforeExecute({ table, operation, payload, tables });
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
async function persist(db, result, message, sourceMessageId = sourceMessage.id) {
  const lead = structuredClone(db.tables.leads[0]);
  return applyHybridDecision({ admin: db, organizationId: lead.organization_id, lead,
    turn: result, lastUserMessage: message, sourceMessageId });
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
  assert.match(handoff.briefing.summary, /Pedido declarado, ainda não aprovado:/);
  assert.ok(handoff.briefing.latest_client_request.includes(message));
  assert.equal(handoff.briefing.declared_terms_are_approved, false);
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
  assert.ok(db.tables.lead_handoffs[0].briefing.latest_client_request.includes(second));
  assert.ok(db.tables.client_handoff_alert_jobs[0].briefing.latest_client_request.includes(second));
  assert.equal(db.tables.leads[0].metadata.hybrid_last_decision.handoff_reused_assignment, true);
});

await check('Briefing novo alcança só fila aguardando sem reenfileirar destinatário enviado/processando', async () => {
  for (const [ownerStatus, managerStatus] of [
    ['sent', 'queued'], ['queued', 'sent'], ['processing', 'queued'], ['queued', 'processing'],
    ['sent', 'sent'], ['processing', 'processing'], ['skipped', 'cancelled'],
  ]) {
    const db = createDb(); const first = 'Tenho 200 mil de entrada.';
    await persist(db, financialTurn(first), first);
    const job = db.tables.client_handoff_alert_jobs[0];
    Object.assign(job, { owner_status: ownerStatus, manager_status: managerStatus });
    const oldBriefing = structuredClone(job.briefing);
    const otherOrg = { ...structuredClone(job), id:'other-org-job', organization_id:'another-org' };
    const otherLead = { ...structuredClone(job), id:'other-lead-job', lead_id:'another-lead' };
    db.tables.client_handoff_alert_jobs.push(otherOrg, otherLead);
    const second = 'Agora minha proposta é 210 mil de entrada.';
    await persist(db, financialTurn(second), second, 'updated-request');
    assert.equal(db.tables.client_handoff_alert_jobs.length, 3);
    assert.equal(job.owner_status, ownerStatus); assert.equal(job.manager_status, managerStatus);
    if ([ownerStatus, managerStatus].includes('queued')) assert.equal(job.briefing.latest_client_request, second);
    else assert.deepEqual(job.briefing, oldBriefing);
    assert.deepEqual(otherOrg.briefing, oldBriefing); assert.deepEqual(otherLead.briefing, oldBriefing);
  }
});

await check('Briefing não muda se destinatários saírem da fila antes do update', async () => {
  const options = {}; const db = createDb(options); const first = 'Tenho 200 mil de entrada.';
  await persist(db, financialTurn(first), first);
  const job = db.tables.client_handoff_alert_jobs[0]; const oldBriefing = structuredClone(job.briefing);
  options.beforeExecute = ({ table, operation, payload }) => {
    if (table === 'client_handoff_alert_jobs' && operation === 'update' && payload.briefing) {
      job.owner_status = 'processing'; job.manager_status = 'sent'; options.beforeExecute = null;
    }
  };
  const second = 'Agora quero 210 mil de entrada.';
  await persist(db, financialTurn(second), second, 'updated-request');
  assert.equal(job.owner_status, 'processing'); assert.equal(job.manager_status, 'sent');
  assert.deepEqual(job.briefing, oldBriefing);
});

async function scheduleReturn(db) {
  const future = new Date(Date.now() + 7 * 86_400_000);
  const date = `${future.getUTCDate()}/${future.getUTCMonth() + 1}/${future.getUTCFullYear()}`;
  await persist(db, turn(), `Me procure em ${date} às 15h`, 'callback-request');
  assert.equal(db.tables.leads[0].stage, 'futuro');
  assert.ok(db.tables.leads[0].reactivation_at);
  return db.tables.lead_tasks.find((row) => row.dedupe_key === 'reactivation:agreed');
}

await check('Antecipação explícita sai de futuro e cancela só tarefas AI de retorno dessa organização/lead', async () => {
  const db = createDb(); const agreedTask = await scheduleReturn(db);
  const previousDue = db.tables.leads[0].reactivation_at;
  const legacyTask = { ...structuredClone(agreedTask), id:'legacy-return', dedupe_key:'reactivation:future' };
  const preserved = [
    { ...structuredClone(agreedTask), id:'human-return', assigned_mode:'human' },
    { ...structuredClone(agreedTask), id:'human-created', created_by_kind:'human' },
    { ...structuredClone(agreedTask), id:'completed-return', status:'completed' },
    { ...structuredClone(agreedTask), id:'another-org', organization_id:'another-org' },
    { ...structuredClone(agreedTask), id:'another-lead', lead_id:'another-lead' },
    { ...structuredClone(agreedTask), id:'general-task', dedupe_key:'general:followup' },
  ];
  const beforePreserved = structuredClone(preserved);
  db.tables.lead_tasks.push(legacyTask, ...preserved);
  const decision = await persist(db, turn(), 'Podemos falar agora', 'callback-resume');
  const lead = db.tables.leads[0];
  assert.equal(decision.stage, 'nutricao_ativa'); assert.equal(lead.stage, 'nutricao_ativa');
  assert.equal(lead.reactivation_at, null); assert.equal(lead.next_action_type, 'qualificar_nutrir');
  assert.notEqual(lead.next_action_due_at, previousDue);
  assert.equal(lead.metadata.nara_journey.agreed_return, null);
  assert.equal(lead.metadata.nara_journey.pending_reason, null);
  assert.equal(agreedTask.status, 'cancelled'); assert.equal(legacyTask.status, 'cancelled');
  assert.deepEqual(preserved, beforePreserved);
  await persist(db, turn(), 'Podemos falar agora', 'callback-resume');
  assert.equal(db.tables.lead_tasks.filter((row) => row.dedupe_key === 'ai:nutricao_ativa').length, 1);
  assert.equal(db.tables.leads[0].reactivation_at, null);
});

await check('Novo pedido humano agora cancela retorno antigo sem substituir a prioridade do handoff', async () => {
  const db = createDb(); const agreedTask = await scheduleReturn(db);
  const decision = await persist(db, turn({ handoff:true }), 'Quero falar com um consultor agora', 'human-now');
  const lead = db.tables.leads[0];
  assert.equal(decision.handoffRequired, true); assert.equal(lead.stage, 'passagem_pendente');
  assert.equal(lead.reactivation_at, null); assert.equal(agreedTask.status, 'cancelled');
  assert.equal(lead.metadata.nara_journey.agreed_return, null);
  assert.equal(lead.metadata.nara_journey.pending_reason.code, 'awaiting_human');
  assert.equal(db.tables.lead_handoffs.length, 1);
  assert.equal(db.tables.lead_tasks.find((row) => row.dedupe_key === 'handoff:pending').status, 'pending');
});

await check('Falha ao cancelar tarefa de retorno preserva acordo e retry termina a transição', async () => {
  const options = {}; const db = createDb(options); const agreedTask = await scheduleReturn(db);
  const originalAgreement = structuredClone(db.tables.leads[0].metadata.nara_journey.agreed_return);
  options.fail = { table:'lead_tasks', operation:'update' };
  await assert.rejects(persist(db, turn(), 'Podemos falar agora', 'callback-resume'), (error) => error.code === 'QA_DB_ERROR');
  assert.equal(db.tables.leads[0].stage, 'futuro');
  assert.deepEqual(db.tables.leads[0].metadata.nara_journey.agreed_return, originalAgreement);
  assert.equal(agreedTask.status, 'pending');
  options.fail = null;
  await persist(db, turn(), 'Podemos falar agora', 'callback-resume');
  assert.equal(db.tables.leads[0].stage, 'nutricao_ativa'); assert.equal(agreedTask.status, 'cancelled');
});

await check('Falha após limpeza de retorno permite retry sem recriar tarefa cancelada', async () => {
  const options = {}; const db = createDb(options); const agreedTask = await scheduleReturn(db);
  options.fail = { table:'leads', operation:'update' };
  await assert.rejects(persist(db, turn(), 'Podemos falar agora', 'callback-resume'), (error) => error.code === 'QA_DB_ERROR');
  assert.equal(db.tables.leads[0].stage, 'futuro');
  assert.ok(db.tables.leads[0].metadata.nara_journey.agreed_return);
  assert.equal(agreedTask.status, 'cancelled');
  options.fail = null;
  await persist(db, turn(), 'Podemos falar agora', 'callback-resume');
  assert.equal(db.tables.leads[0].stage, 'nutricao_ativa');
  assert.equal(db.tables.lead_tasks.filter((row) => row.dedupe_key === 'reactivation:agreed').length, 1);
  assert.equal(agreedTask.status, 'cancelled');
});

await check('Antecipação de retorno não reativa AI se houver assunção humana concorrente', async () => {
  const options = {}; const db = createDb(options); await scheduleReturn(db);
  const humanTask = { id:'human-current',organization_id:baseLead.organization_id,lead_id:baseLead.id,
    status:'pending',created_by_kind:'human',assigned_mode:'human',dedupe_key:'human:followup' };
  db.tables.lead_tasks.push(humanTask);
  options.beforeExecute = ({ table, operation, payload }) => {
    if (table === 'leads' && operation === 'update' && payload.stage === 'nutricao_ativa') {
      Object.assign(db.tables.leads[0], {stage:'humano_ativo',owner_mode:'human',ai_enabled:false,
        handoff_accepted_at:new Date().toISOString()});
      options.beforeExecute = null;
    }
  };
  await assert.rejects(persist(db, turn(), 'Podemos falar agora', 'callback-resume'), /atendimento mudou/);
  assert.equal(db.tables.leads[0].owner_mode, 'human'); assert.equal(db.tables.leads[0].ai_enabled, false);
  assert.equal(db.tables.leads[0].stage, 'humano_ativo'); assert.equal(humanTask.status, 'pending');
});

await check('Lead futuro sem acordo cancelado mantém comportamento legado e tarefa existente', async () => {
  const db = createDb();
  const dueAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  Object.assign(db.tables.leads[0], {stage:'futuro',reactivation_at:dueAt});
  const originalTask = {id:'legacy-future',organization_id:baseLead.organization_id,lead_id:baseLead.id,
    status:'pending',created_by_kind:'ai',assigned_mode:'ai',dedupe_key:'reactivation:future',due_at:dueAt};
  db.tables.lead_tasks.push(originalTask);
  await persist(db, turn(), 'Obrigado pela informação', 'legacy-thanks');
  assert.equal(db.tables.leads[0].stage, 'futuro'); assert.equal(db.tables.leads[0].reactivation_at, dueAt);
  assert.equal(originalTask.status, 'pending');
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

await check('Passagem pendente seguida de recusa cancela somente pendências desse contato', async () => {
  const db = createDb(); const initial = 'Tenho 200 mil de entrada para comprar o Flow.';
  await persist(db, financialTurn(initial), initial);
  assert.equal(aiCanReply(db.tables.leads[0]), true, 'Nara still handles replies while the handoff is pending.');
  const generalTask = { id: 'general-qa', organization_id: baseLead.organization_id, lead_id: baseLead.id,
    status: 'pending', dedupe_key: 'ai:qualificacao_ia' };
  const unrelated = { id: 'other-qa', organization_id: 'other-org', lead_id: baseLead.id,
    status: 'pending', dedupe_key: 'handoff:pending' };
  db.tables.lead_tasks.push(generalTask, unrelated);
  const otherHandoff = { id: 'other-handoff', organization_id: 'other-org', lead_id: baseLead.id, status: 'pending' };
  db.tables.lead_handoffs.push(otherHandoff);
  const refused = 'Quanto seria a entrada? Não me encaminhe agora, prefiro continuar por mensagem.';
  const decision = await persist(db, financialTurn(refused), refused);
  assert.equal(decision.handoffRequired, false);
  assert.notEqual(db.tables.leads[0].stage, 'passagem_pendente');
  assert.equal(db.tables.leads[0].handoff_requested_at, null);
  assert.equal(db.tables.leads[0].metadata.nara_handoff_revocation_pending, false);
  assert.equal(db.tables.lead_handoffs[0].status, 'cancelled');
  assert.equal(db.tables.lead_tasks[0].status, 'cancelled');
  assert.equal(db.tables.client_handoff_alert_jobs[0].owner_status, 'cancelled');
  assert.equal(db.tables.client_handoff_alert_jobs[0].manager_status, 'cancelled');
  assert.equal(generalTask.status, 'pending');
  assert.equal(unrelated.status, 'pending');
  assert.equal(otherHandoff.status, 'pending');
  const beforeCounts = [db.tables.lead_handoffs.length, db.tables.client_handoff_alert_jobs.length];
  await persist(db, financialTurn(refused), refused);
  assert.deepEqual([db.tables.lead_handoffs.length, db.tables.client_handoff_alert_jobs.length], beforeCounts);
  assert.equal(db.tables.lead_handoffs[0].status, 'cancelled');
});

await check('Revogação preserva destinatário já enviado e cancela só a fila ainda aguardando', async () => {
  for (const sentField of ['owner_status', 'manager_status']) {
    const db = createDb(); const initial = 'Quero avaliar a entrada.';
    await persist(db, financialTurn(initial), initial);
    const job = db.tables.client_handoff_alert_jobs[0]; job[sentField] = 'sent';
    const otherField = sentField === 'owner_status' ? 'manager_status' : 'owner_status';
    const refused = 'Qual a entrada? Sem atendimento humano por enquanto.';
    await persist(db, financialTurn(refused), refused);
    assert.equal(job[sentField], 'sent');
    assert.equal(job[otherField], 'cancelled');
  }
});

await check('Humano já ativo e assunção concorrente não são reativados nem têm pendências canceladas', async () => {
  for (const stale of [false, true]) {
    const db = createDb(); const initial = 'Tenho 200 mil de entrada.';
    await persist(db, financialTurn(initial), initial);
    const snapshot = structuredClone(db.tables.leads[0]);
    Object.assign(db.tables.leads[0], { stage: 'humano_ativo', owner_mode: 'human', ai_enabled: false,
      handoff_accepted_at: new Date().toISOString() });
    db.tables.lead_handoffs[0].status = 'accepted';
    const refused = 'Quero entender entrada, mas não me passe para ninguém agora.';
    if (stale) await applyHybridDecision({ admin: db, organizationId: baseLead.organization_id,
      lead: snapshot, turn: financialTurn(refused), lastUserMessage: refused });
    else await persist(db, financialTurn(refused), refused);
    assert.equal(db.tables.leads[0].owner_mode, 'human');
    assert.equal(db.tables.leads[0].ai_enabled, false);
    assert.equal(db.tables.lead_handoffs[0].status, 'accepted');
    assert.equal(db.tables.lead_tasks[0].status, 'pending');
    assert.equal(db.tables.client_handoff_alert_jobs[0].owner_status, 'queued');
  }
});

await check('CAS impede cancelamento se humano assumir entre releitura e update', async () => {
  const options = {}; const db = createDb(options); const initial = 'Quero tratar da entrada.';
  await persist(db, financialTurn(initial), initial);
  options.beforeExecute = ({ table, operation, payload, tables }) => {
    if (table === 'leads' && operation === 'update' && payload.metadata?.nara_handoff_revocation_pending) {
      Object.assign(tables.leads[0], { stage: 'humano_ativo', owner_mode: 'human', ai_enabled: false,
        handoff_accepted_at: new Date().toISOString() });
      tables.lead_handoffs[0].status = 'accepted';
      options.beforeExecute = null;
    }
  };
  const refused = 'Quanto é a entrada? Não me encaminhe agora.';
  await assert.rejects(persist(db, financialTurn(refused), refused), /atendimento mudou/);
  assert.equal(db.tables.leads[0].owner_mode, 'human');
  assert.equal(db.tables.leads[0].ai_enabled, false);
  assert.equal(db.tables.lead_handoffs[0].status, 'accepted');
  assert.equal(db.tables.lead_tasks[0].status, 'pending');
  assert.equal(db.tables.client_handoff_alert_jobs[0].owner_status, 'queued');
});

await check('Erros na limpeza são propagados e retry conclui sem duplicar ou apagar histórico enviado', async () => {
  for (const failedTable of ['lead_handoffs', 'lead_tasks', 'client_handoff_alert_jobs']) {
    const options = {}; const db = createDb(options); const initial = 'Quero avaliar a entrada.';
    await persist(db, financialTurn(initial), initial);
    options.fail = { table: failedTable, operation: 'update' };
    const refused = 'Quanto é a entrada? Não quero atendimento humano.';
    await assert.rejects(persist(db, financialTurn(refused), refused), (error) => error.code === 'QA_DB_ERROR');
    assert.equal(db.tables.leads[0].metadata.nara_handoff_revocation_pending, true);
    options.fail = null;
    await persist(db, financialTurn(refused), refused);
    assert.equal(db.tables.leads[0].metadata.nara_handoff_revocation_pending, false);
    assert.equal(db.tables.lead_handoffs.length, 1);
    assert.equal(db.tables.lead_handoffs[0].status, 'cancelled');
    assert.equal(db.tables.client_handoff_alert_jobs.length, 1);
    assert.equal(db.tables.client_handoff_alert_jobs[0].owner_status, 'cancelled');
  }
});

await check('Pedido humano positivo após recusa não revoga a passagem', async () => {
  const db = createDb(); const initial = 'Tenho entrada para comprar o Flow.';
  await persist(db, financialTurn(initial), initial);
  const message = 'Não queria atendimento humano antes, mas agora quero falar com alguém sobre a entrada.';
  const decision = await persist(db, financialTurn(message), message);
  assert.equal(decision.handoffRequired, true);
  assert.equal(db.tables.lead_handoffs[0].status, 'pending');
  assert.equal(db.tables.client_handoff_alert_jobs[0].owner_status, 'queued');
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
