import assert from 'node:assert/strict';
import { enforceNaraTriage, naraReplyWordCount } from '../src/lib/ai.ts';
import { postProcessNaraTurn } from '../src/lib/ai-v120.ts';
import { deriveHybridDecision, optOutSignal } from '../src/lib/hybrid.ts';
import { officeHours } from '../src/lib/nara-office-hours.ts';

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
assert.equal(optOutSignal('Para de me mandar mensagem'),true);
assert.equal(optOutSignal('Me tira da lista'),true);
assert.equal(deriveHybridDecision({lead,turn:turn(),lastUserMessage:'Me tira da lista'}).stage,'encerrado');
assert.deepEqual(officeHours('2026-09-26','08:00-18:00','08:00-18:00'),{open:480,close:1080});
assert.equal(officeHours('2026-09-27','08:00-18:00','08:00-18:00'),null);
console.log('Nara rodada 3: triagem, preços multilíngues, robô e opt-out validados.');
