import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  enforceNaraTriage,
  hasForbiddenScarcityClaim,
  naraReplyGuardrailViolations,
  naraReplyQuestionCount,
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

const generalCommercial = {
  consulted_at: '2026-08-05T12:00:00Z', source_table: 'development_units',
  calls: [{
    name: 'faixa_empreendimento', arguments: { empreendimento: 'Flow' },
    result: { empreendimento: 'Flow Aptos', valor_minimo: 900000, valor_maximo: 1050000, entrada_minima: 180000, qtd_disponiveis: 4 },
  }],
  source_text: '[faixa_empreendimento] empreendimento=Flow Aptos; valor_minimo=R$ 900.000,00; valor_maximo=R$ 1.050.000,00; entrada_minima=R$ 180.000,00; qtd_disponiveis=4',
};
const unitCommercial = {
  consulted_at: '2026-08-05T12:00:00Z', source_table: 'development_units',
  calls: [{
    name: 'consultar_apartamento', arguments: { empreendimento: 'Flow', unidade: '901' },
    result: { empreendimento: 'Flow Aptos', unidade: '901', andar: 9, tipologia: '2 suítes', valor: 900000, entrada: 180000, parcela_media: 4500, quantidade_parcelas: 60, indice_correcao: 'CUB/SC', validade_tabela: '2026-08-31', referencia_tabela: '2026-08', preco_atualizado_em: '2026-08-05T10:00:00Z' },
  }],
  source_text: '[consultar_apartamento] empreendimento=Flow Aptos; unidade=901; andar=9; tipologia=2 suítes; valor=R$ 900.000,00; entrada=R$ 180.000,00; parcela_media=R$ 4.500,00; quantidade_parcelas=60; indice_correcao=CUB/SC; validade_tabela=2026-08-31',
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

await accept(3, 'Duas tentativas de triagem não entram em loop', () => {
  const history = [
    { role: 'assistant', content: 'Para eu te direcionar certinho, você está buscando um imóvel para comprar ou precisa falar com a Bossa sobre outro assunto?' },
    { role: 'user', content: 'Não respondi' },
    { role: 'assistant', content: 'Só para eu seguir pelo caminho certo: seu interesse é conhecer um imóvel para comprar ou você precisa de outro atendimento da Bossa?' },
    { role: 'user', content: 'Ainda não sei' },
  ];
  const result = enforceNaraTriage(turn(), baseLead, history, {});
  assert.equal(result.handoff, true);
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

await accept(6, 'Apartamento específico sem intenção é bloqueado', () => {
  const result = enforceNaraTriage(turn({ reply: 'O 901 custa R$ 900 mil, entrada de R$ 180 mil e parcela de R$ 4.500.', attachment_ids: ['tabela'] }), baseLead, [{ role: 'user', content: 'Qual o valor da unidade 901?' }], { commercial: unitCommercial });
  assert.doesNotMatch(result.reply, /901|900 mil|180 mil|4\.500/);
  assert.deepEqual(result.attachment_ids, []);
  assert.ok(result.score <= 20);
});

await accept(7, 'Apartamento específico com intenção mantém condição completa', () => {
  const reply = 'O 901, 9º andar, custa R$ 900 mil, entrada de R$ 180 mil e parcelas de R$ 4.500. Valor atual, corrigido pelo CUB/SC até a entrega.';
  const result = enforceNaraTriage(turn({ reply, score: 88, classification: 'quente', handoff: true }), baseLead, [{ role: 'user', content: 'Quero comprar para morar. Qual o valor da unidade 901 do Flow?' }], { commercial: unitCommercial });
  assert.ok(result.reply.endsWith(reply));
  assert.match(result.reply, /entrada de R\$ 180 mil/);
  assert.match(result.reply, /parcelas de R\$ 4\.500/);
  assert.match(result.reply, /CUB\/SC/);
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

await accept(14, 'Pedido de visita vira A1 com tarefa em cinco minutos', () => {
  const now = new Date('2026-08-05T12:00:00Z');
  const decision = deriveHybridDecision({ lead: baseLead, turn: turn({ score: 60 }), lastUserMessage: 'Quero agendar uma visita', now });
  assert.equal(decision.priorityClass, 'A1');
  assert.equal(decision.stage, 'passagem_pendente');
  assert.equal(decision.taskPriority, 'urgent');
  assert.equal(decision.taskDueAt, '2026-08-05T12:05:00.000Z');
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

await accept(18, 'Nenhuma resposta passa de 45 palavras', () => {
  const long = Array.from({ length: 46 }, (_, index) => `palavra${index}`).join(' ');
  assert.ok(naraReplyGuardrailViolations(long).includes('mais_de_45_palavras'));
});

await accept(19, 'Nenhuma resposta contém duas perguntas', () => {
  const reply = 'Você prefere o Flow? Quer que eu mande a planta?';
  assert.equal(naraReplyQuestionCount(reply), 2);
  assert.ok(naraReplyGuardrailViolations(reply).includes('mais_de_uma_pergunta'));
});

await accept(20, 'Pergunta sobre robô assume IA e oferece humano', () => {
  const result = postProcessNaraTurn(turn(), [{ role: 'user', content: 'Você é robô?' }]);
  assert.match(result.reply, /assistente digital da Bossa/i);
  assert.match(result.reply, /pessoa|time/i);
  assert.equal(result.handoff, true);
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
