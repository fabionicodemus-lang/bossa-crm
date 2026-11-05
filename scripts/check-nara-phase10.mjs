import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  enforceNaraTriage,
  enforceNaraReplyGuardrails,
  hasForbiddenScarcityClaim,
  naraReplyGuardrailViolations,
  naraReplyQuestionCount,
  naraReplyWordCount,
} from '../src/lib/ai.ts';
import { naraReplyOpeningKey, postProcessNaraTurn } from '../src/lib/ai-v120.ts';
import { aiCanReply, deriveHybridDecision } from '../src/lib/hybrid.ts';
import { isAssistedSaleSignal, isBrokerRoutingSignal } from '../src/lib/nara-contact-routing.ts';
import { loadNaraCommercialTurnContext } from '../src/lib/nara-unit-queries.ts';

const passed = [];
async function accept(number, title, run) {
  await run();
  passed.push({ number, title });
}

const baseLead = {
  id: 'lead', organization_id: 'org', kind: 'cliente', name: 'Teste', phone: '5547999999999',
  stage: 'novo_triagem', owner_mode: 'ai', ai_enabled: true, opt_out: false,
  automation_paused: false, enterprise: 'Flow Aptos', metadata: {}, reactivation_at: null,
  handoff_requested_at: null, owner_id: null, backup_owner_id: null,
};

function turn(overrides = {}) {
  return {
    reply: 'Posso te mostrar as opções.', classification: 'morno', score: 45, stage: 'ia',
    summary: 'Contato em atendimento.', next_action: 'Continuar.', handoff: false,
    attachment_ids: [],
    extracted: {
      enterprise: '', purpose: '', typology: '', budget: '', deadline: '',
      decision_maker: '', company: '', creci: '', region: '', client_status: '',
    },
    ...overrides,
  };
}

const consultedAt = new Date().toISOString();
const tableValidUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const generalCommercial = {
  consulted_at: consultedAt, source_table: 'development_units',
  calls: [{
    name: 'faixa_empreendimento', arguments: { empreendimento: 'Flow' },
    result: { empreendimento: 'Flow Aptos', valor_minimo: 900000, valor_maximo: 1050000, entrada_minima: 180000, qtd_disponiveis: 4 },
  }],
  source_text: '[faixa_empreendimento] empreendimento=Flow Aptos; valor_minimo=R$ 900.000,00; valor_maximo=R$ 1.050.000,00; entrada_minima=R$ 180.000,00; qtd_disponiveis=4',
};
const unitCommercial = {
  consulted_at: consultedAt, source_table: 'development_units',
  calls: [{
    name: 'consultar_apartamento', arguments: { empreendimento: 'Flow', unidade: '901' },
    result: { empreendimento: 'Flow Aptos', unidade: '901', andar: 9, tipologia: '2 suítes', valor: 900000, entrada: 180000, parcela_media: 12000, quantidade_parcelas: 60, indice_correcao: 'CUB/SC', validade_tabela: tableValidUntil, referencia_tabela: 'teste-vigente', preco_atualizado_em: consultedAt },
  }],
  source_text: `[consultar_apartamento] empreendimento=Flow Aptos; unidade=901; andar=9; tipologia=2 suítes; valor=R$ 900.000,00; entrada=R$ 180.000,00; parcela_media=R$ 12.000,00; quantidade_parcelas=60; indice_correcao=CUB/SC; validade_tabela=${tableValidUntil}`,
};

class Query {
  constructor(rows) { this.rows = rows; this.filters = []; this.orders = []; this.maxRows = null; }
  select() { return this; }
  eq(column, value) { this.filters.push((row) => row[column] === value); return this; }
  gt(column, value) { this.filters.push((row) => Number(row[column]) > Number(value)); return this; }
  gte(column, value) { this.filters.push((row) => Number(row[column]) >= Number(value)); return this; }
  lte(column, value) { this.filters.push((row) => Number(row[column]) <= Number(value)); return this; }
  in(column, values) { this.filters.push((row) => values.includes(row[column])); return this; }
  order(column, options = {}) { this.orders.push({ column, ascending: options.ascending !== false }); return this; }
  limit(value) { this.maxRows = value; return this; }
  execute() {
    let data = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    for (const order of [...this.orders].reverse()) {
      data = [...data].sort((a, b) => {
        const result = Number(a[order.column]) - Number(b[order.column]);
        return order.ascending ? result : -result;
      });
    }
    if (this.maxRows !== null) data = data.slice(0, this.maxRows);
    return Promise.resolve({ data, error: null });
  }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
  maybeSingle() { return this.execute().then(({ data, error }) => ({ data: data[0] ?? null, error })); }
}
class FakeSupabase {
  constructor(tables) { this.tables = tables; }
  from(name) { return new Query(this.tables[name] ?? []); }
}
const fakeClient = new FakeSupabase({
  developments: [{ id: 'flow', organization_id: 'org', name: 'Flow Aptos', slug: 'flow-aptos', code: 'FLOW', delivery_date: '2027-11-01', active: true }],
  development_typologies: [{ id: 'flow-2s', organization_id: 'org', development_id: 'flow', code: '02', name: '2 suítes', bedrooms: 2, suites: 2, private_area_m2: 62, active: true }],
  development_units: [
    { id: 'f901', organization_id: 'org', development_id: 'flow', typology_id: 'flow-2s', unit_code: '901', floor: 9, status: 'disponivel', list_price: 900000, entry_amount: 180000, installment_count: 60, installment_amount: 4500, payment_plan: { table_reference: '2026-08', indice_correcao: 'CUB/SC' }, price_updated_at: '2026-08-05T10:00:00Z' },
    { id: 'f1301', organization_id: 'org', development_id: 'flow', typology_id: 'flow-2s', unit_code: '1301', floor: 13, status: 'reservado', list_price: 980000, entry_amount: 196000, installment_count: 60, installment_amount: 4900, payment_plan: {}, price_updated_at: '2026-08-05T10:00:00Z' },
  ],
});

await accept(1, 'Primeira mensagem de anúncio apresenta produtos sem triagem', () => {
  const result = enforceNaraTriage(turn({ reply: 'A Bossa tem o Flow, com entrega em 2027, e o Alma, com 30 andares. Viu qual dos dois?' }), baseLead, [{ role: 'user', content: 'Vi um anúncio de vocês' }], {});
  assert.match(result.reply, /Nara.*Bossa/i);
  assert.match(result.reply, /Flow.*Alma/i);
  assert.doesNotMatch(result.reply, /direcionar certinho/i);
});

await accept(2, 'Pedido do menor recebe faixa e permanece frio', () => {
  const result = enforceNaraTriage(turn({ reply: 'No Flow, os valores começam em R$ 900 mil.', score: 72, classification: 'quente' }), baseLead, [{ role: 'user', content: 'Quanto custa o menor?' }], { commercial: generalCommercial });
  assert.equal(result.classification, 'frio');
  assert.ok(result.score <= 20);
  assert.match(result.reply, /R\$ 900 mil/);
});

await accept(3, 'Contato indeciso segue como possível comprador, sem triagem nem transferência', () => {
  const history = [
    { role: 'assistant', content: 'Para eu te direcionar certinho, você está buscando um imóvel para comprar ou precisa falar com a Bossa sobre outro assunto?' },
    { role: 'user', content: 'Não respondi' },
    { role: 'assistant', content: 'Só para eu seguir pelo caminho certo: seu interesse é conhecer um imóvel para comprar ou você precisa de outro atendimento da Bossa?' },
    { role: 'user', content: 'Ainda não sei' },
  ];
  const result = enforceNaraTriage(turn(), baseLead, history, {});
  assert.equal(result.handoff, false);
  assert.doesNotMatch(result.reply, /buscando um imóvel para comprar/i);
  assert.doesNotMatch(result.reply, /interesse é conhecer um imóvel/i);
});

await accept(4, 'Vinte turnos não repetem abertura', () => {
  const history = [];
  const openings = new Set();
  for (let index = 1; index <= 20; index += 1) {
    history.push({ role: 'user', content: `Quero saber sobre a planta ${index}` });
    const processed = postProcessNaraTurn(turn({ reply: `Entendi. A planta ${index} tem uma configuração própria.` }), history);
    const opening = naraReplyOpeningKey(processed.reply);
    assert.ok(opening);
    assert.equal(openings.has(opening), false, `abertura repetida no turno ${index}: ${opening}`);
    openings.add(opening);
    history.push({ role: 'assistant', content: processed.reply });
  }
});

await accept(5, 'Faixa sem intenção passa com origem comprovada', () => {
  const result = enforceNaraTriage(turn({ reply: 'Hoje a faixa do Flow vai de R$ 900 mil a R$ 1,05 milhão.' }), baseLead, [{ role: 'user', content: 'Qual a faixa do Flow?' }], { commercial: generalCommercial });
  assert.match(result.reply, /R\$ 900 mil/);
  assert.equal(result.handoff, false);
});

await accept(6, 'Unidade identificada recebe preço vigente sem exigir finalidade de uso', () => {
  const result = enforceNaraTriage(turn({ reply: 'A unidade 901 do Flow custa R$ 900 mil.' }), baseLead, [{ role: 'user', content: 'Qual o valor da unidade 901 do Flow? Ainda estou pesquisando.' }], { commercial: unitCommercial });
  assert.match(result.reply, /901/);
  assert.match(result.reply, /R\$\s*(?:900 mil|900\.000,00)/);
  assert.doesNotMatch(result.reply, /(?:morar|investir|uso|finalidade)[^?]*\?/i);
  assert.equal(result.handoff, false);
  assert.ok(result.score < 80, 'consulta de preço não comprova intenção de fechar');
});

await accept(7, 'Entrada e parcelas de unidade específica acionam comercial, não simulação automática', () => {
  const reply = 'O 901, 9º andar, custa R$ 900 mil, entrada de R$ 180 mil e 60 parcelas de R$ 12.000. Valor atual, corrigido pelo CUB/SC até a entrega.';
  const message = 'Quero comprar para morar. Como ficam a entrada e as parcelas da unidade 901 do Flow?';
  const result = enforceNaraTriage(turn({ reply, score: 88, classification: 'quente', handoff: false }), baseLead, [{ role: 'user', content: message }], { commercial: unitCommercial });
  assert.equal(result.handoff, true);
  assert.equal(result.classification, 'quente');
  assert.equal(result.stage, 'qualificado');
  assert.match(result.reply, /nossa equipe comercial/i);
  assert.match(result.next_action, /passagem comercial imediata/i);
  assert.ok(result.summary.includes(message));
  assert.doesNotMatch(result.reply, /entrada de R\$|60 parcelas|aprovad[oa]|\?/i);
  const decision = deriveHybridDecision({ lead: baseLead, turn: result, lastUserMessage: message });
  assert.equal(decision.handoffRequired, true);
  assert.equal(decision.stage, 'passagem_pendente');
  assert.equal(decision.priorityClass, 'A1');
});

await accept(8, 'Indisponível retorna vazio e não fabrica escassez', async () => {
  const context = await loadNaraCommercialTurnContext(fakeClient, 'org', baseLead, [{ role: 'user', content: 'A unidade 1301 do Flow está disponível?' }]);
  assert.equal(context?.calls[0]?.result, null);
  assert.equal(hasForbiddenScarcityClaim('Esse apartamento não está disponível. Posso verificar alternativas?'), false);
  assert.equal(hasForbiddenScarcityClaim('Esse apartamento acabou de ser vendido.'), true);
});

await accept(9, 'Pedido de tabela recebe somente curadoria agregada', async () => {
  const context = await loadNaraCommercialTurnContext(fakeClient, 'org', baseLead, [{ role: 'user', content: 'Me manda a tabela completa do Flow' }]);
  assert.equal(context?.calls.length, 1);
  assert.equal(context?.calls[0]?.name, 'faixa_empreendimento');
});

await accept(10, 'Falha da consulta escala sem inventar números', async () => {
  const failing = { from() { throw new Error('database unavailable'); } };
  const context = await loadNaraCommercialTurnContext(failing, 'org', baseLead, [{ role: 'user', content: 'Quanto custa o Flow?' }]);
  assert.ok(context?.error);
  assert.equal(context?.calls.length, 0);
  assert.match(context?.source_text ?? '', /não respondeu|Não informe números/i);
});

await accept(11, 'Vocabulário de corretor bloqueia preço e aciona mudança de pipeline', async () => {
  const message = 'Tenho um cliente e preciso do espelho, comissão, VGV e tabela do Flow.';
  assert.equal(isBrokerRoutingSignal(message), true);
  const context = await loadNaraCommercialTurnContext({ from() { throw new Error('não deveria consultar'); } }, 'org', baseLead, [{ role: 'user', content: message }]);
  assert.equal(context?.blocked_reason, 'corretor');
  assert.equal(context?.calls.length, 0);
});

await accept(12, 'Cliente atual com boleto vai ao pós-venda sem consulta', async () => {
  const context = await loadNaraCommercialTurnContext({ from() { throw new Error('não deveria consultar'); } }, 'org', baseLead, [{ role: 'user', content: 'Já comprei com vocês e preciso da segunda via do boleto.' }]);
  assert.equal(context?.blocked_reason, 'cliente_atual');
  assert.equal(context?.calls.length, 0);
});

await accept(13, 'Venda assistida preserva o corretor e bloqueia condução direta', async () => {
  const message = 'Meu corretor me indicou. Qual o valor do Flow?';
  assert.equal(isAssistedSaleSignal(message), true);
  assert.equal(isBrokerRoutingSignal(message), false);
  const context = await loadNaraCommercialTurnContext({ from() { throw new Error('não deveria consultar'); } }, 'org', baseLead, [{ role: 'user', content: message }]);
  assert.equal(context?.blocked_reason, 'venda_assistida');
  assert.equal(context?.calls.length, 0);
});

await accept(14, 'Pedido de visita permanece com a Nara para consultar a agenda', () => {
  const now = new Date('2026-08-05T12:00:00Z');
  const decision = deriveHybridDecision({ lead: baseLead, turn: turn({ score: 60 }), lastUserMessage: 'Quero agendar uma visita', now });
  assert.equal(decision.handoffRequired, false);
  assert.equal(decision.ownerMode, 'ai');
});

await accept(15, 'Humano ativo não é reassumido pela IA', () => {
  const lead = { ...baseLead, stage: 'humano_ativo', owner_mode: 'human', ai_enabled: false };
  assert.equal(aiCanReply(lead), false);
  const decision = deriveHybridDecision({ lead, turn: turn({ summary: 'Novo resumo da conversa.' }), lastUserMessage: 'Tenho outra dúvida' });
  assert.equal(decision.ownerMode, 'human');
  assert.equal(decision.aiEnabled, false);
  assert.match(decision.noteDescription, /Novo resumo/);
});

await accept(16, 'Falha da OpenAI cria tarefa urgente sem mensagem genérica', async () => {
  const source = await readFile(new URL('../src/lib/whatsapp/aiFailure.ts', import.meta.url), 'utf8');
  assert.match(source, /customer_notified: false/);
  assert.match(source, /priority: 'urgent'/);
  assert.match(source, /owner_mode: 'human'/);
  assert.doesNotMatch(source, /provider\.sendText/);
});

await accept(17, 'Janela de 24 horas bloqueia envio e registra atividade', async () => {
  const source = await readFile(new URL('../src/lib/whatsapp/webhookProcessor.ts', import.meta.url), 'utf8');
  assert.ok(source.indexOf('isCustomerServiceWindowOpen') < source.indexOf('provider.sendText'));
  assert.match(source, /type: 'janela_whatsapp_fechada'/);
});

await accept(18, 'Explicação completa é preservada mesmo com mais de 45 palavras', async () => {
  const reply = 'Podemos comparar as plantas olhando primeiro para a sua rotina: como a família usa a sala, se precisa de um ambiente de trabalho e como prefere organizar a cozinha. Depois, vale observar a circulação entre os ambientes e a posição dos quartos. Assim a comparação fica ligada ao que realmente faz diferença para vocês, sem precisar decidir tudo agora.';
  const history = [
    { role: 'assistant', content: 'Olá! Sou a Nara, da Bossa.' },
    { role: 'user', content: 'Como posso comparar as plantas para a minha família?' },
  ];
  assert.ok(naraReplyWordCount(reply) > 45);
  assert.deepEqual(naraReplyGuardrailViolations(reply), []);
  const result = await enforceNaraReplyGuardrails(turn({ reply }), baseLead, history, {});
  assert.equal(result.reply, reply);
});

await accept(19, 'Duas perguntas úteis não são uma violação automática', async () => {
  const reply = 'Você prefere receber plantas ou fotos? Tem algum ambiente que quer conhecer primeiro?';
  assert.equal(naraReplyQuestionCount(reply), 2);
  assert.deepEqual(naraReplyGuardrailViolations(reply), []);
  const result = await enforceNaraReplyGuardrails(turn({ reply }), baseLead, [
    { role: 'assistant', content: 'Olá! Sou a Nara, da Bossa.' },
    { role: 'user', content: 'Quero conhecer melhor o projeto.' },
  ], {});
  assert.equal(result.reply, reply);
});

await accept(20, 'Pergunta sobre robô oferece humano sem passagem prematura', () => {
  const result = postProcessNaraTurn(turn(), [{ role: 'user', content: 'Você é robô?' }]);
  assert.match(result.reply, /assistente digital da Bossa/i);
  assert.match(result.reply, /pessoa|time/i);
  assert.equal(result.handoff, false);
});

const hybridServer = await readFile(new URL('../src/lib/hybrid-server.ts', import.meta.url), 'utf8');
const webhook = await readFile(new URL('../src/lib/whatsapp/webhookProcessor.ts', import.meta.url), 'utf8');
const simulator = await readFile(new URL('../src/app/api/ai-training/route.ts', import.meta.url), 'utf8');
assert.match(hybridServer, /kind: 'corretor'/);
assert.match(hybridServer, /sale_assisted: true/);
assert.match(hybridServer, /taskDedupeKey: 'handoff:venda-assistida'/);
assert.match(webhook, /loadNaraCommercialTurnContext/);
assert.match(simulator, /loadNaraCommercialTurnContext/);
assert.equal(passed.length, 20);
console.table(passed);
console.log('Fase 10 validada: 20 de 20 casos de aceite aprovados no núcleo compartilhado pelo simulador e pelo WhatsApp.');
