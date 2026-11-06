import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readNaraJourney, updateNaraJourney, extractNaraAgreedReturn, naraFutureCommitment,
  deliveredNaraMaterials, buildNaraHandoffBriefing, explicitNaraProposalRequest } from '../src/lib/nara-journey.ts';
import { naraInbound24hEnabled, emptyNaraRuntimeVariables, missingNaraRuntimeVariables } from '../src/lib/nara-runtime-variables.ts';
import { naraFollowupContactBlock } from '../src/lib/nara-followup-context.ts';
const now = new Date('2026-11-06T15:00:00Z');
let count = 0;
function test(name, fn) { fn(); count++; console.log(`PASS ${name}`); }
const update = (lastUserMessage, metadata = {}, sourceMessageId = 'qa-inbound-1') => updateNaraJourney({
  lastUserMessage, metadata, sourceMessageId, now,
});
const blankExtracted = Object.fromEntries(['enterprise','purpose','typology','budget','deadline','decision_maker','company','creci','region','client_status'].map(k => [k, '']));
test('distância vira objeção rastreável, não resumo genérico', () => {
  const j = update('Acho o Flow longe da praia');
  assert.equal(j.main_objection.code, 'beach_distance'); assert.equal(j.main_objection.source_message_id, 'qa-inbound-1');
});
test('receio de atraso mantém código próprio', () => assert.equal(update('Tenho medo de a obra atrasar').main_objection.code, 'delivery_concern'));
test('vista por andar é dúvida que exige evidência', () => assert.equal(update('Qual a vista do andar 16?').main_objection.code, 'unit_view'));
test('curiosidade de preço não vira proposta', () => assert.equal(update('Qual o valor total?').requested_next_step, null));
test('proposta financeira não é aprovada', () => assert.equal(update('Tenho 200 mil de entrada e quero parcelar').requested_next_step, 'proposal'));
test('pergunta sobre pagamento não infla propostas solicitadas', () => {
  assert.equal(explicitNaraProposalRequest('Qual é a entrada?'),false);
  assert.equal(explicitNaraProposalRequest('Parcela em 100x?'),false);
  assert.equal(explicitNaraProposalRequest('Quero uma proposta para o Flow'),true);
  assert.equal(explicitNaraProposalRequest('Aceitam 200 mil de entrada e 60 parcelas?'),true);
  assert.equal(explicitNaraProposalRequest('Não quero proposta agora'),false);
  assert.equal(explicitNaraProposalRequest('Ainda não preciso de simulação'),false);
  assert.equal(explicitNaraProposalRequest('Quero saber como vocês fazem uma proposta'),false);
  assert.equal(explicitNaraProposalRequest('Tenho 200 mil de entrada, mas ainda estou só pesquisando'),false);
  assert.equal(explicitNaraProposalRequest('Tenho 200 mil de entrada'),false);
});
test('preferência por vídeo é preservada', () => assert.equal(update('Podemos fazer uma videochamada?').requested_next_step, 'video'));
test('pedido de humano tem prioridade explícita', () => assert.equal(update('Quero falar com um consultor').requested_next_step, 'human'));
test('turno curto não apaga objeção anterior', () => {
  const j = update('Flow é longe da praia');
  assert.equal(update('sim', { nara_journey: j }, 'qa2').main_objection.code, 'beach_distance');
});
test('recusa de humano retira pedido pendente', () => {
  const j = update('Quero falar com um consultor');
  assert.equal(update('Não quero corretor agora', { nara_journey: j }, 'qa2').requested_next_step, null);
});
test('retorno com data/hora converte fuso SP', () => assert.equal(extractNaraAgreedReturn('Me chame em 10/11/2026 às 15h', now).notBefore, '2026-11-10T18:00:00.000Z'));
test('amanhã com data de referência, não horário do servidor', () => assert.equal(extractNaraAgreedReturn('Me procure amanhã às 10h', now).notBefore, '2026-11-07T13:00:00.000Z'));
test('fuso legado de Porto Belo não desloca retorno para Lisboa', () => {
  const j=update('Me chame amanhã às 15h',{contact_time_preference_timezone:'Europe/Lisbon',contact_time_preference_original:'Moro em Porto Belo e pode me chamar de tarde'});
  assert.equal(j.agreed_return.not_before,'2026-11-07T18:00:00.000Z');
});
test('data sem hora não autoriza contato de madrugada', () => assert.equal(extractNaraAgreedReturn('Me procure em 10/11/2026', now).notBefore, '2026-11-10T11:30:00.000Z'));
test('data inválida pede esclarecimento', () => assert.deepEqual(extractNaraAgreedReturn('Me chame em 31/11/2026', now), { requested: true, notBefore: null }));
test('hora inválida não vira horário padrão ou truncado', () => {
  for (const time of ['25h', '15:99', '15:999', '3 da tarde']) {
    assert.deepEqual(extractNaraAgreedReturn(`Me chame amanhã às ${time}`, now), {requested:true,notBefore:null});
  }
});
test('depois de amanhã não antecipa o contato em um dia', () => assert.equal(extractNaraAgreedReturn('Me chame depois de amanhã às 15h', now).notBefore,'2026-11-08T18:00:00.000Z'));
test('terça ambígua não ganha data inventada', () => assert.deepEqual(extractNaraAgreedReturn('Me procure na terça', now), { requested: true, notBefore: null }));
test('alternativa ou recusa de data não vira acordo', () => {
  for (const input of ['Não podemos falar amanhã às 15h','Não quero falar amanhã, podemos falar hoje às 16h',
    'Podemos falar amanhã ou depois de amanhã às 15h','Me chame 10/11 ou 11/11 às 15h']) {
    assert.deepEqual(extractNaraAgreedReturn(input,now),{requested:true,notBefore:null});
  }
});
test('resposta só com data completa o esclarecimento pendente', () => {
  const j=update('Me chame na terça');
  const next=update('10/11/2026 às 15h',{nara_journey:j},'qa2');
  assert.equal(next.agreed_return.not_before,'2026-11-10T18:00:00.000Z');
  assert.equal(next.return_needs_clarification,false);
});
test('outro prazo não é reinterpretado como esclarecimento de retorno', () => {
  const j=update('Me chame na terça');
  const next=update('Quero comprar em 10/11/2026',{nara_journey:j},'qa2');
  assert.equal(next.agreed_return,null); assert.equal(next.return_needs_clarification,true);
});
test('prazo de compra não vira retorno combinado', () => assert.equal(extractNaraAgreedReturn('Quero comprar em 10/11/2026', now).requested, false));
test('visita não vira callback concorrente', () => assert.equal(extractNaraAgreedReturn('Quero visitar amanhã às 15h', now).requested, false));
test('SLA interno não é compromisso do cliente', () => assert.equal(naraFutureCommitment({ next_action_due_at: '2026-12-01T12:00:00Z' }, now), false));
test('retorno futuro bloqueia cadência', () => assert.equal(naraFutureCommitment({ nara_journey: update('Me procure em 10/11/2026 às 10h') }, now), true));
test('retorno sem data exata bloqueia até esclarecer', () => assert.equal(naraFutureCommitment({ nara_journey: update('Me procure na terça') }, now), true));
test('retorno ambíguo também bloqueia a cadência atual', () => assert.equal(naraFollowupContactBlock({metadata:{nara_journey:update('Me procure na terça')}},now,'America/Sao_Paulo'),'retorno_combinado_nao_esclarecido'));
test('retorno já vencido não amplia janela de envio', () => assert.equal(naraFutureCommitment({ nara_journey: update('Me procure em 10/11/2026 às 10h') }, new Date('2026-11-11T15:00:00Z')), false));
test('retry da mesma mensagem não desloca amanhã', () => {
  const j = update('Me procure amanhã às 10h');
  assert.deepEqual(updateNaraJourney({ metadata: { nara_journey: j }, lastUserMessage: 'Me procure amanhã às 10h',
    sourceMessageId: 'qa-inbound-1', now: new Date('2026-11-07T12:00:00Z') }), j);
});
test('cliente pode antecipar o retorno explicitamente', () => {
  const j = update('Me procure amanhã às 10h');
  assert.equal(update('Podemos falar agora', { nara_journey: j }, 'qa2').agreed_return, null);
  assert.equal(update('Podemos falar agora', { nara_journey: j }, 'qa2').pending_reason, null);
});
test('cancelar visita não preserva pedido de agendamento anterior', () => {
  const j=update('Quero uma visita amanhã');
  const next=update('Quero cancelar a visita',{nara_journey:j},'qa2');
  assert.equal(next.requested_next_step,null); assert.equal(next.pending_reason,null);
});
test('pedido de consultor agora sobrepõe retorno futuro sem bloquear escalonamento', () => {
  const j=update('Me chame amanhã às 15h');
  const next=update('Quero falar com um consultor agora',{nara_journey:j},'qa2');
  assert.equal(next.requested_next_step,'human'); assert.equal(next.agreed_return,null);
  assert.equal(next.return_needs_clarification,false); assert.equal(naraFutureCommitment({nara_journey:next},now),false);
});
test('arquivo selecionado/fracassado não é apresentado como enviado', () => {
  const rows = [
    { id:'m1', direction:'out', status:'sent', body:'📎 Planta oficial Flow', raw_payload:{ai_file_id:'f1'}, created_at: now.toISOString() },
    { id:'m2', direction:'out', status:'failed', body:'Vista', raw_payload:{ai_file_id:'f2'} },
    { id:'m3', direction:'in', status:'read', raw_payload:{ai_file_id:'f3'} },
    { id:'m4', direction:'out', status:'sent', raw_payload:{ai_file_id:'f1'} },
  ];
  assert.deepEqual(deliveredNaraMaterials(rows).map(r => r.file_id), ['f1']);
});
test('briefing reutiliza perfil acumulado e rotula valores declarados', () => {
  const j = update('O Flow é longe da praia');
  const b = buildNaraHandoffBriefing({ lead: {name:'QA', phone:null, kind:'cliente',source:'Anúncio',enterprise:'Flow'},
    turn: {extracted:blankExtracted,summary:'Quer avançar'}, metadata:{ai_extracted:{purpose:'morar',typology:'2 suítes',budget:'1 milhão'}, nara_journey:j,
      ad:{source_id:'ad-qa',source_url:'https://example.test/ad'}, source_unit:'1602'},
    lastUserMessage:'Tenho 200 mil de entrada', sourceMessageId:'qa2', responsibleId:'owner-qa', responsibleName:'Pessoa QA',
    nextAction:'Avaliar condição',priority:'A1',dueAt:now.toISOString()});
  assert.equal(b.purpose,'morar'); assert.equal(b.budget,'1 milhão'); assert.equal(b.typology,'2 suítes');
  assert.equal(b.source_unit,'1602'); assert.equal(b.source_ad_id,'ad-qa');
  assert.equal(b.main_objection,'O Flow é longe da praia'); assert.equal(b.acceptance_status,'pending');
  assert.equal(b.declared_terms_are_approved,false); assert.deepEqual(b.delivered_materials,[]);
});
test('perfil mais recente prevalece sem apagar campos restantes', () => {
  const b = buildNaraHandoffBriefing({ lead:{name:'QA',kind:'cliente'}, turn:{extracted:{...blankExtracted,purpose:'veraneio'},summary:''},
    metadata:{ai_extracted:{purpose:'morar',typology:'3 suítes'}}, lastUserMessage:'Para veraneio',responsibleId:null,
    responsibleName:null,nextAction:'',priority:'C',dueAt:null});
  assert.equal(b.purpose,'veraneio'); assert.equal(b.typology,'3 suítes'); assert.equal(b.main_objection,null);
});
test('inbound noturno é separado e inativo por padrão', () => {
  assert.equal(naraInbound24hEnabled(emptyNaraRuntimeVariables()),false);
  assert.equal(naraInbound24hEnabled({inbound_24h:'sim'}),true);
  assert.equal(naraInbound24hEnabled({inbound_24h:'talvez sim'}),false);
  assert.equal(missingNaraRuntimeVariables(emptyNaraRuntimeVariables()).includes('inbound_24h'),false);
});
test('metadado inválido é ignorado sem adivinhar fatos', () => {
  assert.equal(readNaraJourney({nara_journey:{main_objection:'resumo',agreed_return:{source:'ai',not_before:now.toISOString()}}}).main_objection,null);
});
const webhook = await readFile(new URL('../src/lib/whatsapp/webhookProcessor.ts',import.meta.url),'utf8');
test('WhatsApp usa wrapper final, não o core isolado', () => {
  assert.match(webhook,/from '@\/lib\/agenda-ai'/); assert.doesNotMatch(webhook,/from '@\/lib\/agenda-ai-core'/);
});
const worker = await readFile(new URL('../src/app/api/automation/followup/route.ts',import.meta.url),'utf8');
test('resgate automático não finge aceite do consultor', () => {
  assert.doesNotMatch(worker,/accepted_by: escalationOwner/);
  assert.doesNotMatch(worker,/handoff_accepted_at: nowIso/);
  assert.match(worker,/lead\.automation_paused \|\| naraFutureCommitment/);
  assert.match(worker,/lead\.stage === 'futuro' && lead\.owner_mode !== 'human' && lead\.ai_enabled !== false/);
});
console.log(`Nara journey: ${count}/${count} checks passed; synthetic only, no network/database/sends.`);
