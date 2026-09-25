import assert from 'node:assert/strict';
import { enforceNaraTriage, naraReplyWordCount, truncateNaraReplyToWordLimit } from '../src/lib/ai.ts';
import { postProcessNaraTurn } from '../src/lib/ai-v120.ts';
import { deriveHybridDecision, optOutSignal } from '../src/lib/hybrid.ts';
import { officeHours } from '../src/lib/nara-office-hours.ts';
import { isPostSaleRoutingSignal } from '../src/lib/nara-contact-routing.ts';
import { agendaActionFromText, appendAgendaMessageToReply, hasNonAgendaQuestion, shouldHandleAgendaTurn } from '../src/lib/agenda-ai-core.ts';
import { readFile } from 'node:fs/promises';

const lead = { id: 'test', kind: 'cliente', name: 'Fábio', stage: 'novo_triagem', owner_mode: 'ai', ai_enabled: true, metadata: {} };
function turn(reply = 'Para eu te direcionar certinho, você está buscando um imóvel para comprar ou precisa falar com a Bossa sobre outro assunto?') {
  return { reply, classification: 'morno', score: 45, stage: 'ia', summary: '', next_action: '', handoff: false,
    attachment_ids: [], extracted: { enterprise: '', purpose: '', typology: '', budget: '', deadline: '', decision_maker: '', company: '', creci: '', region: '', client_status: '' } };
}
for (const message of ['Quero conhecer o decorado do Flow, sábado de manhã', 'valor?', 'Qual o desconto à vista?', 'Hi, prices in USD?', 'Hola, vi el anuncio del Alma. ¿Cuánto cuesta en dólares?']) {
  const result = enforceNaraTriage(turn(), lead, [{role:'user',content:message}], {});
  assert.doesNotMatch(result.reply, /comprar ou.*outro assunto/i, message);
}
const commercial = { calls: [
  { name: 'faixa_empreendimento', result: { empreendimento: 'Flow Aptos', valor_minimo: 986590 } },
  { name: 'faixa_empreendimento', result: { empreendimento: 'Alma Seahouses', valor_minimo: 1120000 } },
] };
const foreign = { fx: { brl_per_currency: 5.48 }, conversions: [
  { development: 'Flow Aptos', brl: 986590, foreign: 180034.67, currency: 'USD' },
  { development: 'Alma Seahouses', brl: 1120000, foreign: 204379.56, currency: 'USD' },
] };
const english = postProcessNaraTurn(turn(), [{role:'user',content:"Hi, I'm Mike from Miami, prices in USD?"}], { commercial, foreign });
assert.match(english.reply, /^Hi, Mike! I'm Nara from Bossa\./);
assert.match(english.reply, /Flow Aptos.*R\$.*USD|Flow Aptos.*R\$.*US\$/);
assert.doesNotMatch(english.reply, /Oi|Aqui é/i);
const spanish = postProcessNaraTurn(turn(), [{role:'user',content:'Hola, soy Matías de Chile. ¿Puedo comprar desde Chile? ¿Cuánto cuesta en dólares?'}], { commercial, foreign });
assert.match(spanish.reply, /firma electrónica/);
assert.match(spanish.reply, /Flow Aptos.*R\$/);
assert.doesNotMatch(spanish.reply, /Aqui é|preços/i);
assert.ok(naraReplyWordCount(spanish.reply) <= 45);
const robot = postProcessNaraTurn(turn(), [{role:'user',content:'Você é robô?'}]);
assert.equal(robot.handoff, false);
assert.equal(deriveHybridDecision({lead,turn:robot,lastUserMessage:'Você é robô?'}).handoffRequired,false);
for (const message of [
  'Por favor não me mande mais mensagens',
  'Me tira da lista',
  'Não quero receber mais mensagens',
  'Pare de me mandar mensagem',
  'STOP',
]) assert.equal(optOutSignal(message), true, `deveria ser opt-out: ${message}`);

for (const message of [
  'Não quero receber ligação, prefiro por aqui',
  'Não quero nada muito caro, tem algo mais em conta?',
  'Para de mandar áudio, pode ser por texto?',
  'Não quero receber o contrato por email, pode ser impresso?',
]) assert.equal(optOutSignal(message), false, `não deveria ser opt-out: ${message}`);

assert.equal(deriveHybridDecision({lead,turn:turn(),lastUserMessage:'Me tira da lista'}).stage,'encerrado');

for (const message of [
  'Como está o andamento da obra do Alma?',
  'Quero saber do andamento da obra, estou pensando em comprar',
  'Não sou cliente, quero comprar no Flow',
]) assert.equal(isPostSaleRoutingSignal(message), false, `não deveria ir ao pós-venda: ${message}`);

for (const message of [
  'Já comprei no Flow e queria saber da entrega da minha unidade',
  'Preciso da segunda via do boleto',
  'Quero falar com o pós-venda',
]) assert.equal(isPostSaleRoutingSignal(message), true, `deveria ir ao pós-venda: ${message}`);

const hybridServerSource = await readFile(new URL('../src/lib/hybrid-server.ts', import.meta.url), 'utf8');
const aiSource = await readFile(new URL('../src/lib/ai.ts', import.meta.url), 'utf8');
assert.match(hybridServerSource, /isPostSaleRoutingSignal\(args\.lastUserMessage\)/);
assert.match(aiSource, /userMessages\.some\(isPostSaleRoutingSignal\)/);

const condo = postProcessNaraTurn(turn('O condomínio depende da unidade e ainda precisa ser confirmado.'), [{role:'user',content:'Qual o valor do condomínio?'}], { commercial });
assert.doesNotMatch(condo.reply, /Flow Aptos.*R\$/);
const iptu = postProcessNaraTurn(turn('O IPTU precisa ser confirmado para a unidade escolhida.'), [{role:'user',content:'Qual o valor do IPTU?'}], { commercial });
assert.doesNotMatch(iptu.reply, /Flow Aptos.*R\$/);
const flowPrice = postProcessNaraTurn(turn(), [{role:'user',content:'Quanto custa o Flow?'}], { commercial });
assert.match(flowPrice.reply, /Flow Aptos.*R\$/);
assert.match(flowPrice.reply, /Qual deles te interessa mais\?/);
const englishPrice = postProcessNaraTurn(turn(), [{role:'user',content:'How much are the apartments?'}], { commercial });
assert.match(englishPrice.reply, /Flow Aptos.*R\$/);
assert.match(englishPrice.reply, /Which one interests you most\?/);

const visitMarked = [
  { role: 'user', content: 'Quero visitar o decorado sexta às 10h' },
  { role: 'assistant', content: 'Sua visita ficou marcada para sexta às 10h no escritório da Bossa.' },
];
assert.equal(shouldHandleAgendaTurn(visitMarked, 'obrigado!'), false);
assert.equal(shouldHandleAgendaTurn(visitMarked, 'Qual o valor do condomínio?'), false);
assert.equal(shouldHandleAgendaTurn(visitMarked, 'quero remarcar para segunda às 15h'), true);
assert.equal(agendaActionFromText('quero remarcar para segunda às 15h'), 'reschedule');
assert.equal(shouldHandleAgendaTurn(visitMarked, 'Vou pensar na visita. Qual o tamanho do apartamento?'), false);

const noAddressStart = [{ role: 'user', content: 'quero visitar o decorado' }];
assert.equal(shouldHandleAgendaTurn(noAddressStart, 'quero visitar o decorado'), true);
const afterAddressNotice = [
  ...noAddressStart,
  { role: 'assistant', content: 'Vou pedir ao time para confirmar o endereço do escritório antes de marcar sua visita.' },
  { role: 'user', content: 'Qual o tamanho do apartamento?' },
];
assert.equal(shouldHandleAgendaTurn(afterAddressNotice, 'Qual o tamanho do apartamento?'), false);

const mixedVisitQuestion = 'Quero agendar uma visita. Qual o tamanho do apartamento?';
assert.equal(hasNonAgendaQuestion(mixedVisitQuestion), true);
const combinedAgenda = appendAgendaMessageToReply(
  'O apartamento tem 73 m² e três suítes. Posso te mostrar as opções disponíveis?',
  'Qual dia você prefere para a visita?',
);
assert.match(combinedAgenda, /73 m²/);
assert.match(combinedAgenda, /Qual dia você prefere para a visita\?/);
assert.ok(naraReplyWordCount(combinedAgenda) <= 45);

const longReply = [
  'Esta primeira frase tem palavras suficientes para explicar o ponto principal com clareza sem interromper a ideia antes do final.',
  'Esta segunda frase acrescenta muitos detalhes desnecessários apenas para ultrapassar com folga o limite máximo de quarenta e cinco palavras permitido pela Nara.',
  'Qual opção faz mais sentido para você agora?',
].join(' ');
assert.ok(naraReplyWordCount(longReply) > 45);
const shortened = truncateNaraReplyToWordLimit(longReply);
assert.ok(naraReplyWordCount(shortened) <= 45);
assert.match(shortened, /\?$/);
assert.match(shortened, /Qual opção faz mais sentido para você agora\?/);

assert.deepEqual(officeHours('2026-09-26','08:00-18:00','08:00-18:00'),{open:480,close:1080});
assert.equal(officeHours('2026-09-27','08:00-18:00','08:00-18:00'),null);
console.log('Nara rodada 3: opt-out, pós-venda, agenda, preços e corte de 45 palavras validados.');
