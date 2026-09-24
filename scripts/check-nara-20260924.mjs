import assert from 'node:assert/strict';
import {
  enforceNaraOperationalRules,
  enforceNaraTriage,
  extractSelfReportedName,
} from '../src/lib/ai.ts';
import { convertLocalClockToBrasilia } from '../src/lib/nara-timezone.ts';

const passed = [];
function ok(number, title, run) {
  run();
  passed.push({ number, title });
}

const baseLead = {
  id: 'lead', organization_id: 'org', kind: 'cliente', name: 'Teste', phone: '5547999999999',
  stage: 'novo_triagem', owner_mode: 'ai', ai_enabled: true, opt_out: false,
  automation_paused: false, enterprise: null, metadata: {}, reactivation_at: null,
  handoff_requested_at: null, owner_id: null, backup_owner_id: null,
};

function turn(overrides = {}) {
  return {
    reply: 'Resposta do modelo.',
    classification: 'morno',
    score: 45,
    stage: 'ia',
    summary: 'Resumo.',
    next_action: 'Continuar.',
    handoff: false,
    attachment_ids: [],
    extracted: {
      enterprise: '',
      purpose: '',
      typology: '',
      budget: '',
      deadline: '',
      decision_maker: '',
      company: '',
      creci: '',
      region: '',
      client_status: '',
      payment_method: '',
      preferred_contact_time_local: '',
      preferred_contact_time_brasilia: '',
    },
    ...overrides,
  };
}

const dynamic = {
  values: {},
  missing: [],
  schema_ready: true,
  updated_at: null,
  generated_at: '2026-09-24T15:00:00-03:00',
  local_date_time: 'quinta-feira, 24 de setembro de 2026 às 15:00',
  timezone: 'America/Sao_Paulo',
  prior_offers: [],
  offer_log_ready: true,
  commercial_sla: {
    is_open: true,
    response_minutes: 10,
    owner_name: 'Taís',
    next_open_label: null,
    timezone: 'America/Sao_Paulo',
  },
  preferred_contact: null,
  source_text: 'SLA COMERCIAL CONFIRMADO: retorno em até 10 minutos por Taís.',
};

const fxCommercial = {
  consulted_at: '2026-09-24T18:00:00Z',
  source_table: 'development_units',
  calls: [],
  source_text: [
    '[faixa_empreendimento] empreendimento=Flow Aptos; valor_minimo=R$ 986.590,00; valor_maximo=R$ 1.441.611,25; entrada_minima=R$ 197.318,00; qtd_disponiveis=10',
    '[cambio_ptax]; moeda=USD; cotacao_venda_brl_por_moeda=5.48; data_cotacao=2026-09-24; valor_brl=986590.00; valor_aproximado=US$ 180.000; fonte=Banco Central do Brasil PTAX; observacao=conversão aproximada para referência; a tabela oficial do imóvel é em reais',
  ].join('\n'),
};

function context(overrides = {}) {
  return {
    config: { persona: { name: 'Nara' }, knowledge: {}, first_message: '', active: true },
    examples: [],
    files: [],
    dynamic,
    ...overrides,
  };
}

ok(1, 'Lead no exterior compra e assina sem vir ao Brasil', () => {
  const history = [
    { role: 'user', content: 'Oi, sou a Juliana. Moro em Orlando há 9 anos.' },
    { role: 'assistant', content: 'Oi, Juliana! Aqui é a Nara, da Bossa.' },
    { role: 'user', content: 'Dá pra comprar morando fora? Como pago? Preciso ir aí assinar o contrato?' },
  ];
  const result = enforceNaraOperationalRules(turn(), history, context());
  assert.match(result.reply, /comprar morando fora/i);
  assert.match(result.reply, /assinar eletronicamente/i);
  assert.match(result.reply, /não precisa vir ao Brasil/i);
  assert.match(result.reply, /reais, dólar ou moeda local/i);
  assert.match(result.reply, /EUA, Dinamarca, Portugal e Chile/i);
  assert.doesNotMatch(result.reply, /vou verificar|confirmar com o comercial/i);
});

ok(2, 'Valor em dólar usa preço atual e PTAX, sem chute', () => {
  const history = [
    { role: 'user', content: 'Moro em Orlando e quero comprar um apartamento.' },
    { role: 'assistant', content: 'Consigo te ajudar com isso.' },
    { role: 'user', content: 'Quanto fica em dólar?' },
  ];
  const result = enforceNaraOperationalRules(turn(), history, context({ commercial: fxCommercial }));
  assert.match(result.reply, /R\$\s*986\.590,00/);
  assert.match(result.reply, /US\$\s*180\.000/);
  assert.match(result.reply, /PTAX/);
  assert.match(result.reply, /tabela oficial é em reais/i);
});

ok(3, 'Anúncio + interesse + nome não volta para triagem', () => {
  const history = [{ role: 'user', content: 'Vi o anúncio e me interessei, sou a Juliana' }];
  const triaged = enforceNaraTriage(
    turn({ reply: 'Para eu te direcionar certinho: você está buscando um imóvel para comprar ou precisa falar com a Bossa sobre outro assunto?' }),
    baseLead,
    history,
    context(),
  );
  const result = enforceNaraOperationalRules(triaged, history, context());
  assert.match(result.reply, /Juliana/);
  assert.match(result.reply, /Nara.*Bossa/i);
  assert.doesNotMatch(result.reply, /buscando um imóvel para comprar|outro assunto/i);
  assert.equal(extractSelfReportedName(history[0].content), 'Juliana');
});

ok(4, 'Pedido de humano em conversa de compra passa direto e qualifica sem bloquear', () => {
  const history = [
    { role: 'user', content: 'Sou o Rodrigo, vi o anúncio e quero entender o preço do Flow.' },
    { role: 'assistant', content: 'Hoje a faixa do Flow começa em R$ 986 mil.' },
    { role: 'user', content: 'Prefiro falar com uma pessoa de verdade. Tem algum corretor aí?' },
  ];
  const result = enforceNaraOperationalRules(
    turn({ reply: 'Qual assunto você precisa tratar: compra, cliente atual, financeiro, obra ou outro?' }),
    history,
    context(),
  );
  assert.equal(result.handoff, true);
  assert.match(result.reply, /Taís|comercial/i);
  assert.match(result.reply, /10 minutos/i);
  assert.doesNotMatch(result.reply, /qual assunto|cliente atual|financeiro|obra/i);
  assert.ok((result.reply.match(/\?/g) ?? []).length <= 1);
});

ok(5, 'Pergunta de espera usa SLA do playbook', () => {
  const history = [
    { role: 'user', content: 'Sou o Rodrigo, quero comprar no Flow.' },
    { role: 'assistant', content: 'Já estou chamando a Taís.' },
    { role: 'user', content: 'Ok, e demora muito?' },
  ];
  const result = enforceNaraOperationalRules(turn(), history, context());
  assert.match(result.reply, /Taís te chama em até 10 minutos/i);
  assert.doesNotMatch(result.reply, /não consigo estimar/i);
});

ok(6, 'Pergunta fora da base recebe fallback relacionado à dúvida', () => {
  const history = [
    { role: 'user', content: 'Quero comprar um apartamento.' },
    { role: 'assistant', content: 'Te explico as opções.' },
    { role: 'user', content: 'Vocês cuidam do aluguel do imóvel para mim?' },
  ];
  const result = enforceNaraOperationalRules(
    turn({ reply: 'Ainda não tenho confirmação do envio desse material. O comercial poderá verificar o pedido.' }),
    history,
    context(),
  );
  assert.match(result.reply, /gestão do aluguel/i);
  assert.match(result.reply, /Taís|comercial/i);
  assert.doesNotMatch(result.reply, /envio desse material/i);
});

ok(7, 'Depois de uma passagem o fallback continua contextual', () => {
  const history = [
    { role: 'user', content: 'Quero comprar no Flow.' },
    { role: 'assistant', content: 'Já estou chamando a Taís; ela recebe o histórico.' },
    { role: 'user', content: 'E vocês cuidam do aluguel depois?' },
  ];
  const result = enforceNaraOperationalRules(
    turn({ reply: 'Ainda não tenho confirmação do envio desse material. O comercial poderá verificar o pedido.', handoff: true }),
    history,
    context(),
  );
  assert.match(result.reply, /gestão do aluguel/i);
  assert.doesNotMatch(result.reply, /envio desse material/i);
});

ok(8, 'Orlando 18h vira Brasília 19h em setembro com DST real', () => {
  const converted = convertLocalClockToBrasilia({
    sourceTimeZone: 'America/New_York',
    hour: 18,
    minute: 0,
    referenceDate: new Date('2026-09-24T16:00:00Z'),
  });
  assert.equal(converted.hour, 19);
  assert.equal(converted.minute, 0);
});

ok(9, 'Aceitação de material não repete pergunta', () => {
  const materialContext = context({
    files: [{
      id: 'flow-folder',
      category: 'book',
      title: 'Folder Flow Aptos',
      description: null,
      trigger_keywords: ['Book', 'material', 'folder', 'Flow'],
      storage_bucket: 'ai-files',
      storage_path: 'flow.pdf',
      original_name: 'FLOW.pdf',
      mime_type: 'application/pdf',
    }],
  });
  const history = [
    { role: 'user', content: 'Quero saber do Flow.' },
    { role: 'assistant', content: 'Quer que eu te mande o folder do Flow?' },
    { role: 'user', content: 'ok' },
  ];
  const result = enforceNaraOperationalRules(turn({ reply: 'Você quer o folder?' }), history, materialContext);
  assert.deepEqual(result.attachment_ids, ['flow-folder']);
  assert.match(result.reply, /mando agora/i);
  assert.equal((result.reply.match(/\?/g) ?? []).length, 0);
});

assert.equal(passed.length, 9);
console.table(passed);
console.log('Regressões de 24/09 validadas: 9 de 9 casos aprovados.');
