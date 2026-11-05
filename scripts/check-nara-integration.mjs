// Exercise the real core + ai-v120 post-processing + final commercial gate.
// All people, prices and documents below are synthetic. The fetch transport is
// mocked before execution; the test never contacts OpenAI, a database or WhatsApp.
import assert from 'node:assert/strict';
import { generateAiTurn } from '../src/lib/ai-v120.ts';
import {
  enforceNaraReplyGuardrails,
  isUnverifiedCommercialFile,
  naraReplyQuestionCount,
  naraReplyWordCount,
  openAiSettings,
} from '../src/lib/ai.ts';

const envKeys = [
  'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_MODEL_LIGHT',
  'OPENAI_MODEL_FALLBACK', 'OPENAI_REASONING_EFFORT',
  'OPENAI_VERBOSITY', 'OPENAI_MAX_OUTPUT_TOKENS', 'OPENAI_TIMEOUT_MS',
];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
let unexpectedNetworkCalls = 0;
const passed = [];
const failures = [];

const lead = {
  id: 'integration-lead', organization_id: 'integration-org', kind: 'cliente',
  name: 'Contato de teste', phone: '5547999990000', enterprise: 'Flow Aptos',
  stage: 'ia', owner_mode: 'ai', ai_enabled: true, opt_out: false,
  automation_paused: false, metadata: {}, source: 'integration-test',
};
const user = (content) => ({ role: 'user', content });
const assistant = (content) => ({ role: 'assistant', content });
const conversation = (latest) => [
  user('Estou conhecendo o Flow.'),
  assistant('Olá! Sou a Nara, da Bossa. Podemos conversar sobre o Flow.'),
  user(latest),
];
const aiTurn = (reply, attachmentIds = []) => ({
  reply, classification: 'morno', score: 45, stage: 'ia',
  summary: 'Cenário sintético de integração.', next_action: 'Responder à dúvida.',
  handoff: false, attachment_ids: attachmentIds,
  extracted: {
    enterprise: 'Flow Aptos', purpose: '', typology: '', budget: '', deadline: '',
    decision_maker: '', company: '', creci: '', region: '', client_status: '',
  },
});

function currentCommercial() {
  const consultedAt = new Date().toISOString();
  const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // Integer cents: 234,567.89 + 60*10,000 + 4*50,000 + 200,000 = 1,234,567.89.
  const components = [
    { tipo: 'entrada', quantidade: 1, valor_unitario_centavos: 23456789, total_centavos: 23456789 },
    { tipo: 'mensal', quantidade: 60, valor_unitario_centavos: 1000000, total_centavos: 60000000 },
    { tipo: 'reforco', quantidade: 4, valor_unitario_centavos: 5000000, total_centavos: 20000000 },
    { tipo: 'chaves', quantidade: 1, valor_unitario_centavos: 20000000, total_centavos: 20000000 },
  ];
  const totalCents = components.reduce((sum, component) => sum + component.total_centavos, 0);
  assert.equal(totalCents, 123456789);
  return {
    status: 'ok', consulted_at: consultedAt, source_table: 'development_units',
    calls: [{
      name: 'consultar_apartamento', arguments: { empreendimento: 'Flow', unidade: '1602' },
      result: {
        empreendimento_id: 'integration-development', unidade_id: 'integration-unit',
        moeda: 'BRL', empreendimento: 'Flow Aptos', unidade: '1602', andar: 16,
        tipologia: 'Duplex de teste', valor: 1234567.89, entrada: 234567.89,
        parcela_media: 10000, quantidade_parcelas: 60,
        indice_correcao: 'CUB durante a obra; IPCA após as chaves',
        validade_tabela: validUntil, referencia_tabela: 'integration-current',
        preco_atualizado_em: consultedAt,
        plano_pagamento: {
          status: 'complete', componentes: components,
          total_composto_centavos: totalCents, diferenca_centavos: 0,
          indice_correcao: 'CUB durante a obra; IPCA após as chaves',
          juros: '0,59% ao mês após as chaves',
        },
      },
    }],
    source_text: 'Consulta sintética vigente: Flow Aptos, unidade 1602, valor R$ 1.234.567,89. Os campos estruturados determinam as condições.',
  };
}

function responseEnvelope(model, turn, sequence) {
  return {
    id: `response-integration-${sequence}`, model, status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(turn) }] }],
    usage: {
      input_tokens: 1200, output_tokens: 256,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 64 },
    },
  };
}

function assertRequestContract(request) {
  assert.equal(request.reasoning?.effort, 'medium');
  assert.equal(request.text?.verbosity, 'low');
  assert.equal(request.text?.format?.type, 'json_schema');
  assert.equal(request.text?.format?.strict, true);
  assert.equal(request.text?.format?.schema?.additionalProperties, false);
  assert.equal(request.store, false);
  assert.equal(Object.hasOwn(request, 'temperature'), false);
  assert.equal(Object.hasOwn(request, 'top_p'), false);
}

async function runScenario({ history, context = {}, output, failPrimary = false, modelOverride = null }) {
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(init?.method, 'POST');
    const destination = new URL(String(url));
    assert.equal(destination.origin, 'https://api.openai.com', 'unexpected destination is blocked by the mock');
    const body = JSON.parse(String(init.body));
    requests.push({ path: destination.pathname, body });
    if (destination.pathname === '/v1/responses/input_tokens') {
      return Response.json({ input_tokens: 1200 });
    }
    assert.equal(destination.pathname, '/v1/responses', 'unexpected endpoint is blocked by the mock');
    assertRequestContract(body);
    if (failPrimary && body.model === 'gpt-6.1-sol') {
      return Response.json({ error: { message: 'Simulated primary failure.' } }, { status: 503 });
    }
    return Response.json(responseEnvelope(body.model, output, requests.length));
  };
  try {
    const result = await generateAiTurn(lead, history, {
      ...context, ...(modelOverride ? { model_override: modelOverride } : {}),
    });
    assert.ok(result, 'the real wrapper must return a turn');
    // A final enforcement pass is idempotent and does not generate another reply.
    const finalPass = await enforceNaraReplyGuardrails(structuredClone(result), lead, history, context);
    assert.deepEqual(finalPass, result, 'a repeated final gate must preserve reply, handoff, classification, briefing, attachments and usage metadata');
    const generations = requests.filter((request) => request.path === '/v1/responses');
    const counts = requests.filter((request) => request.path === '/v1/responses/input_tokens');
    assert.equal(counts.length, generations.length);
    if (!failPrimary) {
      assert.equal(generations.length, 1, 'post-processing must not ask a model to shorten/rewrite the answer');
      assert.equal(generations[0].body.model, modelOverride || 'gpt-6.1-sol');
      assert.equal(result.model_used, modelOverride || 'gpt-6.1-sol');
      assert.equal(result.usage_records?.length, 1);
      assert.equal(result.usage_records[0].fallback_used, false);
    }
    return { result, generations };
  } finally {
    globalThis.fetch = previousFetch;
  }
}

async function accept(title, run) {
  try {
    await run();
    passed.push(title);
    console.log(`✓ ${title}`);
  } catch (error) {
    failures.push({ title, error });
    console.error(`✗ ${title}\n${error instanceof Error ? error.stack : String(error)}`);
  }
}

try {
  for (const key of envKeys) delete process.env[key];
  process.env.OPENAI_API_KEY = 'integration-test-key-never-sent';
  globalThis.fetch = async () => {
    unexpectedNetworkCalls += 1;
    throw new Error('External transport is disabled in this integration test.');
  };

  await accept('Defaults reais: Sol 6.1, fallback Luna, raciocínio medium e texto low', async () => {
    const settings = openAiSettings();
    assert.equal(settings.primary, 'gpt-6.1-sol');
    assert.equal(settings.fallback, 'gpt-6-luna');
    assert.equal(settings.reasoningEffort, 'medium');
    assert.equal(settings.verbosity, 'low');
  });

  await accept('Fluxo completo preserva explicação longa e duas perguntas com uma geração', async () => {
    const reply = 'Para comparar as plantas, olhe como sua família usa a sala, se gosta de cozinhar junto e se precisa de um canto tranquilo para trabalhar. Depois, observe a circulação entre os ambientes e a posição dos quartos. Essas escolhas ajudam a entender o que combina com a rotina de vocês, sem precisar decidir tudo agora. Você costuma receber amigos em casa? Precisa de um espaço de trabalho separado?';
    assert.ok(naraReplyWordCount(reply) > 45);
    assert.equal(naraReplyQuestionCount(reply), 2);
    const { result } = await runScenario({
      history: conversation('Estou comparando a distribuição dos ambientes. Pode explicar o que observar para a rotina da família?'),
      output: aiTurn(reply),
    });
    assert.equal(result.reply, reply);
    assert.equal(naraReplyQuestionCount(result.reply), 2);
  });

  await accept('Comparação A/B permite Terra só no simulador, sem alterar o padrão Sol', async () => {
    const { result, generations } = await runScenario({
      history: conversation('Me mostre o Flow para minha família.'),
      modelOverride: 'gpt-6.1-terra',
      output: aiTurn('O Flow tem opções de duas e três suítes. Posso explicar as plantas para sua família.'),
    });
    assert.equal(result.model_used,'gpt-6.1-terra');
    assert.deepEqual(generations.map((request)=>request.body.model),['gpt-6.1-terra']);
    assert.equal(openAiSettings().primary,'gpt-6.1-sol');
  });

  await accept('Orçamento de R$ 900 mil não autoriza o preço da unidade', async () => {
    const { result } = await runScenario({
      history: conversation('Tenho R$ 900 mil. Qual é o preço da unidade 1602 do Flow?'),
      context: { commercial: currentCommercial() },
      output: aiTurn('A unidade 1602 do Flow custa R$ 900 mil.'),
    });
    assert.match(result.reply, /R\$\s*1\.234\.567,89/);
    assert.match(result.reply, /1602/);
    assert.doesNotMatch(result.reply, /(?:custa|preço|valor)[^.!?\n]*R\$\s*(?:900 mil|900\.000(?:,00)?)/i);
  });

  await accept('Pergunta de pagamento passa ao humano e descarta condições inventadas, mesmo com plano válido no CRM', async () => {
    const { result } = await runScenario({
      history: conversation('Qual é o preço e como funciona o pagamento da unidade 1602 do Flow?'),
      context: { commercial: currentCommercial() },
      output: aiTurn('A unidade 1602 custa R$ 1.234.567,89. Consigo sem juros, sem correção e com desconto garantido.'),
    });
    assert.equal(result.handoff, true);
    assert.equal(result.stage, 'qualificado');
    assert.equal(result.classification, 'quente');
    assert.ok(result.score >= 60);
    assert.match(result.reply, /nossa equipe comercial/i);
    assert.match(result.next_action, /passagem comercial imediata/i);
    assert.match(result.summary, /pagamento da unidade 1602 do Flow/);
    assert.doesNotMatch(result.reply, /sem juros|sem correção|desconto garantido|Entrada:\s*R\$|Parcelas mensais:|Reforços:|Nas chaves:|\?/i);
  });

  await accept('Entrada declarada passa imediatamente mesmo sem consulta e fica no briefing, não em oferta aprovada', async () => {
    const message = 'Consigo dar R$ 200 mil de entrada e pagar R$ 8 mil por mês no Flow. Pode montar uma proposta?';
    const { result } = await runScenario({
      history: conversation(message),
      output: aiTurn('Está aprovado: entrada de R$ 200 mil e R$ 8 mil por mês, sem correção.'),
    });
    assert.equal(result.handoff, true);
    assert.equal(result.stage, 'qualificado');
    assert.equal(result.classification, 'quente');
    assert.match(result.reply, /avaliar sua proposta/i);
    assert.match(result.next_action, /passagem comercial imediata/i);
    assert.ok(result.summary.includes(message), 'the exact declared proposal must reach the human briefing');
    assert.doesNotMatch(result.reply, /est[aá] aprovado|aceitamos|sem corre[cç][aã]o|fica em|\?/i);
    assert.equal((result.reply.match(/nossa equipe comercial/gi) ?? []).length, 1, 'repeated gates must not append duplicate handoff messages');
  });

  await accept('Resposta curta à pergunta financeira mantém handoff e gates idempotentes', async () => {
    const history = [
      user('Quero conhecer o Flow.'),
      assistant('Qual valor você considera dar de entrada?'),
      user('200 mil.'),
    ];
    const { result } = await runScenario({ history, output: aiTurn('Ótimo! E qual o prazo para comprar?') });
    assert.equal(result.handoff, true);
    assert.equal(result.stage, 'qualificado');
    assert.equal(result.classification, 'quente');
    assert.match(result.next_action, /passagem comercial imediata/i);
    assert.match(result.summary, /200 mil/);
    assert.doesNotMatch(result.reply, /\?|aprovad[oa]|aceitamos/i);
  });

  await accept('Recusa explícita preserva atendimento por mensagem, sem negociar nem autorizar contato humano', async () => {
    const { result } = await runScenario({
      history: conversation('Tenho R$ 200 mil para entrada, mas não me encaminhe para ninguém agora.'),
      output: { ...aiTurn('Vou chamar o comercial agora, já aprovaram sua entrada.'), handoff: true, classification: 'quente', score: 85 },
    });
    assert.equal(result.handoff, false);
    assert.equal(result.stage, 'ia');
    assert.equal(result.classification, 'morno');
    assert.ok(result.score <= 59);
    assert.match(result.reply, /sem te encaminhar/i);
    assert.match(result.next_action, /respeitar a recusa/i);
    assert.doesNotMatch(result.reply, /vou chamar|j[aá] aprovaram|aceitamos|\?/i);
  });

  await accept('Duas falhas no Sol acionam Luna, preservando passagem financeira e metadados corretos', async () => {
    const { result, generations } = await runScenario({
      history: conversation('Qual é o preço e a condição de pagamento da unidade 1602 do Flow?'),
      context: { commercial: currentCommercial() }, failPrimary: true,
      output: aiTurn('A unidade 1602 custa R$ 900 mil, sem juros e com desconto de 20% aprovado.'),
    });
    assert.deepEqual(generations.map((request) => request.body.model), ['gpt-6.1-sol', 'gpt-6.1-sol', 'gpt-6-luna']);
    assert.equal(result.model_used, 'gpt-6-luna');
    assert.equal(result.usage_records?.length, 1);
    assert.equal(result.usage_records[0].model, 'gpt-6-luna');
    assert.equal(result.usage_records[0].fallback_used, true);
    assert.equal(result.usage_records[0].request_kind, 'response');
    assert.equal(result.handoff, true);
    assert.equal(result.stage, 'qualificado');
    assert.match(result.reply, /nossa equipe comercial/i);
    assert.match(result.next_action, /passagem comercial imediata/i);
    assert.match(result.summary, /condi[cç][aã]o de pagamento da unidade 1602/);
    assert.doesNotMatch(result.reply, /R\$\s*900|sem juros|20%|desconto[^.!?]*aprovado|Parcelas mensais:|\?/i);
  });

  await accept('Consulta indisponível não reaproveita valor antigo da própria Nara', async () => {
    const history = [
      ...conversation('Quanto custa a unidade 1602 do Flow?'),
      assistant('A unidade 1602 custa R$ 850 mil.'),
      user('Pode confirmar esse valor da unidade 1602 do Flow?'),
    ];
    const { result } = await runScenario({
      history,
      context: { commercial: {
        status: 'error', consulted_at: new Date().toISOString(), source_table: 'development_units',
        calls: [], error: 'Synthetic lookup failure.',
        source_text: 'Consulta indisponível. Um texto antigo mencionava R$ 850 mil; isso não é uma oferta vigente.',
      } },
      output: aiTurn('Sim, o valor da unidade 1602 continua sendo R$ 850 mil.'),
    });
    assert.doesNotMatch(result.reply, /R\$|850 mil|850\.000/);
    assert.match(result.reply, /não consegui confirmar|precisa.*confirma|pode confirmar/i);
    assert.doesNotMatch(result.reply, /vendid|reservad/i);
  });

  await accept('Tabela/proposta sem versão são bloqueadas; a planta continua disponível', async () => {
    const file = (id, category, title, originalName) => ({
      id, category, title, description: null, trigger_keywords: ['Flow', category],
      storage_bucket: 'integration-files', storage_path: `fixtures/${id}`,
      original_name: originalName, mime_type: category === 'planta' ? 'image/jpeg' : 'application/pdf',
    });
    const context = {
      commercial: currentCommercial(),
      files: [
        file('integration-table', 'tabela', 'Tabela comercial Flow sem versão', 'tabela-flow.pdf'),
        file('integration-proposal', 'proposta', 'Proposta Flow sem versão', 'proposta-flow.pdf'),
        file('integration-plan', 'planta', 'Planta Flow Tipo 01 73 m²', 'flow-tipo-01.jpg'),
      ],
    };
    const history = conversation('Pode mandar a planta de 73 m² do Flow e os materiais disponíveis?');
    const output = aiTurn('Separei a planta e os documentos comerciais disponíveis.', ['integration-table', 'integration-proposal', 'integration-plan']);
    const enforced = await enforceNaraReplyGuardrails(structuredClone(output), lead, history, context);
    assert.deepEqual(enforced.attachment_ids, ['integration-plan']);
    const { result } = await runScenario({ history, context, output });
    assert.deepEqual(result.attachment_ids, ['integration-plan']);
  });

  await accept('Separadores e metadados não escondem arquivo comercial nem bloqueiam planta neutra', async () => {
    const file = (id, originalName, overrides = {}) => ({
      id, category: 'outro', title: 'Flow novembro', description: null,
      trigger_keywords: ['Flow'], storage_bucket: 'integration-files',
      storage_path: `fixtures/${id}`, original_name: originalName,
      mime_type: 'application/pdf', ...overrides,
    });
    const commercialFiles = [
      file('underscored-table', 'Tabela_Flow_2026.pdf'),
      file('underscored-proposal', 'proposta_flow.pdf'),
      file('underscored-terms', 'Condições_Comerciais_Alma.pdf'),
      file('underscored-prices', 'Flow_precos.pdf'),
      file('punctuated-terms', 'condições-comerciais.Flow.pdf'),
      file('description-prices', 'informacoes-flow.pdf', {
        description: 'Documento com preços das unidades e condições comerciais.',
      }),
      file('keyword-prices', 'materiais-flow.pdf', {
        trigger_keywords: ['Flow', 'lista_de_precos'],
      }),
      file('neutral-title-commercial-file', 'Flow_preços.pdf', {
        title: 'Planta Flow; consulte a tabela vigente',
      }),
    ];
    for (const document of commercialFiles) {
      assert.equal(isUnverifiedCommercialFile(document), true, document.original_name);
    }
    const plan = file('neutral-plan', 'flow-planta-tipo-01.jpg', {
      category: 'planta', title: 'Planta Flow Tipo 01 73 m²', mime_type: 'image/jpeg',
      description: 'Planta ilustrativa sem preços. Para preços e condições comerciais, consulte a tabela vigente. Contém tabela de áreas e medidas.',
      trigger_keywords: ['Flow', 'planta', 'preço', 'tabela'],
    });
    assert.equal(isUnverifiedCommercialFile(plan), false, 'a neutral cross-reference does not make a floor plan a price list');
    assert.equal(isUnverifiedCommercialFile({
      ...plan, description: 'Planta com preços das unidades e condições comerciais.',
    }), true, 'a floor-plan category does not authorize embedded prices');

    const history = conversation('Pode mandar a planta de 73 m² do Flow e os materiais disponíveis?');
    // Pass through the final enforcement directly and through the complete
    // generator in batches of at most three selected attachments.
    for (let index = 0; index < commercialFiles.length; index += 2) {
      const files = [...commercialFiles.slice(index, index + 2), plan];
      const context = { commercial: currentCommercial(), files };
      const output = aiTurn('Separei os materiais disponíveis.', files.map((document) => document.id));
      const enforced = await enforceNaraReplyGuardrails(structuredClone(output), lead, history, context);
      assert.deepEqual(enforced.attachment_ids, [plan.id]);
      const { result } = await runScenario({ history, context, output });
      assert.deepEqual(result.attachment_ids, [plan.id]);
    }
  });

  assert.equal(unexpectedNetworkCalls, 0);
  assert.equal(failures.length, 0, `Falhas de integração: ${failures.map(({ title }) => title).join('; ')}`);
  console.log(`Integração real da Nara: ${passed.length} cenários aprovados; transporte simulado, nenhum envio externo.`);
} finally {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
}
