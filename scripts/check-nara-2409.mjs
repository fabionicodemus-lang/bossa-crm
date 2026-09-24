import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { postProcessNaraTurn } from '../src/lib/ai-v120.ts';
import { extractContactTimePreference } from '../src/lib/nara-timezone.ts';
import { detectForeignLead } from '../src/lib/nara-exterior.ts';

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
  assert.match(result.reply, /assin(?:a|ado).*eletronicamente/i);
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
  assert.equal(result.handoff, false);
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

// Rodada 2: espanhol integral + nome + exterior chileno
{
  const history = [{
    role: 'user',
    content: 'Hola, soy Matías, vivo en Santiago de Chile. Vi el Alma y quiero comprar. ¿Puedo comprar desde acá y firmar online?',
  }];
  const detected = detectForeignLead(history);
  assert.equal(detected.livesAbroad, true);
  assert.equal(detected.location, 'Chile');
  assert.equal(detected.requestedCurrency, 'USD');

  const result = postProcessNaraTurn(turn(), history, {
    ...foreignContext,
    foreign: { ...foreignContext.foreign, location: 'Chile' },
  });
  assert.match(result.reply, /Mat[ií]as/i);
  assert.match(result.reply, /Soy Nara, de Bossa/i);
  assert.match(result.reply, /misma validez jur[ií]dica/i);
  assert.match(result.reply, /reales, d[oó]lares o moneda local/i);
  assert.match(result.reply, /Estados Unidos.*Dinamarca.*Portugal.*Chile/i);
  assert.doesNotMatch(result.reply, /\bvoc[eê]\b|\bmorando\b|\bd[aá] sim\b|\bassina\b/i);
}

// Rodada 2: preço no exterior sempre mantém BRL + referência em moeda estrangeira
{
  const history = [
    { role: 'user', content: 'Hola, soy Matías, vivo en Santiago de Chile y me interesa el Flow.' },
    { role: 'assistant', content: 'Perfecto, Matías.' },
    { role: 'user', content: '¿Cuánto cuesta?' },
  ];
  const result = postProcessNaraTurn(turn({ handoff: true }), history, foreignContext);
  assert.match(result.reply, /R\$\s*986\.590/i);
  assert.match(result.reply, /US\$|USD/i);
  assert.match(result.reply, /pago puede hacerse en reales, d[oó]lares o moneda local/i);
  assert.doesNotMatch(result.reply, /tabela oficial.*reais|contrato.*reais/i);
  assert.equal(result.handoff, false);
}

// Rodada 2: material/preço não entrega para humano
{
  const history = [{
    role: 'user',
    content: 'Oi, sou a Camila, de Blumenau, vi o Alma, tem mais fotos?',
  }];
  const result = postProcessNaraTurn(turn({
    reply: 'Claro, vou te enviar a fachada do Alma.',
    handoff: true,
    attachment_ids: ['fachada-alma'],
  }), history, {
    files: [{
      id: 'fachada-alma',
      category: 'imagem',
      title: 'Fachada Alma',
      description: 'Fachada do empreendimento',
      trigger_keywords: ['alma', 'fachada', 'fotos'],
      storage_bucket: 'ai-files',
      storage_path: 'alma/fachada.jpg',
      original_name: 'Fachada Alma.jpg',
      mime_type: 'image/jpeg',
    }],
  });
  assert.equal(result.handoff, false);
  assert.match(result.reply, /Camila/i);
  assert.match(result.reply, /Nara.*Bossa/i);
  assert.equal((result.reply.match(/\?/g) ?? []).length, 1);
}

// Rodada 2: planta genérica não escolhe arquivo arbitrário
{
  const history = [{
    role: 'user',
    content: 'Oi, sou a Camila, vi o Alma. Me manda as plantas?',
  }];
  const files = [{
    id: 'alma-tipo-01',
    category: 'planta',
    title: 'Planta Tipo 01',
    description: null,
    trigger_keywords: ['alma', 'plantas', 'tipo'],
    storage_bucket: 'ai-files',
    storage_path: 'alma/tipo01.jpg',
    original_name: 'Tipo 01.jpg',
    mime_type: 'image/jpeg',
  }];
  const result = postProcessNaraTurn(turn({
    reply: 'Claro, segue a planta.',
    attachment_ids: ['alma-tipo-01'],
  }), history, { files });
  assert.deepEqual(result.attachment_ids, []);
  assert.match(result.reply, /quantas su[ií]tes/i);
  assert.equal(result.handoff, false);
}

// Rodada 2: resposta de suítes não envia planta ambígua; tipo exato envia uma só
{
  const files = [
    {
      id: 'alma-tipo-01',
      category: 'planta',
      title: 'Planta Tipo 01',
      description: null,
      trigger_keywords: ['Alma', 'plantas', 'tipo', '3 suítes'],
      storage_bucket: 'ai-files',
      storage_path: 'alma/tipo01.jpg',
      original_name: 'Tipo 01.jpg',
      mime_type: 'image/jpeg',
    },
    {
      id: 'alma-tipo-02',
      category: 'planta',
      title: 'Plantas Tipo 02',
      description: null,
      trigger_keywords: ['Alma', 'plantas', 'tipo', '3 suítes'],
      storage_bucket: 'ai-files',
      storage_path: 'alma/tipo02.jpg',
      original_name: 'Tipo 02.jpg',
      mime_type: 'image/jpeg',
    },
  ];

  const suiteHistory = [
    { role: 'user', content: 'Vi o Alma e quero ver as plantas.' },
    { role: 'assistant', content: 'Tenho as plantas. Para te enviar a correta, quantas suítes você procura?' },
    { role: 'user', content: '3 suítes' },
  ];
  const suiteResult = postProcessNaraTurn(turn({ attachment_ids: ['alma-tipo-01'] }), suiteHistory, { files });
  assert.deepEqual(suiteResult.attachment_ids, []);
  assert.match(suiteResult.reply, /Tipo 01.*Tipo 02/i);
  assert.equal((suiteResult.reply.match(/\?/g) ?? []).length, 1);

  const typeHistory = [
    ...suiteHistory,
    { role: 'assistant', content: suiteResult.reply },
    { role: 'user', content: 'Tipo 01' },
  ];
  const typeResult = postProcessNaraTurn(turn(), typeHistory, { files });
  assert.deepEqual(typeResult.attachment_ids, ['alma-tipo-01']);
  assert.doesNotMatch(typeResult.reply, /Tipo 02/i);
  assert.equal(typeResult.handoff, false);
}

// Rodada 2: localização do Alma traz Maps e material de localização sem handoff
{
  const history = [{
    role: 'user',
    content: 'Oi, sou a Camila, vi o Alma. Onde fica? Me manda a localização.',
  }];
  const result = postProcessNaraTurn(turn(), history, {
    files: [{
      id: 'localizacao-alma',
      category: 'imagem',
      title: 'LOCALIZAÇÃO ALMA',
      description: null,
      trigger_keywords: ['localização', 'Alma', 'mapa', 'vista'],
      storage_bucket: 'ai-files',
      storage_path: 'alma/localizacao.jpg',
      original_name: 'LOCALIZAÇÃO ALMA.JPG',
      mime_type: 'image/jpeg',
    }],
  });
  assert.match(result.reply, /google\.com\/maps\/search/i);
  assert.deepEqual(result.attachment_ids, ['localizacao-alma']);
  assert.equal(result.handoff, false);
  assert.equal((result.reply.match(/\?/g) ?? []).length, 1);
}

// Fonte única de preço e fatos não confirmados
{
  const aiSource = await readFile(new URL('../src/lib/ai.ts', import.meta.url), 'utf8');
  const webhookSource = await readFile(new URL('../src/lib/whatsapp/webhookProcessor.ts', import.meta.url), 'utf8');
  const trainingRoute = await readFile(new URL('../src/app/api/ai-training/route.ts', import.meta.url), 'utf8');
  const promptMigration = await readFile(new URL('../supabase/migrations/037_nara_prompt_2409.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(aiSource, /recordText\(context\.config\?\.knowledge\),\s*\n\s*context\.commercial/);
  assert.match(aiSource, /context\.foreign\?\.source_text/);
  assert.match(promptMigration, /REGRAS OPERACIONAIS 24\/09/);
  assert.match(promptMigration, /Preço, entrada, parcela e disponibilidade vêm SOMENTE da tabela viva/);
  assert.doesNotMatch(webhookSource, /metadata:\s*\{\s*\.\.\.\(lead\.metadata/);
  assert.match(webhookSource, /nara_offer_logs'\)\.delete\(\)\.eq\('lead_id'/);
  assert.match(webhookSource, /replyAfterAttachmentDelivery/);
  assert.match(webhookSource, /from '@\/lib\/ai-v120'/);
  assert.match(trainingRoute, /from '@\/lib\/ai-v120'/);
}

console.log('Nara 24/09 rodada 2 validada: reset, espanhol, exterior, preço, materiais, plantas, localização e handoff.');
