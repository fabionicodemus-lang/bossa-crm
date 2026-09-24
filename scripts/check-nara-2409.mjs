import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { postProcessNaraTurn } from '../src/lib/ai-v120.ts';
import { extractContactTimePreference } from '../src/lib/nara-timezone.ts';

function turn(overrides = {}) {
  return {
    reply: 'Vou te ajudar com isso.',
    classification: 'morno',
    score: 45,
    stage: 'ia',
    summary: 'Contato em atendimento.',
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
    },
    ...overrides,
  };
}

const foreignContext = {
  foreign: {
    requested_currency: 'USD',
    lives_abroad: true,
    location: 'Orlando',
    fx: {
      currency: 'USD',
      rate_date: '2026-09-24',
      brl_per_currency: 5.48,
      source: 'BCB PTAX',
      source_timestamp: '2026-09-24T13:00:00-03:00',
    },
    conversions: [{
      development: 'Flow Aptos',
      brl: 986590,
      currency: 'USD',
      foreign: 180034.6715,
    }],
    source_text: 'Flow Aptos: a partir de R$ 986.590 ≈ USD 180.035 pela PTAX de hoje.',
  },
};

const operationalContext = {
  operational: {
    business_timezone: 'America/Sao_Paulo',
    business_days: [1,2,3,4,5],
    business_open: '08:00',
    business_close: '18:00',
    hot_lead_sla_minutes: 10,
    next_business_open: '08:00',
    now_local: '2026-09-24 16:00',
    business_open_now: true,
    next_business_label: 'amanhã às 08:00',
    source_text: 'SLA COMERCIAL CONFIRMADO: até 10 minutos.',
  },
};

// 1. Lead do exterior
{
  const history = [{ role: 'user', content: 'Moro em Orlando, dá pra comprar morando fora? Como pago? Preciso ir aí assinar?' }];
  const result = postProcessNaraTurn(turn(), history, foreignContext);
  assert.match(result.reply, /d[aá] sim/i);
  assert.match(result.reply, /assina eletronicamente/i);
  assert.match(result.reply, /validade jur[ií]dica/i);
  assert.match(result.reply, /reais, d[oó]lar ou moeda local/i);
  assert.match(result.reply, /EUA.*Dinamarca.*Portugal.*Chile/i);
  assert.doesNotMatch(result.reply, /vou verificar|comercial.*verificar/i);
}

// 2. Valor em dólar vem pronto do sistema
{
  const history = [
    { role: 'user', content: 'Moro em Orlando e gostei do Flow.' },
    { role: 'assistant', content: 'O Flow é uma das opções em Porto Belo.' },
    { role: 'user', content: 'Quanto fica em dólar?' },
  ];
  const result = postProcessNaraTurn(turn(), history, foreignContext);
  assert.match(result.reply, /R\$\s*986\.590/i);
  assert.match(result.reply, /US\$|USD|d[oó]lar/i);
  assert.match(result.reply, /PTAX/i);
  assert.match(result.reply, /refer[eê]ncia cambial/i);
}

// 3. Interesse claro + nome
{
  const history = [{ role: 'user', content: 'Vi o anúncio e me interessei, sou a Juliana' }];
  const result = postProcessNaraTurn(
    turn({ reply: 'Oi! Aqui é a Nara, da Bossa. Vi seu interesse no Flow. Você busca para morar ou investir?' }),
    history,
    {},
  );
  assert.match(result.reply, /Juliana/i);
  assert.doesNotMatch(result.reply, /comprar ou outro assunto|direcionar certinho/i);
}

// 4. Pedido de humano no meio da compra
{
  const history = [
    { role: 'user', content: 'Vi o Flow e gostei. Quanto custa?' },
    { role: 'assistant', content: 'O Flow parte da faixa atual da tabela.' },
    { role: 'user', content: 'Quero falar com um corretor' },
  ];
  const result = postProcessNaraTurn(turn(), history, {});
  assert.equal(result.handoff, true);
  assert.match(result.reply, /Ta[ií]s.*comercial/i);
  assert.doesNotMatch(result.reply, /qual assunto|compra de im[oó]vel, cliente atual/i);
  assert.match(result.reply, /à vista ou parcelado/i);
}

// 5. Tempo de espera usa SLA
{
  const history = [
    { role: 'user', content: 'Quero falar com um corretor' },
    { role: 'assistant', content: 'Já estou chamando a Taís do comercial.' },
    { role: 'user', content: 'Demora muito?' },
  ];
  const result = postProcessNaraTurn(turn(), history, operationalContext);
  assert.match(result.reply, /at[eé] 10 minutos/i);
  assert.doesNotMatch(result.reply, /n[aã]o consigo estimar/i);
}

// 6. Pergunta fora da base recebe fallback contextual
{
  const history = [{ role: 'user', content: 'Vocês cuidam do aluguel depois que eu comprar?' }];
  const result = postProcessNaraTurn(
    turn({ reply: 'Ainda não tenho confirmação do envio desse material. O comercial poderá verificar o pedido.' }),
    history,
    {},
  );
  assert.match(result.reply, /aluguel/i);
  assert.doesNotMatch(result.reply, /confirmação do envio|pedido de material|comercial poderá verificar/i);
  assert.equal(result.handoff, true);
}

// 7. Continua correto depois de uma passagem pendente
{
  const history = [
    { role: 'user', content: 'Vi o Flow e quero comprar.' },
    { role: 'assistant', content: 'Já estou chamando a Taís do comercial. Enquanto isso: você pensa em pagar à vista ou parcelado?' },
    { role: 'user', content: 'Parcelado. E vocês cuidam do aluguel?' },
  ];
  const result = postProcessNaraTurn(
    turn({ reply: 'Ainda não tenho confirmação do envio desse material. O comercial poderá verificar o pedido.', handoff: true, score: 85, classification: 'quente' }),
    history,
    {},
  );
  assert.match(result.reply, /aluguel/i);
  assert.equal(result.handoff, true);
  assert.doesNotMatch(result.reply, /comprar ou outro assunto|confirmação do envio/i);
}

// Orlando 18h em 24/09/2026 = Brasília 19h (DST real via IANA)
{
  const result = extractContactTimePreference('Pode me chamar depois das 18h de Orlando', new Date('2026-09-24T15:00:00Z'));
  assert.ok(result);
  assert.equal(result.city, 'Orlando');
  assert.equal(result.source_timezone, 'America/New_York');
  assert.equal(result.brasilia_time, '19:00');
}

// Oferta de material precisa ser cumprida em resposta vaga positiva
{
  const history = [
    { role: 'user', content: 'Quero ver o Flow' },
    { role: 'assistant', content: 'Te mando a planta do 2 suítes?' },
    { role: 'user', content: 'Sim' },
  ];
  const result = postProcessNaraTurn(turn({ attachment_ids: [] }), history, {
    files: [{
      id: 'planta-flow',
      category: 'planta',
      title: 'Planta Flow 2 suítes',
      description: 'Planta do apartamento',
      trigger_keywords: ['flow', 'planta'],
      storage_bucket: 'ai-files',
      storage_path: 'flow/planta.pdf',
      original_name: 'planta-flow.pdf',
      mime_type: 'application/pdf',
    }],
  });
  assert.deepEqual(result.attachment_ids, ['planta-flow']);
}

// Fonte única de preço e fatos não confirmados
{
  const aiSource = await readFile(new URL('../src/lib/ai.ts', import.meta.url), 'utf8');
  const promptMigration = await readFile(new URL('../supabase/migrations/037_nara_prompt_2409.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(aiSource, /recordText\(context\.config\?\.knowledge\),\s*\n\s*context\.commercial/);
  assert.match(aiSource, /context\.foreign\?\.source_text/);
  assert.match(promptMigration, /REGRAS OPERACIONAIS 24\/09/);
  assert.match(promptMigration, /Preço, entrada, parcela e disponibilidade vêm SOMENTE da tabela viva/);
}

console.log('Nara 24/09 validada: exterior, dólar/PTAX, nome, triagem, humano, SLA, fallback, fuso, material e preço.');
