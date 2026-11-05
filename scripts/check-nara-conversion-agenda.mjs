// No network, calendar, WhatsApp or real customer writes. Execute the production
// agenda function with an in-memory Supabase-shaped transport and conflict lookup.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import {
  agendaActionFromText,
  agendaModeFromConversation,
  confirmedAgendaReply,
  shouldHandleAgendaTurn,
} from '../src/lib/nara-agenda-intent.ts';
import { financialNegotiationIntent } from '../src/lib/nara-conversation-signals.ts';
import { applyNaraFinancialHandoff } from '../src/lib/nara-sales-handoff.ts';
import { naraReplyNeedsCommercialProtection, protectNaraCommercialReply } from '../src/lib/nara-commercial-guard.ts';
import { buildNaraOfferAuditRecords } from '../src/lib/nara-offer-log.ts';
import { isAssistedSaleSignal, isBrokerRoutingSignal, isPostSaleRoutingSignal, isSupplierRoutingSignal } from '../src/lib/nara-contact-routing.ts';
import { officeHours } from '../src/lib/nara-office-hours.ts';

const user = (content) => ({ role: 'user', content });
const assistant = (content) => ({ role: 'assistant', content });
let passed = 0;
async function check(title, run) {
  await run();
  passed += 1;
  console.log(`✓ ${title}`);
}

for (const message of [
  'Quero agendar uma videochamada.',
  'Podemos marcar uma apresentação online?',
  'Gostaria de uma chamada de vídeo.',
  'Prefiro conhecer por vídeo.',
  'Pode ser uma videochamada.',
  'Quero agendar uma visita presencial.',
  'Quero conhecer pessoalmente.',
  'Quero visitar o decorado.',
  'Não quero visita, prefiro uma videochamada.',
  'Quiero una videollamada.',
  'Can we schedule a video call?',
]) await check(`Agenda reconhece: ${message}`, () => assert.equal(agendaActionFromText(message), 'schedule'));

for (const message of [
  'Não quero agendar uma videochamada.',
  'Não quero agendar uma visita ao decorado.',
  'Não quero visitar o decorado.',
  'Videochamada não, só quero saber o preço.',
  'Quero conhecer os empreendimentos.',
  'Pode mandar um vídeo do prédio?',
  'Vou pensar na visita. Qual o tamanho do apartamento?',
  'Não quero cancelar minha visita.',
  'Não precisa remarcar.',
]) await check(`Não cria intenção indevida: ${message}`, () => assert.equal(agendaActionFromText(message), 'none'));

await check('Aceite curto após convite de vídeo continua a agenda', () => {
  assert.equal(shouldHandleAgendaTurn([assistant('Quer conhecer o Flow e a Bossa por videochamada?')], 'Sim'), true);
  assert.equal(agendaModeFromConversation([assistant('Quer conhecer o Flow e a Bossa por videochamada?')], 'Sim'), 'video');
});
await check('Aceite curto após oferta de material não agenda', () => {
  assert.equal(shouldHandleAgendaTurn([assistant('Quer que eu envie o vídeo da obra?')], 'Sim'), false);
});
await check('Data de mudança não é consentimento para agendar apresentação', () => {
  assert.equal(shouldHandleAgendaTurn([assistant('Qual dia pretende se mudar?')], 'Amanhã'), false);
});
await check('Resposta 15h após horários oferecidos continua a agenda', () => {
  const history = [user('Quero agendar uma videochamada.'), assistant('Tenho estes horários livres em 10/12/2026: 10:00, 12:00, 15:00. Qual você prefere?')];
  assert.equal(shouldHandleAgendaTurn(history, '15h'), true);
});
await check('Recusa do convite não agenda nem reutiliza horário mencionado', () => {
  assert.equal(shouldHandleAgendaTurn([assistant('Quer uma videochamada amanhã?')], 'Agora não, amanhã também não. Te chamo depois.'), false);
});
await check('Vídeo ou visita exige escolha; sim sozinho não escolhe', () => {
  const history = [assistant('Você prefere uma videochamada ou visita presencial?')];
  assert.equal(shouldHandleAgendaTurn(history, 'Sim'), true);
  assert.equal(agendaModeFromConversation(history, 'Sim'), null);
  assert.equal(agendaModeFromConversation(history, 'Vídeo'), 'video');
  assert.equal(agendaModeFromConversation(history, 'Presencial'), 'presencial');
});
await check('Última escolha supera modalidade antiga e material não muda modalidade', () => {
  const history = [user('Quero visitar o decorado.'), assistant('Qual dia você prefere para a visita?')];
  assert.equal(agendaModeFromConversation(history, 'Prefiro uma videochamada.'), 'video');
  const video = [...history, user('Prefiro uma videochamada.'), assistant('Qual dia você prefere para a videochamada?')];
  assert.equal(agendaModeFromConversation(video, 'Amanhã às 10h'), 'video');
  assert.equal(agendaModeFromConversation([user('Me mande um vídeo do prédio.')], 'Amanhã às 10h'), null);
});
await check('Uma visita virtual não vira visita presencial', () => {
  assert.equal(agendaModeFromConversation([], 'Quero uma visita por vídeo.'), 'video');
});
await check('Remarcação e cancelamento de vídeo são reconhecidos', () => {
  assert.equal(agendaActionFromText('Pode remarcar a videochamada para sexta?'), 'reschedule');
  assert.equal(agendaActionFromText('Quero cancelar a videochamada'), 'cancel');
});

const coreSource = await readFile(new URL('../src/lib/agenda-ai-core.ts', import.meta.url), 'utf8');
const coreCode = stripTypeScriptTypes(coreSource)
  .replace(/^import\s.*?;\s*$/gm, '')
  .replace(/export async function maybeScheduleAgendaFromAi/, 'async function maybeScheduleAgendaFromAi');
// Dependencies are injected deliberately; no Supabase client/provider is loaded.
const createScheduler = new Function('findAgendaConflicts', 'agendaActionFromText', 'agendaModeFromConversation',
  'shouldHandleAgendaTurn', 'financialNegotiationIntent', 'officeHours', `${coreCode}\nreturn maybeScheduleAgendaFromAi;`);

function fakeDb(history, options = {}) {
  const tables = {
    messages: history.map((message, i) => ({
      lead_id: 'lead-qa', direction: message.role === 'user' ? 'in' : 'out', body: message.content,
      created_at: new Date(Date.now() - (history.length - i) * 1000).toISOString(),
    })),
    memberships: options.noMembers ? [] : [{ organization_id: 'org-qa', user_id: 'sales-qa', role: 'comercial', created_at: '2020-01-01' }],
    agenda_events: [...(options.events ?? [])],
    lead_tasks: [],
  };
  const writes = [];
  function from(table) {
    let mode = 'select'; let payload; const filters = []; let sort; let cap;
    const query = {
      select() { return query; },
      insert(value) { mode = 'insert'; payload = value; return query; },
      update(value) { mode = 'update'; payload = value; return query; },
      eq(key, value) { filters.push((row) => row[key] === value); return query; },
      neq(key, value) { filters.push((row) => row[key] !== value); return query; },
      gte(key, value) { filters.push((row) => row[key] >= value); return query; },
      in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
      order(key, settings) { sort = { key, asc: settings.ascending }; return query; },
      limit(value) { cap = value; return query; },
      maybeSingle() { return Promise.resolve(run(true)); },
      single() { return Promise.resolve(run(true)); },
      then(resolve, reject) { return Promise.resolve(run(false)).then(resolve, reject); },
    };
    function run(single) {
      let rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
      if (mode === 'insert') {
        if (table === 'agenda_events' && options.insertError) return { data: null, error: options.insertError };
        if (table === 'agenda_events' && options.emptyCreatedEvent) return { data: null, error: null };
        const inserted = { id: `${table}-${tables[table].length + 1}`, status: 'scheduled', ...payload };
        tables[table].push(inserted); writes.push({ table, mode, payload: inserted }); rows = [inserted];
      } else if (mode === 'update') {
        rows.forEach((row) => Object.assign(row, payload)); writes.push({ table, mode, payload });
      }
      if (sort) rows.sort((a, b) => String(a[sort.key]).localeCompare(String(b[sort.key])) * (sort.asc ? 1 : -1));
      if (cap !== undefined) rows = rows.slice(0, cap);
      return { data: single ? rows[0] ?? null : rows, error: null };
    }
    return query;
  }
  return { from, tables, writes };
}

const future = new Date(Date.now() + 30 * 86400000);
while (future.getUTCDay() !== 1) future.setUTCDate(future.getUTCDate() + 1);
const date = `${String(future.getUTCDate()).padStart(2, '0')}/${String(future.getUTCMonth() + 1).padStart(2, '0')}/${future.getUTCFullYear()}`;
const lead = { id: 'lead-qa', organization_id: 'org-qa', owner_id: 'sales-qa', kind: 'cliente', name: 'Pessoa QA', metadata: {} };
async function runScenario(history, options = {}) {
  const db = fakeDb(history, options);
  const turn = { reply: 'Rascunho da IA não confirma nada.', next_action: '', summary: 'Teste sintético', handoff: false };
  const scheduler = createScheduler(
    async () => {
      if (options.conflictError) throw new Error('Simulação de falha da agenda conectada');
      return options.conflicts ?? [];
    }, agendaActionFromText, agendaModeFromConversation, shouldHandleAgendaTurn, financialNegotiationIntent, officeHours,
  );
  let result; let error;
  try {
    result = await scheduler({ admin: db, organizationId: 'org-qa', lead, turn,
      lastUserMessage: history.at(-1).content, officeAddress: options.officeAddress,
      weekdayHours: options.noHours ? undefined : '08:00-18:00', saturdayHours: '08:00-12:00' });
  } catch (cause) { error = cause; }
  return { result, error, db, turn };
}

await check('Core agenda vídeo sem endereço físico; cria evento vídeo e marca evidência', async () => {
  const { result, db, turn } = await runScenario([user(`Quero agendar uma videochamada em ${date} às 10h.`)]);
  assert.equal(result.status, 'created');
  assert.equal(result.meetingMode, 'video');
  assert.equal(result.location, null);
  assert.equal(db.tables.agenda_events[0].meeting_mode, 'video');
  assert.equal(db.tables.agenda_events[0].event_type, 'apresentacao');
  assert.equal(db.tables.lead_tasks.length, 0);
  assert.equal(turn.agenda_confirmed, true);
  assert.match(turn.next_action, /link de acesso/);
});
await check('Core pede data do vídeo após aceite, sem inventar evento', async () => {
  const { result, db, turn } = await runScenario([assistant('Quer conhecer o empreendimento por videochamada?'), user('Sim')]);
  assert.equal(result.status, 'needs_details');
  assert.match(result.message, /dia.*videochamada/);
  assert.equal(db.tables.agenda_events.length, 0);
  assert.equal(turn.agenda_confirmed, false);
});
await check('Aceitar vídeo não transforma prazo de mudança e expediente em horário escolhido', async () => {
  const { result, db, turn } = await runScenario([
    user(`Preciso me mudar em ${date} e trabalho até as 12h.`),
    assistant('Quer uma videochamada para conhecer o Flow?'),
    user('Sim'),
  ]);
  assert.equal(result.status, 'needs_details');
  assert.match(result.message, /Qual dia/);
  assert.equal(db.tables.agenda_events.length, 0);
  assert.equal(turn.agenda_confirmed, false);
});
await check('Data e hora escolhidas em turnos separados de agenda são preservadas', async () => {
  const { result, db } = await runScenario([
    user('Quero agendar uma videochamada.'),
    assistant('Qual dia você prefere para a videochamada?'),
    user(date),
    assistant(`Tenho estes horários livres em ${date}: 10:00, 12:00, 15:00. Qual você prefere?`),
    user('15h'),
  ]);
  assert.equal(result.status, 'created');
  assert.equal(db.tables.agenda_events[0].meeting_mode, 'video');
  assert.equal(new Date(result.startsAt).getUTCHours(), 18, '15h em Brasília');
  assert.equal(new Date(result.startsAt).getUTCDate(), future.getUTCDate());
});
await check('Prazo de entrega ou compra no mesmo pedido não vira compromisso', async () => {
  for (const context of [`Preciso da entrega em ${date}`, `Vou comprar em ${date}`]) {
    const { result, db, turn } = await runScenario([user(`${context}, trabalho até as 12h, quero agendar uma videochamada.`)]);
    assert.equal(result.status, 'needs_details');
    assert.match(result.message, /Qual dia/);
    assert.equal(db.tables.agenda_events.length, 0);
    assert.equal(turn.agenda_confirmed, false);
  }
});
await check('Core não escolhe formato após aceite de oferta ambígua', async () => {
  const { result, db } = await runScenario([assistant('Prefere videochamada ou visita presencial?'), user('Sim')]);
  assert.match(result.message, /videochamada.*visita presencial/);
  assert.equal(db.tables.agenda_events.length, 0);
});
await check('Presencial sem endereço exige humano; não cria compromisso', async () => {
  const { result, db, turn } = await runScenario([user(`Quero visitar o decorado em ${date} às 10h.`)]);
  assert.equal(result.status, 'needs_details');
  assert.equal(result.requiresHuman, true);
  assert.equal(db.tables.agenda_events.length, 0);
  assert.equal(db.tables.lead_tasks.length, 1);
  assert.equal(turn.agenda_confirmed, false);
});
await check('Presencial com endereço real preserva modalidade/local', async () => {
  const { result, db, turn } = await runScenario([user(`Quero visitar o decorado em ${date} às 10h.`)], { officeAddress: 'Endereço sintético QA' });
  assert.equal(result.status, 'created');
  assert.equal(result.meetingMode, 'presencial');
  assert.equal(db.tables.agenda_events[0].location, 'Endereço sintético QA');
  assert.equal(turn.agenda_confirmed, true);
});
await check('Mudança de presencial para vídeo não mantém endereço antigo', async () => {
  const { result, db } = await runScenario([user('Quero visitar o decorado.'), assistant('Qual dia você prefere para a visita?'), user(`Prefiro uma videochamada em ${date} às 10h.`)], { officeAddress: 'Endereço sintético QA' });
  assert.equal(result.meetingMode, 'video');
  assert.equal(db.tables.agenda_events[0].location, null);
});
await check('Conflito de horário não cria nem confirma evento', async () => {
  const { result, db, turn } = await runScenario([user(`Quero agendar uma videochamada em ${date} às 10h.`)], { conflicts: [{ id: 'busy-qa' }] });
  assert.equal(result.status, 'conflict');
  assert.equal(db.tables.agenda_events.length, 0);
  assert.equal(turn.agenda_confirmed, false);
});
await check('Falha do banco não retorna created ou confirmação', async () => {
  const { result, error, db, turn } = await runScenario([user(`Quero agendar uma videochamada em ${date} às 10h.`)], { insertError: { code: 'QA_ERROR', message: 'Falha simulada' } });
  assert.equal(result, undefined);
  assert.equal(error.code, 'QA_ERROR');
  assert.equal(db.tables.agenda_events.length, 0);
  assert.equal(turn.agenda_confirmed, false);
});
await check('Resposta vazia de insert exige humano, não confirmação', async () => {
  const { result, turn } = await runScenario([user(`Quero agendar uma videochamada em ${date} às 10h.`)], { emptyCreatedEvent: true });
  assert.equal(result.status, 'needs_details');
  assert.equal(result.requiresHuman, true);
  assert.equal(turn.agenda_confirmed, false);
});
await check('Sem responsável ou expediente: encaminha, não promete disponibilidade', async () => {
  for (const options of [{ noMembers: true }, { noHours: true }]) {
    const { result, db, turn } = await runScenario([user(`Quero agendar uma videochamada em ${date} às 10h.`)], options);
    assert.equal(result.status, 'needs_details');
    assert.equal(result.requiresHuman, true);
    assert.equal(db.tables.agenda_events.length, 0);
    assert.equal(turn.agenda_confirmed, false);
  }
});
await check('Falha da agenda externa não declara disponibilidade', async () => {
  const { result, error, db, turn } = await runScenario([user(`Quero agendar uma videochamada em ${date} às 10h.`)], { conflictError: true });
  assert.equal(result, undefined);
  assert.ok(error);
  assert.equal(db.tables.agenda_events.length, 0);
  assert.equal(turn.agenda_confirmed, false);
});
await check('Entrada com pedido de vídeo tem prioridade humana; nenhum evento é criado', async () => {
  const { result, db, turn } = await runScenario([user(`Quero agendar uma videochamada em ${date} às 10h e tenho 200 mil de entrada.`)]);
  assert.equal(result.status, 'none');
  assert.equal(db.writes.length, 0);
  assert.equal(turn.agenda_confirmed, false);
});
await check('Cancelar sem evento não cria um novo compromisso', async () => {
  const { result, db } = await runScenario([user('Quero cancelar minha videochamada.')]);
  assert.equal(result.status, 'needs_details');
  assert.equal(result.requiresHuman, true);
  assert.equal(db.tables.agenda_events.length, 0);
});

await check('Confirmação de vídeo não anuncia visita/mapa/link inventado', () => {
  const reply = confirmedAgendaReply({ startsAt: future.toISOString(), meetingMode: 'video', location: null });
  assert.match(reply, /Registrei sua videochamada/);
  assert.match(reply, /link de acesso ainda precisa ser confirmado/);
  assert.doesNotMatch(reply, /https?:\/\/|Sua visita ficou marcada|no escritorio da Bossa/i);
});
await check('Confirmação presencial usa exclusivamente local confirmado', () => {
  const reply = confirmedAgendaReply({ startsAt: future.toISOString(), meetingMode: 'presencial', location: 'Endereço sintético QA' });
  assert.match(reply, /Sua visita ficou marcada/);
  assert.match(reply, /Endereço sintético QA/);
  assert.match(reply, /google.com\/maps\/search/);
});
await check('Webhook usa resultado da agenda e preserva falha/handoff, sem confirmar pelo modelo', async () => {
  const webhook = await readFile(new URL('../src/lib/whatsapp/webhookProcessor.ts', import.meta.url), 'utf8');
  assert.match(webhook, /!financialNegotiationIntent\(lastUserMessage, history\).*shouldHandleAgendaTurn/);
  assert.match(webhook, /appointment\.status === 'created'[\s\S]{0,100}confirmedAgendaReply\(appointment\)/);
  assert.match(webhook, /turn\.agenda_confirmed = false/);
  assert.match(webhook, /turn\.handoff = appointment\.status === 'needs_details' && appointment\.requiresHuman === true/);
  assert.doesNotMatch(webhook, /turn\.reply = `Sua visita ficou marcada/);
  const refresh = webhook.indexOf('const checked = protectNaraCommercialReply(reply, history');
  const financialBoundary = webhook.indexOf('if (applyNaraFinancialHandoff(turn, history))', refresh);
  const audit = webhook.indexOf('let offerAuditIds:', refresh);
  const send = webhook.indexOf('result = await provider.sendText(', refresh);
  assert.ok(refresh >= 0 && financialBoundary > refresh && audit > financialBoundary && send > audit);
  assert.match(webhook.slice(refresh, audit), /lead\.kind === 'cliente' && !outsideBuyerProfile/);
  assert.match(webhook, /isAssistedSaleSignal\(item.content\).*isBrokerRoutingSignal\(item.content\)/);
  assert.match(webhook, /isPostSaleRoutingSignal\(item.content\).*isSupplierRoutingSignal\(item.content\)/);
});

await check('Gate real do webhook só permite agenda de comprador, preservando outras rotas', async () => {
  const webhook = await readFile(new URL('../src/lib/whatsapp/webhookProcessor.ts', import.meta.url), 'utf8');
  const profileGate = webhook.match(/const outsideBuyerProfile = history\.some\([\s\S]*?\);\n/)?.[0];
  const condition = webhook.match(/if \((lead\.kind === 'cliente' && !outsideBuyerProfile[^\n]+shouldHandleAgendaTurn\(history, lastUserMessage\))\) \{/)?.[1];
  assert.ok(profileGate && condition, 'Perfil deve ser verificado antes de chamar o serviço de agenda.');
  assert.ok(webhook.indexOf(profileGate) < webhook.indexOf('let agendaReply'));
  const allowed = new Function('history', 'lead', 'lastUserMessage', 'isAssistedSaleSignal',
    'isBrokerRoutingSignal', 'isPostSaleRoutingSignal', 'isSupplierRoutingSignal',
    'financialNegotiationIntent', 'shouldHandleAgendaTurn', `${profileGate}\nreturn ${condition};`);
  const evaluate = (history) => allowed(history, lead, history.at(-1).content,
    isAssistedSaleSignal, isBrokerRoutingSignal, isPostSaleRoutingSignal, isSupplierRoutingSignal,
    financialNegotiationIntent, shouldHandleAgendaTurn);
  for (const message of [
    'Sou fornecedor. Posso visitar a obra amanhã às 15h para apresentar esquadrias?',
    'Sou corretor. Quero visitar o decorado amanhã às 15h com meu cliente.',
    'Já comprei com vocês. Posso visitar minha unidade amanhã às 15h?',
    'Meu corretor me indicou. Quero visitar o decorado amanhã às 15h.',
  ]) {
    assert.equal(shouldHandleAgendaTurn([user(message)], message), true, message);
    assert.equal(evaluate([user(message)]), false, `Não pode sobrescrever rota humana: ${message}`);
  }
  assert.equal(evaluate([user('Sou fornecedor de esquadrias.'), assistant('Vou encaminhar para suprimentos.'),
    user('Quero visitar a obra amanhã às 15h.')]), false, 'Perfil anterior também protege a rota.');
  assert.equal(evaluate([user('Quero visitar o decorado do Flow amanhã às 15h.')]), true);
  assert.equal(evaluate([user('Quero agendar uma videochamada para conhecer o Alma.')]), true);
  assert.equal(evaluate([user('Não sou corretor. Quero visitar o decorado do Flow amanhã às 15h.')]), true);
});

await check('Passagem financeira sobrevive à última reconsulta de preço antes do envio', () => {
  const now = new Date().toISOString();
  const commercial = { status: 'ok', consulted_at: now, source_table: 'development_units', calls: [{
    name: 'consultar_apartamento', arguments: { empreendimento: 'Flow', unidade: '1601' },
    result: { empreendimento: 'Flow Aptos', empreendimento_id: 'flow-qa', unidade: '1601', unidade_id: 'unit-qa',
      valor: 1000000.20, entrada: 200000.20, parcela_media: 10000, quantidade_parcelas: 80,
      referencia_tabela: 'qa-only', preco_atualizado_em: now,
      validade_tabela: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      plano_pagamento: { status: 'complete', componentes: [
        { tipo: 'entrada', quantidade: 1, valor_unitario_centavos: 20000020, total_centavos: 20000020 },
        { tipo: 'mensal', quantidade: 80, valor_unitario_centavos: 1000000, total_centavos: 80000000 },
      ], total_composto_centavos: 100000020, diferenca_centavos: 0, indice_correcao: 'CUB', juros: '0,59% a.m.' },
    },
  }] };
  const history = [user('Quanto é a entrada da unidade 1601 do Flow?')];
  const turn = { reply: '', handoff: false, stage: 'ia', classification: 'morno', score: 40 };
  assert.equal(applyNaraFinancialHandoff(turn, history), true);
  assert.equal(naraReplyNeedsCommercialProtection(turn.reply, history), true);
  const guarded = protectNaraCommercialReply(turn.reply, history, commercial);
  assert.match(guarded.reply, /R\$/);
  // Same order as webhook: audit applies to the final reply, not the re-render.
  turn.reply = guarded.reply;
  applyNaraFinancialHandoff(turn, history);
  assert.equal(turn.handoff, true);
  assert.match(turn.reply, /Vou chamar nossa equipe comercial/);
  assert.doesNotMatch(turn.reply, /R\$|80\s*[x×]|200\.000|encaminhado|foi transferid/i);
  assert.deepEqual(buildNaraOfferAuditRecords(turn.reply, commercial), []);
});

await check('Recusa de contato continua respeitada depois da reconsulta final', () => {
  const history = [user('Quanto é a entrada? Sem corretor, não me encaminhe.')];
  const turn = { reply: 'Entrada de R$ 200.000.', handoff: true, stage: 'qualificado', classification: 'quente', score: 85 };
  applyNaraFinancialHandoff(turn, history);
  assert.equal(turn.handoff, false);
  assert.match(turn.reply, /sem te encaminhar/);
  assert.doesNotMatch(turn.reply, /R\$|Vou chamar/);
});

console.log(`Agenda de conversão: ${passed} verificações aprovadas; nenhuma chamada externa executada.`);
