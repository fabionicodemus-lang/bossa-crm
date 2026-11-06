// Contextual appointment guard and the legacy v121 wrapper. Every conversation
// is synthetic; the real functions run with network/calendar transports blocked.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { guardNaraAgendaContext, hasNaraAgendaConsent } from '../src/lib/nara-agenda-context.ts';
import { agendaActionFromText, confirmedAgendaReply } from '../src/lib/nara-agenda-intent.ts';
import { enforceNaraReplyGuardrails } from '../src/lib/ai.ts';

const user = (content) => ({ role: 'user', content });
const assistant = (content) => ({ role: 'assistant', content });
const history = (content) => [assistant('Olá! Sou a Nara, da Bossa.'), user(content)];
const trustHistory = history('A Bossa é boa mesmo ou só marketing? Tô comparando com um concorrente mais barato.');
const baseLead = { id: 'agenda-context-qa', organization_id: 'qa', kind: 'cliente',
  stage: 'qualificacao_ia', owner_mode: 'ai', ai_enabled: true, opt_out: false,
  automation_paused: false, metadata: {}, enterprise: 'Flow Aptos' };
const turn = (reply, overrides = {}) => ({ reply, classification: 'morno', score: 40,
  stage: 'ia', summary: 'Contexto sintético.', next_action: 'Responder à dúvida.', handoff: false,
  attachment_ids: [], extracted: { enterprise: '', purpose: '', typology: '', budget: '', deadline: '',
    decision_maker: '', company: '', creci: '', region: '', client_status: '' }, ...overrides });

let passed = 0;
async function check(title, work) { await work(); passed++; console.log(`✓ ${title}`); }
const originalFetch = globalThis.fetch;
let externalCalls = 0;
globalThis.fetch = async () => { externalCalls++; throw new Error('External transport blocked by the contextual agenda suite.'); };

const source = await readFile(new URL('../src/lib/ai-v121.ts', import.meta.url), 'utf8');
const executable = stripTypeScriptTypes(source)
  .replace(/^import\s.*?;\s*$/gm, '')
  .replace(/^export \* from.*?;\s*$/gm, '')
  .replace(/^export /gm, '');
const createLegacyWrapper = (scheduler = async () => ({ status: 'none' })) => new Function(
  'guardNaraAgendaContext', 'confirmedAgendaReply', 'maybeScheduleAgendaFromAi',
  `${executable}\nreturn { guardedReply, applyAgendaScheduling, SKIP_REASON };`,
)(guardNaraAgendaContext, confirmedAgendaReply, scheduler);
const { guardedReply } = createLegacyWrapper();

try {
  for (const message of [
    'Quero uma visita amanhã.', 'Gostaria de uma visita sábado.',
    'Please, can I have a video call tomorrow?', 'I would like a visit tomorrow.',
    'I want a meeting.', 'Quisiera una visita mañana.',
  ]) await check(`Pedido nominal explícito reconhecido pelo mesmo detector do core: ${message}`, () => {
    assert.equal(agendaActionFromText(message), 'schedule');
    assert.equal(hasNaraAgendaConsent(history(message)), true);
  });
  for (const message of [
    'Não quero uma visita amanhã.', 'Quero uma visita, mas agora não.',
    'Se eu disser que quero uma visita, como funciona?', 'Talvez queira uma visita no futuro.',
    "I don't want a video call.", 'I would like a visit, but not now.',
    'If I want a meeting, what happens?', 'Can I have the video of the building?',
    'I want to know if I can have a video call.', 'Quiero información, no una visita.',
  ]) await check(`Nova forma não cria consentimento hipotético/negado: ${message}`, () => {
    assert.equal(agendaActionFromText(message), 'none');
    assert.equal(hasNaraAgendaConsent(history(message)), false);
  });
  for (const reply of [
    'Você pode avaliar o histórico do Jazz e do Soul e conhecer a execução em uma visita agendada. Quer que eu te explique os diferenciais?',
    'Uma visita com horário marcado permite avaliar a distribuição com calma.',
    'Uma reunião confirmada precisa de responsável e link de acesso.',
    'Uma visita só fica confirmada após conferir a agenda.',
    'Quando a visita estiver confirmada, a equipe informará os detalhes.',
    'Você já tem uma visita marcada?',
    'Sua visita já está confirmada?',
    'Não confirmei a reunião. Posso continuar explicando o projeto.',
    'A visita ainda não está confirmada.',
    'Não posso dizer que sua visita está confirmada.',
    'Registrei seu pedido de visita.',
    'You can compare the floor plans during a scheduled visit.',
    'When your meeting is confirmed, I can share the details.',
    "Your meeting hasn't been confirmed yet.",
    'La cita todavía no está confirmada.',
    'Cuando su cita está confirmada, el equipo prepara los detalles.',
  ]) await check(`Convite/processo/pergunta/negação preservado: ${reply}`, async () => {
    const protectedReply = guardNaraAgendaContext(reply, trustHistory, { includeDeliveryClaims: true });
    assert.equal(protectedReply.changed, false);
    assert.equal(protectedReply.reply, reply);
    assert.equal(protectedReply.consented, false);
    const result = await enforceNaraReplyGuardrails(turn(reply), baseLead, trustHistory, {});
    assert.equal(result.reply, reply);
    assert.equal(result.next_action, 'Responder à dúvida.');
    assert.equal(result.handoff, false);
    const legacy = guardedReply(structuredClone(result), trustHistory);
    assert.equal(legacy.reply, reply, 'the legacy guard must not reintroduce the false positive');
  });

  for (const reply of [
    'Sua visita está confirmada para amanhã às 15h.',
    'Sua videochamada já está agendada para sábado.',
    'Visita marcada para amanhã.',
    'Seu horário está confirmado.',
    'Agendei sua visita.',
    'Já marquei a videochamada.',
    'Your meeting is confirmed for tomorrow.',
    'I have booked your video call.',
    'Su cita está confirmada para mañana.',
    'Confirmé la reunión para mañana.',
    'A visita não está confirmada, mas sua videochamada está confirmada.',
  ]) await check(`Afirmação sem evidência bloqueada sem inventar aceite: ${reply}`, async () => {
    const result = await enforceNaraReplyGuardrails(turn(reply), baseLead, trustHistory, {});
    assert.notEqual(result.reply, reply);
    assert.doesNotMatch(result.reply, /horário que você escolheu|preferred time|horario que elegiste|15h|amanhã|tomorrow|mañana/);
    assert.doesNotMatch(result.reply, /Vou verificar.*disponibilidade|conferir a Agenda/);
    assert.match(result.next_action, /não iniciar nem confirmar/);
    assert.notEqual(result.agenda_confirmed, true);
    assert.notEqual(result.stage, 'agendado');
    assert.equal(result.handoff, false);
    const again = await enforceNaraReplyGuardrails(structuredClone(result), baseLead, trustHistory, {});
    assert.deepEqual(again, result);
  });

  await check('Remove somente a frase falsa e preserva explicação, valor neutro e material permitido', async () => {
    const reply = 'Jazz e Soul já foram entregues. Sua visita está confirmada para amanhã. Acompanhar o andamento do Flow ajuda a comparar a execução.';
    const protectedReply = guardNaraAgendaContext(reply, trustHistory);
    assert.equal(protectedReply.reply, 'Jazz e Soul já foram entregues. Acompanhar o andamento do Flow ajuda a comparar a execução.');
    const output = guardedReply(turn(reply, { attachment_ids: ['approved-neutral-plan'] }), trustHistory);
    assert.equal(output.reply, protectedReply.reply);
    assert.deepEqual(output.attachment_ids, ['approved-neutral-plan']);
  });

  await check('Informação segura com decimal e URL não é fragmentada', () => {
    const reply = 'Confira a planta em https://bossa.example/flow.pdf. A área documentada é 117,7 m². Sua visita está confirmada.';
    const result = guardNaraAgendaContext(reply, trustHistory);
    assert.match(result.reply, /https:\/\/bossa\.example\/flow\.pdf/);
    assert.match(result.reply, /117,7 m²/);
    assert.doesNotMatch(result.reply, /Sua visita está confirmada/);
  });

  for (const [messages, expectedConsent] of [
    [history('Quero visitar o Flow sábado às 15h.'), true],
    [history('Quero uma videochamada amanhã às 10h.'), true],
    [[assistant('Quer conhecer o Flow por videochamada?'), user('Sim, pode ser.')], true],
    [[assistant('Quer conhecer o Flow por vídeo?'), user('Sim, pode ser.')], true],
    [[user('Quero visitar o Flow.'), assistant('Qual dia e horário prefere para a visita?'), user('Sábado às 15h.')], true],
    [[assistant('Qual dia pretende se mudar?'), user('Sábado às 15h.')], false],
    [[assistant('Quer que eu mande um vídeo da obra?'), user('Sim')], false],
    [[assistant('Quer visitar o Flow?'), user('Não quero visitar agora.')], false],
    [history('Quero cancelar minha visita.'), false],
    [history('Quero uma visita, mas não me passe para ninguém agora.'), false],
  ]) await check(`Consentimento contextual: ${messages.at(-1).content}`, () => {
    assert.equal(hasNaraAgendaConsent(messages), expectedConsent);
  });

  for (const [messages, reply, expected] of [
    [history('Quero uma visita amanhã às 15h.'), 'Sua visita está confirmada para amanhã às 15h.', /ainda não está confirmado/],
    [[assistant('Quer conhecer o Flow por videochamada?'), user('Sim, pode ser.')], 'Sua videochamada está confirmada.', /ainda não está confirmado/],
    [history('Please schedule a video call tomorrow at 3pm.'), 'Your meeting is confirmed for tomorrow.', /not confirmed yet/],
    [history('Quiero una videollamada mañana.'), 'Su cita está confirmada para mañana.', /no está confirmada/],
  ]) await check(`Consentimento não equivale a compromisso: ${messages.at(-1).content}`, async () => {
    const output = await enforceNaraReplyGuardrails(turn(reply), baseLead, messages, {});
    assert.match(output.reply, expected);
    assert.doesNotMatch(output.reply, /horário que você escolheu|preferred time|horario que elegiste|orçamento|renda|finalidade/);
    assert.match(output.next_action, /apenas o detalhe que faltar/);
    assert.equal(output.handoff, false);
    assert.notEqual(output.agenda_confirmed, true);
    assert.notEqual(output.stage, 'agendado');
  });

  await check('Rótulo de agendamento inventado não agenda uma dúvida de confiança', async () => {
    const safe = 'O histórico de Jazz e Soul e o andamento documentado são pontos concretos para comparar.';
    const output = await enforceNaraReplyGuardrails(turn(safe, { stage: 'agendado', classification: 'agendamento' }), baseLead, trustHistory, {});
    assert.equal(output.reply, safe);
    assert.equal(output.stage, 'ia');
    assert.notEqual(output.classification, 'agendamento');
    assert.match(output.next_action, /não iniciar nem confirmar/);
  });

  await check('Confirmação efetiva do sistema é preservada pelos dois caminhos', async () => {
    const confirmed = turn('Sua visita ficou marcada para sábado.', { agenda_confirmed: true, stage: 'agendado', classification: 'agendamento', score: 80 });
    const messages = history('Quero visitar sábado.');
    const output = await enforceNaraReplyGuardrails(confirmed, baseLead, messages, {});
    assert.equal(output.reply, confirmed.reply);
    assert.equal(output.agenda_confirmed, true);
    assert.equal(guardedReply(structuredClone(output), messages).reply, output.reply);
  });

  await check('Proposta mantém precedência sobre visita e não recebe condição aprovada', async () => {
    const messages = history('Quero uma videochamada e tenho 200 mil para a entrada do Flow.');
    const output = await enforceNaraReplyGuardrails(turn('Sua videochamada está confirmada.'), baseLead, messages, {});
    assert.equal(output.handoff, true);
    assert.match(output.reply, /equipe comercial/);
    assert.match(output.next_action, /Passagem comercial imediata/);
    assert.doesNotMatch(output.reply, /videochamada está confirmada|horário que você escolheu|aprovad/);
  });

  await check('Recusa de encaminhamento não é anulada pela proteção da agenda', async () => {
    const messages = history('Tenho 200 mil para entrada, mas não me passe para ninguém agora.');
    const output = await enforceNaraReplyGuardrails(turn('Sua visita está confirmada.', { handoff: true }), baseLead, messages, {});
    assert.equal(output.handoff, false);
    assert.match(output.reply, /sem te encaminhar/);
  });

  await check('Guarda textual não reativa humano/pausa/opt-out nem muda anexos válidos', () => {
    for (const blocked of [{ owner_mode: 'human' }, { automation_paused: true }, { opt_out: true }]) {
      const selectedLead = { ...baseLead, ...blocked };
      const before = structuredClone(selectedLead);
      guardNaraAgendaContext('Sua visita está confirmada.', trustHistory);
      assert.deepEqual(selectedLead, before);
    }
  });

  for (const [reply, changed] of [
    ['Enviei o convite para sua reunião.', true],
    ['O convite foi enviado.', true],
    ['O link foi enviado.', true],
    ['Acionei o time.', true],
    ['Não enviei o convite.', false],
    ['O convite não foi enviado.', false],
    ['Não acionei o time.', false],
  ]) await check(`Proteção operacional preservada com negação: ${reply}`, () => {
    const output = guardNaraAgendaContext(reply, trustHistory, { includeDeliveryClaims: true });
    assert.equal(output.changed, changed);
    if (!changed) assert.equal(output.reply, reply);
  });

  await check('Deduplicação, material e encerramento cortês do wrapper não foram removidos', () => {
    const repeated = 'Posso te explicar os ambientes e as características documentadas do Flow.';
    const deduped = guardedReply(turn(repeated), [assistant(repeated), user('Entendi, quero continuar.')]);
    assert.equal(deduped.__bossaAiSkipped, true);
    const material = guardedReply(turn('Enviei o PDF.'), history('Quero o PDF.'));
    assert.equal(material.handoff, true);
    assert.match(material.reply, /não tenho confirmação do envio/);
    const thanks = guardedReply(turn('Por nada.'), history('Obrigado!'));
    assert.equal(thanks.__bossaAiSkipped, true);
    const mixed = guardedReply(turn('Sua visita está confirmada. Enviei o PDF.'), history('Quero saber mais sobre o Flow.'));
    assert.doesNotMatch(mixed.reply, /Enviei o PDF|visita está confirmada/);
    assert.equal(mixed.handoff, true);
  });

  const dynamic = { values: { office_address: 'Endereço sintético QA', office_weekday_hours: '08:00-18:00', office_saturday_hours: '08:00-12:00' } };
  await check('Caminho legado passa endereço/expedientes runtime ao core sem inventar defaults', async () => {
    let captured;
    const wrapper = createLegacyWrapper(async (args) => { captured = args; return { status: 'none' }; });
    const output = turn('Vou verificar a agenda.');
    await wrapper.applyAgendaScheduling({}, baseLead, output, history('Quero visitar sábado.'), { dynamic });
    assert.equal(captured.officeAddress, dynamic.values.office_address);
    assert.equal(captured.weekdayHours, dynamic.values.office_weekday_hours);
    assert.equal(captured.saturdayHours, dynamic.values.office_saturday_hours);
    await wrapper.applyAgendaScheduling({}, baseLead, output, history('Quero visitar sábado.'), {});
    assert.equal(captured.officeAddress, undefined);
    assert.equal(captured.weekdayHours, undefined);
    assert.equal(captured.saturdayHours, undefined);
    assert.match(source, /applyAgendaScheduling\(admin, freshLead, guarded, recentHistory, contextual\)/);
  });

  await check('Falha operacional requiring human não vira pedido repetido de dia e hora', async () => {
    const wrapper = createLegacyWrapper(async () => ({ status: 'needs_details', requiresHuman: true, message: 'O responsável precisa verificar a conexão da agenda.' }));
    const output = await wrapper.applyAgendaScheduling({}, baseLead,
      turn('Agendado.', { agenda_confirmed: true, stage: 'agendado', classification: 'agendamento' }),
      history('Quero videochamada amanhã às 15h.'), { dynamic });
    assert.equal(output.handoff, true);
    assert.equal(output.agenda_confirmed, false);
    assert.equal(output.stage, 'ia');
    assert.equal(output.classification, 'quente');
    assert.match(output.next_action, /Encaminhar ao responsável/);
    assert.doesNotMatch(output.next_action, /Aguardar o contato informar/);
  });

  for (const status of ['needs_details', 'conflict', 'options', 'cancelled']) await check(`Resultado não confirmado permanece sem evidência: ${status}`, async () => {
    const wrapper = createLegacyWrapper(async () => ({ status, message: `Cenário ${status}.` }));
    const output = await wrapper.applyAgendaScheduling({}, baseLead,
      turn('Agendado.', { agenda_confirmed: true, stage: 'agendado', classification: 'agendamento' }), history('Quero visitar sábado.'), { dynamic });
    assert.equal(output.agenda_confirmed, false);
    assert.equal(output.handoff, false);
    assert.notEqual(output.stage, 'agendado');
    if (status === 'cancelled') assert.match(output.next_action, /Respeitar o cancelamento/);
  });

  const created = { status: 'created', eventId: 'event-qa', assignedTo: 'sales-qa',
    startsAt: '2026-11-10T18:00:00.000Z', endsAt: '2026-11-10T18:30:00.000Z', meetingMode: 'video', location: null };
  await check('Vídeo criado mantém modalidade, marcador real e link pendente', async () => {
    const wrapper = createLegacyWrapper(async () => created);
    const output = await wrapper.applyAgendaScheduling({}, baseLead, turn('Vou verificar.'), history('Quero videochamada terça às 15h.'), { dynamic });
    assert.equal(output.agenda_confirmed, true);
    assert.equal(output.stage, 'agendado');
    assert.equal(output.classification, 'agendamento');
    assert.equal(output.handoff, false);
    assert.ok(output.score >= 80);
    assert.match(output.reply, /videochamada/);
    assert.match(output.reply, /link de acesso ainda precisa ser confirmado/);
    assert.doesNotMatch(output.reply, /Sua visita|google.com\/maps/);
  });

  await check('Agendamento de corretor conserva classificação n4 e encaminhamento anterior', async () => {
    const wrapper = createLegacyWrapper(async () => created);
    const output = await wrapper.applyAgendaScheduling({}, { ...baseLead, kind: 'corretor' }, turn('Vou verificar.'), history('Quero visitar terça às 15h.'), { dynamic });
    assert.equal(output.stage, 'n4');
    assert.equal(output.classification, 'negociando');
    assert.equal(output.handoff, true);
    assert.match(output.reply, /Conferi a Agenda e ficou marcado/);
  });

  assert.equal(externalCalls, 0);
  console.log(`\nAgenda contextual: ${passed} verificações aprovadas; nenhuma chamada externa ou gravação real.`);
} finally {
  globalThis.fetch = originalFetch;
}
