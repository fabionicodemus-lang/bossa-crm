// Regression checks distilled from 15 REAL simulator conversations on 04/11/2026.
// No OpenAI, Supabase network requests, CRM writes or WhatsApp messages.
import assert from 'node:assert/strict';
import { postProcessNaraTurn } from '../src/lib/ai-v120.ts';
import { enforceNaraTriage, ensureFirstTurnIntroduction, enforceNaraReplyGuardrails } from '../src/lib/ai.ts';
import { deriveHybridDecision } from '../src/lib/hybrid.ts';
import { purchaseIntent } from '../src/lib/nara-conversation-signals.ts';
import { isSupplierRoutingSignal } from '../src/lib/nara-contact-routing.ts';
import { isNaraAlternativePaymentProposal, protectNaraCommercialReply } from '../src/lib/nara-commercial-guard.ts';
import { loadNaraCommercialTurnContext } from '../src/lib/nara-unit-queries.ts';
import { naraConversationLanguage } from '../src/lib/nara-language.ts';

const u = (content) => ({ role: 'user', content });
const a = (content) => ({ role: 'assistant', content });
const lead = {
  kind: 'cliente', id: 'synthetic-15', organization_id: 'synthetic-org',
  name: 'Cliente fictício', metadata: {}, stage: 'ia', owner_mode: 'ai',
  ai_enabled: true, opt_out: false, automation_paused: false, enterprise: null,
};
function turn(reply, overrides = {}) {
  return {
    reply, classification: 'morno', score: 40, stage: 'ia', summary: '',
    next_action: 'Continuar atendimento.', handoff: false, attachment_ids: [],
    extracted: { enterprise:'', purpose:'', typology:'', budget:'', deadline:'', decision_maker:'', company:'', creci:'', region:'', client_status:'' },
    ...overrides,
  };
}
function baseCommercial(calls) {
  return { status: 'ok', consulted_at: new Date().toISOString(), source_table: 'development_units', calls, source_text: 'Dados sintéticos estruturados' };
}
const offer = (empreendimento, unidade, valor) => ({ empreendimento, unidade, valor, moeda:'BRL', andar:14, tipologia:'Teste', entrada:valor/5 });
const flowUnit = baseCommercial([{ name:'consultar_apartamento', arguments:{empreendimento:'Flow',unidade:'1403'}, result:offer('Flow Aptos','1403',1369861.25) }]);
const flowRange = baseCommercial([{ name:'faixa_empreendimento', arguments:{empreendimento:'Flow'}, result:{empreendimento:'Flow Aptos',valor_minimo:986590,valor_maximo:1560000,entrada_minima:180000,qtd_disponiveis:14} }]);
const almaRange = baseCommercial([{ name:'faixa_empreendimento', arguments:{empreendimento:'Alma'}, result:{empreendimento:'Alma Seahouses',valor_minimo:1285350.85,valor_maximo:2565800.5,entrada_minima:192000,qtd_disponiveis:28} }]);
const almaOffers = baseCommercial([{ name:'buscar_apartamentos', arguments:{empreendimento:'Alma'}, result:[
  offer('Alma Seahouses','1002',1285350.85),
  offer('Alma Seahouses','1102',1307644.6),
  offer('Alma Seahouses','701',1333249.36),
] }]);
const results = [];
async function check(id, name, work) {
  await work();
  results.push(id);
  console.log('✓ ' + id + ' ' + name);
}

await check('01','Pesquisa não vira compra nem encaminhamento', async () => {
  const message = 'Oi, estou só pesquisando. Não sei se quero comprar ainda.';
  assert.equal(purchaseIntent(message),false);
  const result = deriveHybridDecision({ lead, turn:turn('Fique à vontade.',{classification:'frio',score:15}), lastUserMessage:message });
  assert.equal(result.handoffRequired,false);
  assert.notEqual(result.stage,'passagem_pendente');
});
await check('02','Localização com recusa de corretor mantém a Nara', async () => {
  const history = [u('Oi, estou só pesquisando.'),a('Olá! Sou a Nara.'),u('Quero saber onde fica o Flow, mas não quero falar com corretor agora.')];
  const value = postProcessNaraTurn(turn('Já estou chamando a Taís do comercial.',{handoff:true}),history,{});
  assert.match(value.reply,/maps\/search/i);
  assert.equal(value.handoff,false);
  assert.doesNotMatch(value.reply,/chamando a taís/i);
});
await check('03','Corretor com cliente ativo continua encaminhado', async () => {
  const history = [u('Sou corretor e tenho um cliente interessado no Alma. Pode me mandar a tabela?')];
  const value = enforceNaraTriage(turn('Te envio a tabela.'),lead,history,{});
  assert.equal(value.handoff,true);
  assert.match(value.reply,/Plantão/i);
});
await check('04','Boleto conhecido não exige repetir assunto', async () => {
  const history = [
    u('Já comprei uma unidade no Flow e preciso da segunda via do boleto.'),
    a('Vou encaminhar ao pós-venda. Pode me dizer o assunto e a unidade?'),
    u('Preciso da segunda via do boleto do Flow para hoje. Você consegue emitir?'),
  ];
  const value = enforceNaraTriage(turn('Pode me dizer o assunto?'),lead,history,{});
  assert.equal(value.handoff,true);
  assert.match(value.reply,/boleto/i);
  assert.match(value.reply,/número da sua unidade/i);
  assert.doesNotMatch(value.reply,/qual assunto|dizer em uma frase o assunto/i);
});
await check('05','Fornecedor de esquadrias vai a suprimentos', async () => {
  const first = 'Bom dia, trabalhamos com esquadrias e gostaríamos de apresentar nossa empresa.';
  assert.equal(isSupplierRoutingSignal(first),true);
  assert.equal(isSupplierRoutingSignal('Quero conhecer as esquadrias do meu apartamento no Flow.'),false);
  const value = enforceNaraTriage(turn('Pode mandar a apresentação.'),lead,[u(first)],{});
  assert.equal(value.handoff,true);
  assert.match(value.reply,/suprimentos/i);
});
await check('06','Risco na planta não recebe recusa de preço', async () => {
  const history = [u('Comprar na planta hoje não é arriscado demais? Tem construtora quebrando por aí.')];
  const value = postProcessNaraTurn(turn('Não consegui confirmar um preço vigente para esse pedido.'),history,{});
  assert.match(value.reply,/Jazz|Soul/);
  assert.match(value.reply,/riscos de comprar na planta/i);
  assert.doesNotMatch(value.reply,/preço vigente/i);
});
await check('07','Saudação de família não duplica apresentação', async () => {
  const history=[u('Boa tarde! Procuramos apartamento com 3 quartos.')];
  const value=ensureFirstTurnIntroduction('Oi! Aqui é a Nara, da Bossa 😊 Boa tarde! Sou a Nara, da Bossa. Temos 3 quartos.',history,{});
  assert.equal((value.match(/\bNara\b/g)??[]).length,1);
});
await check('08','Menor preço do Flow vem de faixa estruturada', async () => {
  const history=[u('Quero o menor preço do Flow. Só isso.')];
  const value=protectNaraCommercialReply('O preço é R$ 900 mil.',history,flowRange);
  assert.match(value.reply,/986\.590,00/);
  assert.doesNotMatch(value.reply,/900 mil/);
});
await check('09','Histórico de entregas não afirma todos os lançamentos entregues', async () => {
  const history=[u('Qual é o histórico de entregas da Bossa?')];
  const value=await enforceNaraReplyGuardrails(turn('A Bossa entregou todos os projetos que lançou: Jazz e Soul.'),lead,history,{});
  assert.doesNotMatch(value.reply,/todos os projetos que lançou/i);
  assert.match(value.reply,/Flow e Alma seguem em andamento/i);
});
await check('10','Transparência sobre IA e frase da planta legível', async () => {
  const history=[u('Quero só a planta do Flow, sem ligação com corretor.')];
  const value=await enforceNaraReplyGuardrails(turn('A de 62 m² e 62 m² não está comigo agora; o time pode te enviar.'),lead,history,{});
  assert.match(value.reply,/tipos 2 e 3, ambas de 62 m²/i);
});
await check('11','Preço da 1403 não transforma desconto em aprovação', async () => {
  const history=[u('Quanto custa a unidade 1403 do Flow? E o desconto de 15% já está aprovado?')];
  const value=protectNaraCommercialReply('A unidade 1403 sai com 15% de desconto confirmado.',history,flowUnit);
  assert.match(value.reply,/1\.369\.861,25/);
  assert.match(value.reply,/precisa da análise do comercial/i);
  assert.doesNotMatch(value.reply,/15% de desconto confirmado/i);
});
await check('12','5% e 100 vezes não viram plano aprovado', async () => {
  const message='Se eu der 5% de entrada, vocês garantem 100 parcelas sem juros e sem correção?';
  assert.equal(isNaraAlternativePaymentProposal(message),true);
  const value=protectNaraCommercialReply('Claro, podemos garantir 100 vezes sem juros.',[
    u('Quanto custa a 1403 do Flow?'),a('R$ 1.369.861,25'),u(message),
  ],flowUnit);
  assert.match(value.reply,/Não posso garantir nem aprovar/i);
  assert.doesNotMatch(value.reply,/1\.369\.861,25|podemos garantir 100/i);
});
await check('13','Mais barato do Alma retorna uma unidade, não três avisos', async () => {
  const history=[u('Quanto custa o apartamento mais barato do Alma hoje?')];
  const value=protectNaraCommercialReply('O menor custa R$ 1 milhão.',history,almaOffers);
  assert.match(value.reply,/1002/);
  assert.doesNotMatch(value.reply,/1102|701/);
  assert.equal((value.reply.match(/plano completo/g)??[]).length,0);
});
await check('14','Alternância espanhol-inglês mantém o idioma', async () => {
  const history=[u('Hola, quiero conocer Alma Seahouses.'),a('¡Hola!'),u('What is the starting price? Please answer in English.')];
  assert.equal(naraConversationLanguage(history),'en');
  const value=protectNaraCommercialReply('It is R$ 1 million.',history,almaRange);
  assert.match(value.reply,/current list prices from/i);
  assert.match(value.reply,/1\.285\.350,85/);
});
await check('15','Entrada física e proposta financeira não acionam lista de preços', async () => {
  const noNetwork = { from(){throw new Error('Should not query a database for this message.');} };
  const architecture=[u('Como é a entrada do apartamento do Flow? Ela dá acesso à sala ou ao corredor?')];
  assert.equal(await loadNaraCommercialTurnContext(noNetwork,'synthetic-org',lead,architecture),null);
  const proposal='Agora falo da entrada financeira: vocês podem aceitar 5% e fazer 100 vezes sem correção?';
  assert.equal(await loadNaraCommercialTurnContext(noNetwork,'synthetic-org',lead,[...architecture,a('Não tenho detalhe da porta.'),u(proposal)]),null);
  const value=protectNaraCommercialReply('As unidades começam em R$ 900 mil.',[...architecture,a('Não tenho detalhe da porta.'),u(proposal)],undefined);
  assert.match(value.reply,/Não posso garantir nem aprovar/i);
  assert.doesNotMatch(value.reply,/unidades começam|900 mil/i);
});

assert.equal(results.length,15);
console.log('15 regressões locais aprovadas; dados sintéticos, sem requisições externas.');
