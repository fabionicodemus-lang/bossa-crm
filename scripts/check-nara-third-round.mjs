// Terceira rodada: objeção de preço, interesse contextual e convite não coercitivo.
// Apenas decisões locais e mensagens sintéticas. Sem WhatsApp, banco ou agenda.
import assert from 'node:assert/strict';
import { hasConcreteHousingInterest, priceObjectionValueBridge } from '../src/lib/nara-commercial-conversion.ts';
import { enforceNaraTriage, enforceNaraReplyGuardrails } from '../src/lib/ai.ts';
import { postProcessNaraTurn } from '../src/lib/ai-v120.ts';
import { NARA_CONVERSATION_POLICY } from '../src/lib/nara-conversation-policy.ts';

const user = (content) => ({ role:'user', content });
const assistant = (content) => ({ role:'assistant', content });
const lead = { id:'qa-round3', organization_id:'qa', kind:'cliente', enterprise:'Flow Aptos', stage:'qualificacao_ia', owner_mode:'ai', ai_enabled:true, automation_paused:false, opt_out:false, metadata:{} };
const turn = (overrides={}) => ({
  reply:'Posso te mostrar a planta para você avaliar os espaços.', classification:'frio', score:20, stage:'ia',
  summary:'', next_action:'', handoff:false, attachment_ids:[],
  extracted:{ enterprise:'', purpose:'', typology:'', budget:'', deadline:'', decision_maker:'', company:'', creci:'', region:'', client_status:'' }, ...overrides,
});

let passed = 0;
function check(title, test) { test(); passed++; console.log(`✓ ${title}`); }
async function checkAsync(title, test) { await test(); passed++; console.log(`✓ ${title}`); }

for(const message of [
  'Somos três pessoas, duas suítes em 62 m² não fica apertado?',
  'Quero uma casa de praia sofisticada para curtir com meus filhos. O Alma serve?',
  'Procuro um apartamento para morar com a família.',
  'Quero investir no Alma e conhecer as plantas.',
  'Trabalho de casa. No Flow, o coworking dá conta da minha rotina?',
]) check(`Perfil contextual: ${message}`, () => {
  assert.equal(hasConcreteHousingInterest([user(message)]), true);
});

for(const message of [
  'Qual o menor preço do Flow?',
  'Só quero o valor total.',
  'Vocês trabalham com patrimônio de afetação?',
  'A Bossa foi fundada em 2017?',
  'Não quero comprar, é curiosidade sobre o Alma.',
  'Gostei do Flow, mas não cabe no meu orçamento.',
  'Minha família conhece a Bossa desde 2017.',
]) check(`Curiosidade ou inviabilidade não é perfil: ${message}`, () => {
  assert.equal(hasConcreteHousingInterest([user(message)]), false);
});

for(const message of [
  'Somos três pessoas, duas suítes em 62 m² não fica apertado?',
  'Quero uma casa de praia sofisticada para curtir com meus filhos. O Alma serve?',
]) await checkAsync(`Frio de origem é reclassificado: ${message}`, async () => {
  const history = [user(message)];
  const output = await enforceNaraReplyGuardrails(postProcessNaraTurn(enforceNaraTriage(turn(), lead, history, {}), history, {}), lead, history, {});
  assert.equal(output.classification, 'morno');
  assert.ok(output.score >= 35 && output.score <= 59);
  assert.equal(output.handoff, false);
});

await checkAsync('Pedido apenas informativo não ganha score por associação', async () => {
  const history = [user('Qual é o menor preço do Flow?')];
  const output = await enforceNaraReplyGuardrails(postProcessNaraTurn(enforceNaraTriage(turn(), lead, history, {}), history, {}), lead, history, {});
  assert.equal(output.classification, 'frio');
  assert.ok(output.score <= 20);
  assert.equal(output.handoff, false);
});

await checkAsync('Corretor que fala de família não vira lead de compra', async () => {
  const history = [user('Sou corretor, meu cliente tem dois filhos e procura apartamento no Flow.')];
  const output = await enforceNaraReplyGuardrails(postProcessNaraTurn(enforceNaraTriage(turn(), lead, history, {}), history, {}), lead, history, {});
  assert.equal(output.classification, 'frio');
  assert.equal(output.handoff, true);
});

check('Objeção de preço Flow recebe valor primeiro e um critério de comparação', () => {
  const original='Flow Aptos: faixa atual R$ 986.590,00 a R$ 1.441.611,25.';
  const output=priceObjectionValueBridge(original, [user('Achei o Flow caro comparado com outros. Qual o menor preço atual?')], 'crm', 'Flow Aptos');
  assert.ok(output.startsWith(original));
  assert.match(output, /pavimentos de lazer/);
  assert.match(output, /comparar/);
  assert.equal((output.match(/R\$/g)??[]).length, 2);
});

await checkAsync('Guarda completa preserva faixa do CRM e acrescenta valor apenas na objeção', async () => {
  const history=[user('Achei o Flow caro comparado com outros. Qual o menor preço atual?')];
  const commercial={
    consulted_at:new Date().toISOString(), source_table:'development_units', status:'ok',
    calls:[{name:'faixa_empreendimento',arguments:{empreendimento:'flow'},result:{
      empreendimento:'Flow Aptos', valor_minimo:986590, valor_maximo:1441611.25,
      qtd_disponiveis:3, validade_tabela:'2030-12-31',
    }}],
  };
  const output=await enforceNaraReplyGuardrails(turn({reply:'Acho que o Flow tem uma boa relação custo-benefício.'}), lead, history, {commercial});
  assert.match(output.reply, /R\$\s*986\.590,00/);
  assert.match(output.reply, /pavimentos de lazer/);
  assert.doesNotMatch(output.reply, /desconto garantido|parcelas sem juros/);
  assert.equal(output.handoff,false);
});

for(const [name, original, latest, source] of [
  ['Só número', 'Flow Aptos: R$ 1.200.000,00.', 'Só quero o preço total do Flow, sem detalhes.', 'crm'],
  ['Consulta sem validação', 'Preciso confirmar o preço.', 'Achei o Flow caro, qual o menor?', 'unconfirmed'],
  ['Sem objeção', 'Alma: R$ 2.100.000,00.', 'Qual é o preço do Alma?', 'crm'],
  ['Sem projeto', 'R$ 1.200.000,00.', 'Achei muito caro.', 'crm'],
]) check(`Resposta comercial permanece limpa: ${name}`, () => {
  assert.equal(priceObjectionValueBridge(original, [user(latest)], source), original);
});

check('Preço do Alma é contextualizado sem promessa de rentabilidade', () => {
  const original='Alma: faixa atual R$ 1.500.000,00 a R$ 2.400.000,00.';
  const output=priceObjectionValueBridge(original, [user('O Alma está muito caro, qual o menor valor?')], 'crm');
  assert.match(output, /dois apartamentos por andar/);
  assert.doesNotMatch(output, /valoriza|retorno garantido|desconto/);
});

check('Política orienta preço, score contextual e respeita pedidos sem convite', () => {
  assert.match(NARA_CONVERSATION_POLICY, /Se o cliente pedir um preço, entregue o valor vigente diretamente/);
  assert.match(NARA_CONVERSATION_POLICY, /Classifique ao menos como/);
  assert.match(NARA_CONVERSATION_POLICY, /Se recusar uma modalidade, não repita o convite/);
});

console.log(`\nTerceira rodada: ${passed} verificações sintéticas aprovadas.`);
