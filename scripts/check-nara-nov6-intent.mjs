// Reproduces the two live-simulator failures found on 2026-11-06 through
// the commercial loader -> actual generateAiTurn -> final guard pipeline.
// All contacts/data are synthetic and every external transport is blocked.
import assert from 'node:assert/strict';
import { generateAiTurn } from '../src/lib/ai-v120.ts';
import { enforceNaraReplyGuardrails } from '../src/lib/ai.ts';
import { financialNegotiationIntent } from '../src/lib/nara-conversation-signals.ts';
import { loadNaraCommercialTurnContext } from '../src/lib/nara-unit-queries.ts';
import { protectNaraCommercialReply } from '../src/lib/nara-commercial-guard.ts';

const user = (content) => ({ role: 'user', content });
const assistant = (content) => ({ role: 'assistant', content });
const lead = {
  id: 'synthetic-nov6-intent', organization_id: 'synthetic-nov6-org',
  kind: 'cliente', name: 'Contato sintético', phone: '5547999990000',
  enterprise: 'Alma Seahouses', stage: 'ia', owner_mode: 'ai',
  ai_enabled: true, opt_out: false, automation_paused: false,
  metadata: { simulador: true }, source: 'local-regression',
};
const duplexHistory = (latest) => [
  user('Disseram que o Alma tem só quatro duplex de 145 e 168 m², pé-direito de cinco metros. É isso?'),
  assistant('O Alma tem duplex de quatro suítes, com plantas de 145 e 168 m². Posso mostrar as plantas.'),
  user(latest),
];
const marketHistory = (latest) => [
  user('Quero investir no Alma. Quanto ele deve valorizar ao ano?'),
  assistant('Não tenho projeção anual confirmada. Seu foco é revender no futuro ou gerar renda com aluguel?'),
  user(latest),
];
const noCurrentOffers = {
  status: 'unavailable', consulted_at: new Date().toISOString(),
  source_table: 'development_units', calls: [],
  source_text: 'Não há oferta comercial confirmada neste teste.',
};
const blankTurn = (reply) => ({
  reply, classification: 'morno', score: 45, stage: 'ia',
  summary: 'Contato sintético pediu informação sobre o Alma.',
  next_action: 'Responder à dúvida, sem negociar.', handoff: false, attachment_ids: [],
  extracted: {
    enterprise: 'Alma Seahouses', purpose: '', typology: '', budget: '',
    deadline: '', decision_maker: '', company: '', creci: '', region: '', client_status: '',
  },
});
class EmptyQuery {
  select() { return this; }
  eq() { return this; }
  gt() { return this; }
  gte() { return this; }
  lte() { return this; }
  in() { return this; }
  order() { return this; }
  limit() { return this; }
  then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); }
  maybeSingle() { return Promise.resolve({ data: null, error: null }); }
}
const originalFetch = globalThis.fetch;
const envKeys = ['OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_MODEL_LIGHT', 'OPENAI_MODEL_FALLBACK', 'OPENAI_TIMEOUT_MS'];
const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
let generated = 0;
let unexpectedTransport = 0;
const passed = [];
const failed = [];

async function scenario(history, reply, options = {}) {
  const reads = [];
  const db = { from(table) { reads.push(table); return new EmptyQuery(); } };
  const commercial = await loadNaraCommercialTurnContext(db, lead.organization_id, lead, history);
  const context = { ...options, commercial };
  const requests = [];
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.origin !== 'https://api.openai.com' || init?.method !== 'POST') {
      unexpectedTransport += 1;
      throw new Error('Unexpected transport blocked by regression harness');
    }
    const body = JSON.parse(String(init.body));
    requests.push({ path: parsed.pathname, body });
    assert.equal(body.model, 'gpt-6.1-sol', 'the regression must keep Sol 6.1');
    if (parsed.pathname === '/v1/responses/input_tokens') return Response.json({ input_tokens: 900 });
    assert.equal(parsed.pathname, '/v1/responses');
    generated += 1;
    return Response.json({
      id: `synthetic-nov6-response-${generated}`, model: body.model, status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(blankTurn(reply)) }] }],
      usage: { input_tokens: 900, output_tokens: 150 },
    });
  };
  const result = await generateAiTurn(lead, history, context);
  assert.ok(result);
  assert.equal(result.model_used, 'gpt-6.1-sol');
  assert.equal(requests.filter((request) => request.path === '/v1/responses').length, 1, 'no extra rewriting model request');
  const repeated = await enforceNaraReplyGuardrails(structuredClone(result), lead, history, context);
  assert.deepEqual(repeated, result, 'the last gate must be idempotent');
  return { result, reads, commercial, requests };
}

async function check(title, run) {
  try {
    await run();
    passed.push(title);
    console.log(`✓ ${title}`);
  } catch (error) {
    failed.push({ title, error });
    console.error(`✗ ${title}\n${error instanceof Error ? error.stack : error}`);
  }
}

try {
  for (const key of envKeys) delete process.env[key];
  process.env.OPENAI_API_KEY = 'synthetic-regression-key-never-sent';
  globalThis.fetch = async () => {
    unexpectedTransport += 1;
    throw new Error('Network disabled in the regression harness');
  };

  const physicalVariants = [
    'No duplex de 145 m², a entrada leva direto à sala ou a um corredor?',
    'No duplex de 145 m², a entrada leva diretamente para a sala?',
    'A entrada do duplex conduz a um corredor?',
    'A entrada desemboca no living?',
    'A entrada de serviço liga à cozinha?',
    'A entrada do apartamento dá acesso à sala?',
    'Qual entrada do apartamento leva diretamente à sala?',
  ];
  for (const latest of physicalVariants) await check(`Entrada física mantém conversa e não consulta preço: ${latest}`, async () => {
    const reply = 'Esse detalhe depende da planta do duplex. Posso mostrar a circulação entre o hall e a sala, mas preciso conferir a planta antes de confirmar o acesso.';
    const history = duplexHistory(latest);
    const { result, reads, commercial } = await scenario(history, reply);
    assert.equal(financialNegotiationIntent(latest, history), false);
    assert.equal(result.handoff, false, 'architectural entrance must not trigger financial handoff');
    assert.equal(result.reply, reply, 'the product answer must not be replaced with a payment script');
    assert.equal(commercial, null);
    assert.deepEqual(reads, []);
  });

  for (const latest of [
    'A entrada leva direto à sala? E qual o valor da entrada do apartamento?',
    'No duplex, a entrada leva à sala. Tenho R$ 200 mil para dar de entrada.',
    'A entrada conduz ao corredor, mas a entrada financeira pode ser de 15%?',
    'Qual a entrada do duplex?',
    'Quanto preciso dar de entrada no apartamento?',
  ]) await check(`Pergunta mista preserva passagem financeira: ${latest}`, async () => {
    const history = duplexHistory(latest);
    const { result } = await scenario(history, 'O acesso precisa de conferência na planta.');
    assert.equal(financialNegotiationIntent(latest, history), true);
    assert.equal(result.handoff, true);
    assert.equal(result.stage, 'qualificado');
    assert.match(result.reply, /equipe comercial/);
    assert.doesNotMatch(result.reply, /(?:aceitamos|aprovad|garantido)/i);
  });

  const marketVariants = [
    ['Se eu comprar um duplex, vai revender mais rápido que os outros?', 'Não dá para garantir que o duplex revenda mais rápido. A liquidez depende do preço pedido e da demanda quando você decidir vender. Podemos comparar as plantas e os diferenciais numa videochamada.'],
    ['O preço pedido influencia na liquidez dos duplex?', 'Sim, a liquidez depende do preço pedido e da procura pelo imóvel. Isso não garante um prazo de revenda.'],
    ['Quanto tempo leva para revender um duplex?', 'O prazo de revenda varia conforme a demanda e o preço de anúncio. Não tenho um prazo garantido para te passar.'],
    ['E a valorização do duplex, tem garantia?', 'Não há valorização garantida. O resultado depende do mercado e do preço de compra, além das características do imóvel.'],
    ['Quanto é a valorização esperada do duplex?', 'Não tenho uma projeção de valorização confirmada. Ela depende das condições do mercado e não é garantida.'],
  ];
  for (const [latest, reply] of marketVariants) await check(`Mercado não vira resposta de preço: ${latest}`, async () => {
    const { result, reads, commercial } = await scenario(marketHistory(latest), reply);
    assert.equal(result.reply, reply);
    assert.equal(result.handoff, false);
    assert.equal(commercial, null, 'market discussion alone must not load apartment quotes');
    assert.deepEqual(reads, []);
    assert.doesNotMatch(result.reply, /confirmar um pre[cç]o vigente|condi[cç][oõ]es aplic[aá]veis/i);
  });

  await check('Preço atual explícito junto de liquidez continua protegido', async () => {
    const { result, reads } = await scenario(marketHistory('O duplex revende rápido? E quanto custa hoje o 2901 do Alma?'),
      'O preço da unidade 2901 é R$ 900 mil e ela tem boa liquidez.');
    assert.ok(reads.length > 0);
    assert.match(result.reply, /confirmar|comercial/i);
    assert.doesNotMatch(result.reply, /R\$\s*900|900 mil/);
  });

  for (const latest of [
    'Se a liquidez depende da procura, qual é o preço do duplex?',
    'A liquidez depende da procura. E o preço do duplex?',
    'Quero comprar um duplex para revender, meu orçamento é R$ 1 milhão.',
  ]) await check(`Discussão de mercado não oculta consulta comercial: ${latest}`, async () => {
    const { result, reads, commercial } = await scenario(marketHistory(latest),
      'O preço da unidade 2901 é R$ 900 mil e ela tem boa liquidez.');
    assert.ok(reads.length > 0, 'a quote or budget alongside resale still needs current inventory');
    assert.notEqual(commercial, null);
    assert.doesNotMatch(result.reply, /R\$\s*900|900 mil/);
  });

  for (const forged of [
    'A revenda depende do mercado. Posso fazer a unidade por R$ 900 mil.',
    'A liquidez depende do preço e conseguimos entrada sem juros.',
  ]) await check(`Proteção não libera oferta inserida em explicação: ${forged}`, async () => {
    const history = marketHistory('Se eu comprar um duplex, vai revender mais rápido que os outros?');
    const protectedResult = protectNaraCommercialReply(forged, history, noCurrentOffers, { enterprise: 'Alma' });
    assert.equal(protectedResult.changed, true);
    assert.doesNotMatch(protectedResult.reply, /R\$\s*900|900 mil|conseguimos entrada sem juros/);
  });

  await check('Prompt legado sem # chega às instruções de generateAiTurn', async () => {
    const marker = 'CONTEUDO_VALIDADO_NOV6: Flow Move tem lavanderia, coworking e academia.';
    const { requests } = await scenario([
      user('Gostaria de conhecer o Flow.'), assistant('Posso explicar o projeto.'),
      user('O que tem no Flow Move?'),
    ], 'O Flow Move reúne lavanderia, coworking e academia.', {
      config: { knowledge: { triagem_pergunta_inicial: `PROMPT FINAL DA NARA\n${marker}` } },
    });
    const generatedRequest = requests.find((request) => request.path === '/v1/responses');
    assert.ok(JSON.stringify(generatedRequest.body.input).includes(marker), 'legacy knowledge must be in the model input, not silently discarded');
  });
  assert.equal(unexpectedTransport, 0);
} finally {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) {
    if (oldEnv[key] === undefined) delete process.env[key];
    else process.env[key] = oldEnv[key];
  }
}

if (failed.length) {
  console.error(`${failed.length} regressão(ões) falharam; ${passed.length} passaram.`);
  process.exitCode = 1;
} else {
  console.log(`${passed.length} regressões Nov/06 aprovadas; Sol simulado, nenhuma chamada externa ou escrita de dados.`);
}
