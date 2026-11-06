// Real decision layers, synthetic messages, no network/calendar/WhatsApp writes.
import assert from 'node:assert/strict';
import { postProcessNaraTurn } from '../src/lib/ai-v120.ts';
import { enforceNaraReplyGuardrails, enforceNaraTriage } from '../src/lib/ai.ts';
import { deriveHybridDecision, aiCanReply } from '../src/lib/hybrid.ts';
import { applyNaraFinancialHandoff } from '../src/lib/nara-sales-handoff.ts';
import { naraApprovedLocationReply } from '../src/lib/nara-approved-locations.ts';

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
for (const interest of [
  'Moro em Itapema e gostei do Flow. Quero entender melhor a distribuição dos ambientes e o lazer.',
  'Gostei do Alma.',
  'Tenho interesse no Soul e quero conhecer as áreas comuns.',
]) await check(`Interesse no empreendimento não é rebaixado por falta de cadastro: ${interest}`, async () => {
  const { result, decision } = await run([user(interest)], turn('Posso explicar a distribuição e os espaços do empreendimento.'));
  assert.equal(result.classification, 'morno');
  assert.equal(result.score, 40);
  assert.equal(decision.priorityClass, 'B');
  assert.equal(result.handoff, false);
  assert.equal(decision.handoffRequired, false);
});
for (const history of [
  [user('Moro em Itapema e gostei do Flow. Quero entender melhor a distribuição dos ambientes e o lazer.'), assistant('Você prefere uma videochamada ou uma visita presencial?'), user('Prefiro conhecer pessoalmente. Posso visitar sábado às 15h?')],
  [user('Quero videochamada amanhã às 15h.')],
  [user('Gostei do Flow.'), assistant('Quer conhecer o Flow em uma videochamada?'), user('Sim, pode ser.')],
  [user('Quero visitar o Flow.'), assistant('Qual dia e horário você prefere para a visita?'), user('Sábado às 15h.')],
]) await check(`Pedido/aceite de agenda avança sem inventar confirmação: ${history.at(-1).content}`, async () => {
  const { result, decision } = await run(history, turn('Vou verificar a disponibilidade. O agendamento ainda depende de confirmação.', {classification:'frio', score:20}));
  assert.equal(result.classification, 'quente');
  assert.equal(result.score, 60);
  assert.equal(decision.priorityClass, 'B');
  assert.equal(result.handoff, false);
  assert.equal(decision.handoffRequired, false);
  assert.notEqual(result.stage, 'agendado');
  assert.notEqual(decision.stage, 'agendado');
  assert.notEqual(result.agenda_confirmed, true);
  assert.match(result.reply, /ainda depende de confirmação/);
  const again = await enforceNaraReplyGuardrails(structuredClone(result), lead, history, {});
  assert.equal(again.score, 60);
  assert.equal(again.classification, 'quente');
  assert.equal(again.handoff, false);
});
for (const history of [
  [user('Quanto tempo dura a apresentação por videochamada?')],
  [assistant('Qual dia pretende se mudar?'), user('Sábado às 15h.')],
  [assistant('Quer agendar uma visita?'), user('Não quero visitar agora.')],
  [assistant('Quer conhecer o Flow por videochamada?'), user('Não quero videochamada agora.')],
  [user('Quero cancelar a visita de sábado às 15h.')],
  [user('Quero uma visita, mas não me passe para ninguém agora.')],
]) await check(`Informação, recusa ou cancelamento não ganha score de agenda: ${history.at(-1).content}`, async () => {
  const { result, decision } = await run(history, turn('Podemos continuar por aqui.', {classification:'frio', score:20}));
  assert.ok(result.score < 60);
  assert.notEqual(result.classification, 'quente');
  assert.notEqual(result.agenda_confirmed, true);
  assert.notEqual(decision.stage, 'agendado');
  assert.equal(result.handoff, false);
  assert.equal(decision.handoffRequired, false);
});
for (const profile of [
  'Sou corretor e gostaria de visitar o Flow sábado às 15h.',
  'Sou fornecedor e quero agendar uma visita à obra.',
  'Já comprei no Flow e quero agendar uma visita para assistência.',
]) await check(`Roteamento específico não recebe promoção de comprador: ${profile}`, async () => {
  const { result } = await run([user(profile)], turn('Vou encaminhar ao setor responsável.', {classification:'frio', score:20}));
  assert.equal(result.classification, 'frio');
  assert.ok(result.score <= 20);
  assert.equal(result.handoff, true);
  assert.notEqual(result.agenda_confirmed, true);
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
await check('Briefing preserva unidade e preferências das quatro falas anteriores sem reciclar oferta da IA', () => {
  const longStatement = 'Minha esposa participa da decisão. ' + 'Contexto declarado pelo cliente. '.repeat(16) + 'EXCESSO_NAO_PERSISTIR';
  const history = [
    user('MENSAGEM_ANTIGA_FORA_DO_RECORTE: inicialmente eu olhava o Soul.'),
    assistant('Posso apresentar os projetos.'),
    user('Agora quero a unidade 1403 do Flow para morar.'),
    assistant('Vamos olhar o Flow.'),
    user('Preciso de 2 suítes, silêncio e uma vaga.'),
    assistant('OFERTA_ANTIGA_DA_IA: R$ 750.000 com desconto aprovado.'),
    user('Tenho receio da distância da praia e prefiro apresentação por vídeo.'),
    assistant('Podemos conversar sobre o projeto.'),
    user(longStatement),
    assistant('Quanto você considera para a entrada?'),
    user('200 mil'),
  ];
  const result = turn('Sua entrada foi aprovada.', {
    summary: 'RESUMO_INSEGURO_DA_IA: oferta aprovada por R$ 750.000.',
  });
  assert.equal(applyNaraFinancialHandoff(result, history), true);
  const decision = deriveHybridDecision({ lead, turn: result, lastUserMessage: history.at(-1).content });
  assert.equal(result.handoff, true);
  assert.equal(decision.stage, 'passagem_pendente');
  assert.match(result.summary, /Declarações anteriores do cliente \(não são ofertas nem aprovações\)/);
  assert.match(result.summary, /unidade 1403 do Flow para morar/);
  assert.match(result.summary, /2 suítes, silêncio e uma vaga/);
  assert.match(result.summary, /receio da distância da praia e prefiro apresentação por vídeo/);
  const retainedFourth = result.summary.match(/ \| 4\. ([\s\S]*?) Pedido declarado, ainda não aprovado:/)?.[1];
  assert.equal(retainedFourth, longStatement.slice(0, 350), 'the fourth prior statement is truncated exactly at 350 characters');
  assert.equal(retainedFourth.length, 350);
  assert.match(result.summary, /Pedido declarado, ainda não aprovado: 200 mil/);
  assert.doesNotMatch(result.summary, /MENSAGEM_ANTIGA_FORA_DO_RECORTE|EXCESSO_NAO_PERSISTIR|OFERTA_ANTIGA_DA_IA|RESUMO_INSEGURO_DA_IA|750\.000|desconto aprovado/);
  assert.doesNotMatch(result.reply, /200 mil|750\.000|aprovad[oa]|R\$/);
  const again = structuredClone(result);
  assert.equal(applyNaraFinancialHandoff(again, history), true);
  assert.deepEqual(again, result, 'reapplying the financial gate rebuilds the same bounded briefing without duplication');
  assert.equal((again.summary.match(/unidade 1403/g) ?? []).length, 1);
});
await check('Preferência por vaga de garagem não vira emprego nem apaga passagem', async () => {
  const history = [user('Quero a unidade 1403 do Flow, 2 suítes e uma vaga.'), assistant('Quanto você considera para a entrada?'), user('200 mil')];
  const {result, decision} = await run(history, turn('Sua entrada foi aprovada.'));
  assert.equal(result.handoff, true);
  assert.equal(decision.handoffRequired, true);
  assert.match(result.reply, /Vou chamar nossa equipe comercial/);
  assert.match(result.summary, /1403.*uma vaga/);
  const again = await enforceNaraReplyGuardrails(structuredClone(result), lead, history, {});
  assert.deepEqual(again, result);
});
await check('Pedido real de emprego continua fora da pré-venda', async () => {
  const {result} = await run([user('Quero enviar meu currículo para uma vaga de emprego na Bossa.')]);
  assert.equal(result.handoff, true);
  assert.match(result.summary, /fora da esteira de compradores/);
  assert.doesNotMatch(result.reply, /entrada e as condições de pagamento|avaliar sua proposta/);
});

await check('Pergunta mista de entrada e distância mantém passagem e o fato aprovado', async () => {
  const history = [user('Na unidade 1403 do Flow, aceitam R$ 200 mil de entrada e o restante em 60 vezes? E quantos metros fica do mar?')];
  const { result, decision } = await run(history, turn('Sim, aceitamos! A entrada de R$ 200 mil está aprovada em 60 parcelas. O Flow fica a 50 m do mar.'));
  assert.equal(result.handoff, true);
  assert.equal(decision.stage, 'passagem_pendente');
  assert.equal(decision.priorityClass, 'A1');
  assert.match(result.reply, /Vou chamar nossa equipe comercial/);
  assert.match(result.reply, /O Flow fica em Balneário Perequê, Porto Belo, a 800 m do mar/);
  assert.doesNotMatch(result.reply, /aceitamos|aprovad|R\$|200 mil|60 (?:vezes|parcelas)|50 m|\?/);
  assert.match(result.summary, /Pedido declarado, ainda não aprovado:.*200 mil/);
  const again = await enforceNaraReplyGuardrails(structuredClone(result), lead, history, {});
  assert.deepEqual(again, result);
  const repeated = structuredClone(result);
  applyNaraFinancialHandoff(repeated, history);
  const once = structuredClone(repeated);
  applyNaraFinancialHandoff(repeated, history);
  applyNaraFinancialHandoff(repeated, history);
  assert.deepEqual(repeated, once);
  assert.equal((repeated.reply.match(/800 m/g) ?? []).length, 1);
});

for (const [message, expected, handoffLanguage] of [
  ['Quero negociar a entrada do Flow. Onde fica?', /O Flow fica em Balneário Perequê, Porto Belo, a 800 m do mar/, /Vou chamar/],
  ['Qual é a entrada do Alma? Qual é a localização?', /O Alma fica em Balneário Perequê, Porto Belo, a 300 m do mar; não é frente-mar/, /Vou chamar/],
  ['Qual é a entrada do Soul? Qual a distância da praia?', /O Soul fica em Itapema, a 500 m do mar/, /Vou chamar/],
  ['Qual é a entrada do Flow e quantos metros fica do mar?', /O Flow fica em Balneário Perequê, Porto Belo, a 800 m do mar/, /Vou chamar/],
  ['Quisiera pagar la entrada del Alma en cuotas. ¿A cuántos metros del mar está?', /El Alma está en Balneário Perequê, Porto Belo, a 300 m del mar; no está frente al mar/, /Voy a llamar/],
  ['Hola, quiero negociar el pago del Flow. ¿Dónde está?', /El Flow está en Balneário Perequê, Porto Belo, a 800 m del mar/, /Voy a llamar/],
  ['Please, can I pay the down payment for Soul in instalments? How far is it from the beach?', /Soul is in Itapema, 500 m from the beach/, /I'll ask/],
  ['Please, how much is the down payment for Alma? Where is it?', /Alma is in Balneário Perequê, Porto Belo, 300 m from the beach; it is not beachfront/, /I'll ask/],
]) await check(`Fato e idioma aprovados na passagem mista: ${message}`, () => {
  const result = turn('Condição aprovada. Localização inventada.');
  assert.equal(applyNaraFinancialHandoff(result, [user(message)]), true);
  assert.equal(result.handoff, true);
  assert.match(result.reply, handoffLanguage);
  assert.match(result.reply, expected);
  assert.doesNotMatch(result.reply, /aprovad|inventada|R\$|350 m/);
});

await check('Recusa de passagem preserva a resposta factual, sem encaminhar', async () => {
  const history = [user('Qual a entrada do Flow? E quantos metros fica do mar? Não me encaminhe agora.')];
  const { result, decision } = await run(history, turn('Sua proposta foi aprovada. Vou chamar o comercial.', { handoff: true }));
  assert.equal(result.handoff, false);
  assert.equal(decision.handoffRequired, false);
  assert.ok(result.score <= 59);
  assert.match(result.reply, /sem te encaminhar/);
  assert.match(result.reply, /800 m do mar/);
  assert.doesNotMatch(result.reply, /Vou chamar|foi aprovada|R\$/);
  const repeated = await enforceNaraReplyGuardrails(structuredClone(result), lead, history, {});
  assert.deepEqual(repeated, result);
});

for (const message of [
  'Qual é a entrada do Flow?',
  'Tenho 200 mil de entrada para o Flow, que fica a 20 m do mar.',
  'Qual é a entrada do Flow? Não pedi a distância da praia.',
]) await check(`Sem complemento factual não solicitado: ${message}`, () => {
  const history = [user(message)];
  const result = turn('O Flow fica a 20 m do mar.');
  assert.equal(applyNaraFinancialHandoff(result, history), true);
  assert.equal(naraApprovedLocationReply(history), '');
  assert.doesNotMatch(result.reply, /\b\d+ m\b|Balneário Perequê|map/);
});

for (const history of [
  [user('Qual é a entrada? E quantos metros fica do mar?')],
  [user('Qual é a entrada do Flow ou do Alma? E quantos metros fica do mar?')],
  [user('Gostei do Flow.'), assistant('Posso mostrar o Flow e o Alma.'), user('Qual é a entrada? E quantos metros fica do mar?')],
  [user('Gostei do Flow.'), user('Qual é a entrada? E qual é a distância do outro empreendimento até a praia?')],
  [user('Gostei do Flow.'), user('Qual é a entrada? E quantos metros do mar fica o Atlantis?')],
  [user('Qual é a entrada do Flow? E qual a distância do outro empreendimento até a praia?')],
  [user('Gostei do Flow.'), user('Qual é a entrada? E quantos metros do mar fica o atlantis?')],
  [user('Qual é a entrada do Flow? E onde fica o escritório?')],
  [user('Qual é a entrada do Flow? E o escritório, onde fica?')],
  [user('Qual é a entrada do Flow? E onde fica o atlantis?')],
  [user('Qual é a entrada do Flow? E a que distância o atlantis fica da praia?')],
  [user('Please, how much is the down payment for Flow? Where is the office?')],
  [user('Please, how much is the down payment for Flow? The office, where is it?')],
  [user('Hola, quiero negociar la entrada del Alma. ¿Dónde está la oficina?')],
  [user('Gostei do Flow.'), user('Please, how much is the down payment? How far is atlantis from the beach?')],
]) await check(`Referência ausente/ambígua não recebe distância de outro projeto: ${history.at(-1).content}`, () => {
  assert.equal(naraApprovedLocationReply(history), '');
  const result = turn('Fica a 800 m do mar.');
  assert.equal(applyNaraFinancialHandoff(result, history), true);
  assert.doesNotMatch(result.reply, /\b\d+ m\b|Balneário Perequê|Itapema/);
});

await check('Contexto anterior inequívoco mantém a distância e não o preço antigo', () => {
  const history = [user('Gostei do Flow.'), assistant('O Flow tem a condição aprovada de R$ 750 mil.'), user('Qual é a entrada? E quantos metros fica do mar?')];
  const result = turn();
  assert.equal(applyNaraFinancialHandoff(result, history), true);
  assert.match(result.reply, /800 m do mar/);
  assert.doesNotMatch(result.reply, /750|aprovad|R\$/);
});

await check('Localização pura não passa a ser negociação', async () => {
  const history = [user('Onde fica o Flow e quantos metros fica do mar?')];
  const result = turn(naraApprovedLocationReply(history));
  const original = structuredClone(result);
  assert.equal(applyNaraFinancialHandoff(result, history), false);
  assert.deepEqual(result, original);
  assert.match(result.reply, /800 m do mar/);
  const checked = await run(history, result);
  assert.equal(checked.decision.handoffRequired, false);
  assert.match(checked.result.reply, /Flow/);
});

await check('Opt-out não recebe localização ou reabre a passagem', async () => {
  const history = [user('Qual é a entrada do Flow e a distância da praia?'), assistant('O comercial pode verificar a condição.'), user('Não quero mais mensagens, retire meu contato dos próximos envios.')];
  assert.equal(naraApprovedLocationReply(history), '');
  const { result, decision } = await run(history, turn('Entendido, não vou insistir.', { classification: 'sem_interesse', score: 0 }));
  assert.equal(decision.stage, 'encerrado');
  assert.equal(decision.handoffRequired, false);
  assert.doesNotMatch(result.reply, /800 m|Vou chamar/);
});
console.log(`${passed} verificações de conversão e passagem aprovadas sem ações externas.`);
