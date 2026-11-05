// Real decision layers, synthetic messages, no network/calendar/WhatsApp writes.
import assert from 'node:assert/strict';
import { postProcessNaraTurn } from '../src/lib/ai-v120.ts';
import { enforceNaraReplyGuardrails, enforceNaraTriage } from '../src/lib/ai.ts';
import { deriveHybridDecision, aiCanReply } from '../src/lib/hybrid.ts';
import { applyNaraFinancialHandoff } from '../src/lib/nara-sales-handoff.ts';

const user = (content) => ({ role: 'user', content });
const assistant = (content) => ({ role: 'assistant', content });
const lead = { id:'qa-conversion', organization_id:'qa', kind:'cliente', enterprise:'Flow Aptos', stage:'qualificacao_ia', owner_mode:'ai', ai_enabled:true, automation_paused:false, opt_out:false, metadata:{} };
const turn = (reply = 'Posso te explicar o projeto.', overrides = {}) => ({
  reply, classification:'morno', score:40, stage:'ia', summary:'', next_action:'', handoff:false, attachment_ids:[],
  extracted:{ enterprise:'', purpose:'', typology:'', budget:'', deadline:'', decision_maker:'', company:'', creci:'', region:'', client_status:'' }, ...overrides,
});
let passed = 0;
async function check(title, test) { await test(); passed++; console.log(`✓ ${title}`); }
async function run(history, output = turn(), selectedLead = lead) {
  const triage = enforceNaraTriage(output, selectedLead, history, {});
  const post = postProcessNaraTurn(triage, history, {});
  const result = await enforceNaraReplyGuardrails(post, selectedLead, history, {});
  const decision = deriveHybridDecision({ lead:selectedLead, turn:result, lastUserMessage:history.at(-1).content });
  return { result, decision };
}

for (const question of [
  'Qual é o valor da entrada do Flow?',
  'Em quantas parcelas eu consigo pagar?',
  'Tenho 200 mil para entrada e consigo 8 mil por mês. Tem como?',
  'Se eu resolvesse isso esta semana, daria para montar uma proposta?',
  'Qual a condição de pagamento?',
  'Podem aceitar meu apartamento como parte do pagamento?',
  'Quero uma videochamada amanhã às 18h e negociar entrada de 10%.',
  'Quero o valor total e o plano de pagamento com parcelas.',
]) await check(`Passagem imediata: ${question}`, async () => {
  const history = [user('Gostei do Flow para morar.'), assistant('O Flow tem duas suítes e duplex.'), user(question)];
  const { result, decision } = await run(history, turn('Posso fazer 5% de entrada e 100 parcelas sem correção. Quanto você ganha?'));
  assert.equal(result.handoff, true);
  assert.equal(decision.handoffRequired, true);
  assert.equal(decision.stage, 'passagem_pendente');
  assert.equal(decision.priorityClass, 'A1');
  assert.match(result.reply, /Vou chamar nossa equipe comercial/);
  assert.match(result.reply, /Flow/);
  assert.doesNotMatch(result.reply, /5%|100 parcelas|sem correção|\?|Quanto você ganha|R\$/);
  assert.match(result.summary, /não aprovado/);
  const again = await enforceNaraReplyGuardrails(structuredClone(result), lead, history, {});
  assert.equal(again.reply, result.reply);
  assert.equal(again.summary, result.summary);
});

await check('Recusa de humano não vira transferência escondida ou aprovação', async () => {
  const history = [user('Tenho 200 mil para entrada, mas não me passe para ninguém agora. Ainda não vou fazer proposta.')];
  const { result, decision } = await run(history, turn('Vou passar para o comercial.', { handoff:true }));
  assert.equal(result.handoff, false);
  assert.equal(decision.handoffRequired, false);
  assert.match(result.reply, /sem te encaminhar/);
  assert.doesNotMatch(result.reply, /Vou chamar|aprovad|R\$/);
});
await check('Preço total isolado continua na Nara', async () => {
  const { result, decision } = await run([user('Qual o menor preço total do Flow? Só o total.')]);
  assert.equal(result.handoff, false);
  assert.equal(decision.handoffRequired, false);
});
await check('Entrada física não é oportunidade financeira', async () => {
  const { result, decision } = await run([
    user('Gostei do Alma.'), assistant('A planta maior tem 114 m².'),
    user('A entrada da planta maior dá para a sala ou para um corredor?'),
  ], turn('Preciso confirmar essa distribuição na planta.'));
  assert.equal(result.handoff, false);
  assert.equal(decision.handoffRequired, false);
  assert.doesNotMatch(result.reply, /Taís|pagamento/);
});
await check('Pedido de boleto continua no pós-venda, não negociação', async () => {
  const { result } = await run([user('Já comprei no Flow e preciso da segunda via do boleto das parcelas da unidade 1403.')]);
  assert.equal(result.handoff, true);
  assert.match(result.reply, /Cíntia|pós-venda/i);
  assert.doesNotMatch(result.reply, /avaliar sua proposta|Taís do comercial/);
});
await check('Prazo de entrega não é SLA de atendimento', () => {
  const result = postProcessNaraTurn(turn('O Flow tem entrega prevista para novembro de 2027.'), [user('Em quanto tempo o Flow fica pronto?')], {});
  assert.match(result.reply, /novembro de 2027/);
  assert.equal(result.handoff, false);
});
await check('Duração da apresentação não aciona falsa promessa de retorno', () => {
  const result = postProcessNaraTurn(turn('A duração pode ser combinada com o time, conforme suas dúvidas.'), [user('Quanto tempo dura a apresentação por videochamada?')], {});
  assert.doesNotMatch(result.reply, /assume.*agora|primeiro.*atendido|minutos/);
  assert.equal(result.handoff, false);
});
await check('Identidade digital não apaga pergunta imobiliária já feita', () => {
  const result = postProcessNaraTurn(turn('Sou a Nara, assistente digital da Bossa. O Alma tem plantas de 3 suítes com 103 e 114 m².'), [user('Você é robô? Quero saber as metragens do Alma.')], {});
  assert.match(result.reply, /assistente digital/);
  assert.match(result.reply, /103 e 114 m²/);
  assert.doesNotMatch(result.reply, /Qual é a sua dúvida/);
});
await check('Humano pedido explicitamente não recebe novo interrogatório financeiro', () => {
  const result = postProcessNaraTurn(turn(), [user('Gostei do Flow.'), assistant('Posso ajudar por aqui.'), user('Quero falar com uma pessoa.')], {});
  assert.equal(result.handoff, true);
  assert.match(result.reply, /equipe comercial/);
  assert.doesNotMatch(result.reply, /à vista|parcelado|prazo|\?/);
});
await check('Reserva Alma tem uma única passagem, sem garantia falsa', async () => {
  const result = await enforceNaraReplyGuardrails(turn('Reserva garantida.', {handoff:true}), {...lead, enterprise:'Alma Seahouses'}, [user('Quero reservar o Alma. Você garante o preço e que o registro saia nas próximas semanas?')], {});
  assert.equal((result.reply.match(/equipe comercial/g) ?? []).length, 1);
  assert.match(result.reply, /não consigo garantir/);
});
await check('Reserva Alma não ignora recusa explícita de encaminhamento', async () => {
  const { result, decision } = await run([user('Quero reservar o Alma, mas não me passe para ninguém agora. Você garante o preço?')], turn('Reserva garantida.', {handoff:true}), {...lead, enterprise:'Alma Seahouses'});
  assert.equal(result.handoff, false);
  assert.equal(decision.handoffRequired, false);
  assert.match(result.reply, /não consigo garantir/);
  assert.match(result.reply, /sem te encaminhar agora/);
  assert.match(result.summary, /Recusou encaminhamento/);
});
await check('Texto ou classificação da IA não confirma agendamento', async () => {
  const { result, decision } = await run([user('Quero videochamada amanhã às 15h.')], turn('Sua videochamada está agendada para amanhã às 15h.', { stage:'agendado', classification:'agendamento', handoff:true }));
  assert.notEqual(result.stage, 'agendado');
  assert.notEqual(decision.stage, 'agendado');
  assert.match(result.reply, /ainda não está confirmado/);
});
for (const [question, answer, safe] of [
  ['Quiero una videollamada mañana a las 15h.', 'Su cita está confirmada para mañana a las 15:00.', /no está confirmada/],
  ['Please, can I have a video call tomorrow at 3pm?', 'Your meeting is confirmed for tomorrow at 3pm.', /not confirmed yet/],
  ['Quero uma visita amanhã.', 'Ainda não há uma visita confirmada. Sua videochamada está confirmada para amanhã.', /ainda não está confirmado/],
]) await check(`Confirmação sem agenda é bloqueada: ${answer}`, async () => {
  const result = await enforceNaraReplyGuardrails(turn(answer), lead, [user(question)], {});
  assert.match(result.reply, safe);
  assert.notEqual(result.stage, 'agendado');
});
for (const [question, answer] of [
  ['Quiero una videollamada mañana.', 'La cita todavía no está confirmada.'],
  ['Please, can I have a video call tomorrow?', "Your meeting hasn't been confirmed yet."],
  ['Quero uma visita amanhã.', 'A visita ainda não está confirmada.'],
]) await check(`Pendência de agenda honesta é preservada: ${answer}`, async () => {
  const result = await enforceNaraReplyGuardrails(turn(answer), lead, [assistant('Posso ajudar.'), user(question)], {});
  assert.equal(result.reply, answer);
});
await check('Somente marcador da agenda confirma e permite entregar confirmação atual', () => {
  const decision = deriveHybridDecision({ lead, turn:turn('Confirmação do sistema.', {agenda_confirmed:true, stage:'agendado', classification:'agendamento'}), lastUserMessage:'Amanhã às 15h' });
  assert.equal(decision.stage, 'agendado');
  assert.equal(decision.ownerMode, 'ai');
  assert.equal(decision.aiEnabled, true);
  assert.equal(aiCanReply({...lead, stage:decision.stage}), false, 'Após confirmação, próximos turnos não reabrem a IA');
});
await check('Humano ativo com pedido de visita não fabrica agendamento', () => {
  const decision = deriveHybridDecision({lead:{...lead, stage:'humano_ativo', owner_mode:'human'}, turn:turn('', {stage:'agendado'}), lastUserMessage:'Quero visitar amanhã'});
  assert.equal(decision.stage, 'humano_ativo');
});
await check('Resposta curta herda só a pergunta financeira imediatamente anterior', () => {
  const output = turn();
  const history = [assistant('Quanto você considera para a entrada?'), user('200 mil')];
  assert.equal(applyNaraFinancialHandoff(output, history), true);
  assert.equal(output.handoff, true);
  assert.doesNotMatch(output.reply, /200 mil|R\$/);
});
console.log(`${passed} verificações de conversão e passagem aprovadas sem ações externas.`);
