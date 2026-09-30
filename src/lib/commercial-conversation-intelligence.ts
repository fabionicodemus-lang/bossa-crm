import type { SupabaseClient } from '@supabase/supabase-js';
import { understandInboundMedia } from '@/lib/whatsapp/aiMediaUnderstanding';

type AdminClient = SupabaseClient;

type MessageRow = {
  id: string;
  organization_id: string;
  lead_id: string;
  whatsapp_channel_id: string | null;
  direction: 'in' | 'out';
  sender_kind: string;
  body: string;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
};

type LeadRow = {
  id: string;
  organization_id: string;
  kind: 'cliente' | 'corretor' | 'geral';
  name: string;
  company: string | null;
  enterprise: string | null;
  stage: string;
  owner_id: string | null;
  metadata: Record<string, unknown> | null;
};

type DevelopmentRow = {
  id: string;
  name: string;
  delivery_date: string | null;
};

type UnitRow = {
  id: string;
  development_id: string;
  unit_code: string;
  list_price: number | string;
};

type ProposalAnalysis = {
  meaningful_commercial_conversation: boolean;
  summary: string;
  bossa_proposal_detected: boolean;
  proposal_confidence: number;
  proposal_direction: 'sent_by_bossa' | 'received_by_bossa' | 'none';
  client_name: string;
  broker_company: string;
  development_name: string;
  unit_code: string;
  total_price: number;
  entry_amount: number;
  monthly_count: number;
  monthly_amount: number;
  reinforcement_count: number;
  reinforcement_amount: number;
  keys_amount: number;
  post_keys_adjustment: string;
  notes: string;
};

const SIGNAL_RE = /\bproposta\b|\bcontraproposta\b|\bfluxo\b|\bdesconto\b|\bentrada\b|\bparcela(?:s)?\b|\bbal(?:a|ã)o(?:es)?\b|\breforço(?:s)?\b|\bato\b|\bchaves?\b|\bunidade\s*\d+|\bcliente\b|R\$\s*[\d.]/iu;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function envelope(raw: Record<string, unknown> | null) {
  if (!raw) return null;
  return asRecord(raw.message_echo) ?? asRecord(raw.history_message) ?? raw;
}

function messageType(row: MessageRow) {
  return String(envelope(row.raw_payload)?.type ?? '').toLowerCase();
}

function wasProcessed(row: MessageRow) {
  return typeof row.raw_payload?.bossa_commercial_intelligence_processed_at === 'string';
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]/g, '');
}

function localDate(value: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function brDate(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function outputText(data: unknown) {
  const payload = asRecord(data);
  const output = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(asRecord(item)?.content) ? asRecord(item)?.content as unknown[] : [];
    for (const piece of content) {
      const row = asRecord(piece);
      if (row?.type === 'output_text' && typeof row.text === 'string' && row.text.trim()) {
        return row.text.trim();
      }
    }
  }
  return '';
}

function cleanJson(text: string) {
  return text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function parseAnalysis(text: string): ProposalAnalysis {
  const parsed = JSON.parse(cleanJson(text)) as Partial<ProposalAnalysis>;
  const direction = ['sent_by_bossa', 'received_by_bossa', 'none'].includes(String(parsed.proposal_direction))
    ? parsed.proposal_direction as ProposalAnalysis['proposal_direction']
    : 'none';
  return {
    meaningful_commercial_conversation: Boolean(parsed.meaningful_commercial_conversation),
    summary: String(parsed.summary ?? '').trim(),
    bossa_proposal_detected: Boolean(parsed.bossa_proposal_detected),
    proposal_confidence: Math.max(0, Math.min(1, numberValue(parsed.proposal_confidence))),
    proposal_direction: direction,
    client_name: String(parsed.client_name ?? '').trim(),
    broker_company: String(parsed.broker_company ?? '').trim(),
    development_name: String(parsed.development_name ?? '').trim(),
    unit_code: String(parsed.unit_code ?? '').trim(),
    total_price: numberValue(parsed.total_price),
    entry_amount: numberValue(parsed.entry_amount),
    monthly_count: Math.trunc(numberValue(parsed.monthly_count)),
    monthly_amount: numberValue(parsed.monthly_amount),
    reinforcement_count: Math.trunc(numberValue(parsed.reinforcement_count)),
    reinforcement_amount: numberValue(parsed.reinforcement_amount),
    keys_amount: numberValue(parsed.keys_amount),
    post_keys_adjustment: String(parsed.post_keys_adjustment ?? '').trim(),
    notes: String(parsed.notes ?? '').trim(),
  };
}

async function analyzeConversation(args: {
  lead: LeadRow;
  messages: Array<MessageRow & { intelligenceText: string }>;
  developments: DevelopmentRow[];
  units: UnitRow[];
}): Promise<ProposalAnalysis | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;

  const catalog = args.developments.map((development) => {
    const unitCodes = args.units
      .filter((unit) => unit.development_id === development.id)
      .map((unit) => unit.unit_code)
      .slice(0, 120);
    return `- ${development.name}: unidades ${unitCodes.join(', ')}`;
  }).join('\n');

  const transcript = args.messages.map((message) => {
    const who = message.direction === 'out' ? 'EQUIPE BOSSA' : args.lead.kind === 'corretor' ? 'CORRETOR' : 'CLIENTE';
    return `[${message.id}] [${message.created_at}] ${who}: ${message.intelligenceText}`;
  }).join('\n');

  const prompt = `Você analisa uma conversa comercial da Bossa Empreendimentos para manter o CRM atualizado.

Contato atual:
- Nome: ${args.lead.name}
- Tipo: ${args.lead.kind}
- Imobiliária/empresa atual: ${args.lead.company || 'não informada'}

Empreendimentos Bossa e unidades cadastradas:
${catalog}

Conversa:
${transcript}

Regras obrigatórias:
1. Diferencie uma PROPOSTA DA BOSSA de proposta de concorrente. Ex.: "recebeu proposta no Sun Beach por R$ 950 mil" é informação comercial relevante, mas NÃO deve criar proposta Bossa.
2. Marque bossa_proposal_detected=true somente quando houver condições concretas de preço/fluxo para um empreendimento Bossa, enviadas pela equipe ao contato ou recebidas pela equipe do contato.
3. Pedido de simulação ("consegue fazer proposta?", "e a 1403?") sem condições concretas não é uma nova proposta.
4. Se uma unidade aparece junto de outra unidade que existe somente em um empreendimento, use o contexto para desambiguar, mas não invente.
5. Se houver várias condições na sequência para a mesma negociação, escolha como proposta principal o fluxo mais recente e completo, e explique alternativas em notes.
6. O resumo deve ser factual e útil ao histórico: quem tinha cliente, qual empreendimento/unidade, o que foi enviado/recebido e o desfecho conhecido. Não invente nome do cliente se não apareceu.
7. broker_company só deve ser preenchido se a conversa trouxer evidência clara.
8. Valores numéricos devem ser números puros em reais. Campos desconhecidos = 0 ou string vazia.
9. Responda SOMENTE JSON válido, sem markdown.

Formato:
{
  "meaningful_commercial_conversation": true,
  "summary": "",
  "bossa_proposal_detected": false,
  "proposal_confidence": 0,
  "proposal_direction": "sent_by_bossa|received_by_bossa|none",
  "client_name": "",
  "broker_company": "",
  "development_name": "",
  "unit_code": "",
  "total_price": 0,
  "entry_amount": 0,
  "monthly_count": 0,
  "monthly_amount": 0,
  "reinforcement_count": 0,
  "reinforcement_amount": 0,
  "keys_amount": 0,
  "post_keys_adjustment": "",
  "notes": ""
}`;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.6-luna',
      store: false,
      reasoning: { effort: 'low' },
      max_output_tokens: 900,
      text: { verbosity: 'low' },
      input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
    }),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[commercial intelligence openai]', response.status, asRecord(data)?.error);
    return null;
  }
  const text = outputText(data);
  if (!text) return null;
  try {
    return parseAnalysis(text);
  } catch (error) {
    console.error('[commercial intelligence parse]', error, text.slice(0, 800));
    return null;
  }
}

function matchDevelopment(name: string, developments: DevelopmentRow[]) {
  if (!name.trim()) return null;
  const target = normalize(name);
  return developments.find((item) => {
    const candidate = normalize(item.name);
    return candidate === target || candidate.includes(target) || target.includes(candidate);
  }) ?? null;
}

function matchUnit(code: string, developmentId: string, units: UnitRow[]) {
  const target = code.replace(/\D/g, '').trim();
  if (!target) return null;
  return units.find((unit) =>
    unit.development_id === developmentId
    && unit.unit_code.replace(/\D/g, '') === target,
  ) ?? null;
}

function proposalSignature(args: {
  leadId: string;
  developmentId: string;
  unitCode: string;
  totalPrice: number;
  date: string;
}) {
  return [
    'whatsapp-auto',
    args.leadId,
    args.developmentId,
    args.unitCode || 'sem-unidade',
    Math.round(args.totalPrice),
    args.date,
  ].join(':');
}

async function saveConversationSummary(args: {
  admin: AdminClient;
  lead: LeadRow;
  source: MessageRow;
  analysis: ProposalAnalysis;
  proposalId: string | null;
  proposalNumber: number | null;
}) {
  if (!args.analysis.meaningful_commercial_conversation || !args.analysis.summary) return;
  const date = localDate(args.source.created_at);
  const { data: recent } = await args.admin
    .from('activities')
    .select('id,metadata')
    .eq('lead_id', args.lead.id)
    .eq('type', 'resumo_conversa_whatsapp')
    .order('created_at', { ascending: false })
    .limit(15);

  const existing = (recent ?? []).find((activity) =>
    asRecord(activity.metadata)?.conversation_date === date,
  );
  const metadata = {
    conversation_date: date,
    auto_generated: true,
    source: 'whatsapp_commercial_intelligence',
    last_source_message_id: args.source.id,
    proposal_id: args.proposalId,
    proposal_number: args.proposalNumber,
    proposal_detected: args.analysis.bossa_proposal_detected,
    proposal_confidence: args.analysis.proposal_confidence,
  };
  const payload = {
    title: `Resumo comercial · ${brDate(date)}`,
    description: args.analysis.summary,
    metadata,
  };

  if (existing?.id) {
    await args.admin.from('activities').update(payload).eq('id', existing.id);
    return;
  }
  await args.admin.from('activities').insert({
    organization_id: args.lead.organization_id,
    lead_id: args.lead.id,
    type: 'resumo_conversa_whatsapp',
    ...payload,
  });
}

async function saveProposal(args: {
  admin: AdminClient;
  lead: LeadRow;
  source: MessageRow;
  analysis: ProposalAnalysis;
  development: DevelopmentRow;
  unit: UnitRow | null;
  messages: Array<MessageRow & { intelligenceText: string }>;
}) {
  const proposalDate = localDate(args.source.created_at);
  const signature = proposalSignature({
    leadId: args.lead.id,
    developmentId: args.development.id,
    unitCode: args.unit?.unit_code ?? args.analysis.unit_code,
    totalPrice: args.analysis.total_price,
    date: proposalDate,
  });

  const { data: recentProposals } = await args.admin
    .from('proposals')
    .select('id,proposal_number,snapshot,version')
    .eq('lead_id', args.lead.id)
    .order('updated_at', { ascending: false })
    .limit(30);

  const existing = (recentProposals ?? []).find((proposal) =>
    asRecord(proposal.snapshot)?.auto_signature === signature,
  ) ?? null;

  const listPrice = numberValue(args.unit?.list_price);
  const total = args.analysis.total_price;
  const paymentPlan = {
    proposal_date: proposalDate,
    entry_total: args.analysis.entry_amount,
    monthly_count: args.analysis.monthly_count,
    monthly_amount: args.analysis.monthly_amount,
    reinforcement_count: args.analysis.reinforcement_count,
    reinforcement_amount: args.analysis.reinforcement_amount,
    keys_amount: args.analysis.keys_amount,
    post_keys_adjustment: args.analysis.post_keys_adjustment || null,
    source: 'whatsapp_commercial_intelligence',
  };
  const snapshot = {
    workflow_status: 'negociacao',
    origin: args.lead.kind,
    lead_name: args.lead.name,
    client_name: args.analysis.client_name || (args.lead.kind === 'corretor' ? `Cliente do ${args.lead.name}` : args.lead.name),
    development_name: args.development.name,
    unit_code: args.unit?.unit_code ?? args.analysis.unit_code,
    responsible_name: 'Automação WhatsApp',
    proposal_date: proposalDate,
    nominal_total: total,
    discount_percent: listPrice > 0 ? Math.max(0, (listPrice - total) / listPrice * 100) : 0,
    auto_detected: true,
    auto_confidence: args.analysis.proposal_confidence,
    auto_signature: signature,
    proposal_direction: args.analysis.proposal_direction,
    source_message_ids: args.messages.map((message) => message.id),
    source: 'whatsapp_commercial_intelligence',
  };
  const proposalPayload = {
    organization_id: args.lead.organization_id,
    development_id: args.development.id,
    unit_id: args.unit?.id ?? null,
    lead_id: args.lead.id,
    status: 'enviada',
    list_price: listPrice,
    proposed_price: total,
    discount_amount: listPrice > 0 ? listPrice - total : 0,
    notes: args.analysis.notes || 'Proposta detectada automaticamente na conversa do WhatsApp.',
    payment_plan: paymentPlan,
    snapshot,
  };

  let proposalId: string;
  let proposalNumber: number;
  if (existing?.id) {
    const { data, error } = await args.admin
      .from('proposals')
      .update({ ...proposalPayload, version: Number(existing.version || 1) + 1 })
      .eq('id', existing.id)
      .select('id,proposal_number')
      .single();
    if (error) throw error;
    proposalId = data.id;
    proposalNumber = Number(data.proposal_number);
  } else {
    const { data, error } = await args.admin
      .from('proposals')
      .insert(proposalPayload)
      .select('id,proposal_number')
      .single();
    if (error) throw error;
    proposalId = data.id;
    proposalNumber = Number(data.proposal_number);
  }

  await args.admin.from('proposal_payment_items').delete().eq('proposal_id', proposalId);
  const items: Array<Record<string, unknown>> = [];
  if (args.analysis.entry_amount > 0) {
    items.push({
      organization_id: args.lead.organization_id,
      proposal_id: proposalId,
      kind: 'entrada',
      label: 'Entrada / ato',
      quantity: 1,
      amount: args.analysis.entry_amount,
      sort_order: 1,
      metadata: { auto_detected: true },
    });
  }
  if (args.analysis.reinforcement_count > 0 && args.analysis.reinforcement_amount > 0) {
    items.push({
      organization_id: args.lead.organization_id,
      proposal_id: proposalId,
      kind: 'reforco_anual',
      label: 'Reforços / balões',
      quantity: args.analysis.reinforcement_count,
      amount: args.analysis.reinforcement_amount,
      sort_order: 2,
      metadata: { auto_detected: true, frequency_unconfirmed: true },
    });
  }
  if (args.analysis.monthly_count > 0 && args.analysis.monthly_amount > 0) {
    items.push({
      organization_id: args.lead.organization_id,
      proposal_id: proposalId,
      kind: 'outro',
      label: 'Parcelas da proposta',
      quantity: args.analysis.monthly_count,
      amount: args.analysis.monthly_amount,
      sort_order: 3,
      metadata: { auto_detected: true },
    });
  }
  if (args.analysis.keys_amount > 0) {
    items.push({
      organization_id: args.lead.organization_id,
      proposal_id: proposalId,
      kind: 'chaves',
      label: 'Parcela nas chaves',
      quantity: 1,
      amount: args.analysis.keys_amount,
      sort_order: 4,
      metadata: { auto_detected: true },
    });
  }
  if (items.length) {
    const { error } = await args.admin.from('proposal_payment_items').insert(items);
    if (error) throw error;
  }

  const metadata = {
    ...(args.lead.metadata ?? {}),
    auto_proposal_detected_at: new Date().toISOString(),
    auto_proposal_signature: signature,
  };
  const update: Record<string, unknown> = {
    stage: 'proposta_negociacao',
    enterprise: args.development.name,
    owner_mode: 'human',
    ai_enabled: false,
    automation_paused: true,
    metadata,
    updated_at: new Date().toISOString(),
  };
  if (
    args.lead.kind === 'corretor'
    && args.analysis.broker_company
    && (!args.lead.company || ['não informada', 'autônomo'].includes(args.lead.company.toLocaleLowerCase('pt-BR')))
  ) {
    update.company = args.analysis.broker_company;
  }
  const { error: leadError } = await args.admin
    .from('leads')
    .update(update)
    .eq('id', args.lead.id);
  if (leadError) throw leadError;

  if (!existing?.id) {
    await args.admin.from('activities').insert({
      organization_id: args.lead.organization_id,
      lead_id: args.lead.id,
      type: 'proposta_detectada_whatsapp',
      title: `Proposta #${proposalNumber} detectada no WhatsApp`,
      description: args.analysis.summary || `Proposta de ${args.development.name} detectada automaticamente.`,
      metadata: {
        proposal_id: proposalId,
        proposal_number: proposalNumber,
        auto_signature: signature,
        source_message_id: args.source.id,
        proposal_confidence: args.analysis.proposal_confidence,
      },
    });
  }

  return { proposalId, proposalNumber };
}

async function markProcessed(
  admin: AdminClient,
  row: MessageRow,
  result: Record<string, unknown>,
) {
  const raw = {
    ...(row.raw_payload ?? {}),
    bossa_commercial_intelligence_processed_at: new Date().toISOString(),
    bossa_commercial_intelligence: result,
  };
  await admin.from('messages').update({ raw_payload: raw }).eq('id', row.id);
}

export async function processCommercialConversationMessage(
  admin: AdminClient,
  messageId: string,
) {
  const { data: messageData, error: messageError } = await admin
    .from('messages')
    .select('id,organization_id,lead_id,whatsapp_channel_id,direction,sender_kind,body,raw_payload,created_at')
    .eq('id', messageId)
    .maybeSingle();
  if (messageError) throw messageError;
  const source = messageData as MessageRow | null;
  if (!source || wasProcessed(source)) return { processed: false, reason: 'already_or_missing' };

  const { data: leadData, error: leadError } = await admin
    .from('leads')
    .select('id,organization_id,kind,name,company,enterprise,stage,owner_id,metadata')
    .eq('id', source.lead_id)
    .maybeSingle();
  if (leadError) throw leadError;
  const lead = leadData as LeadRow | null;
  if (!lead || lead.kind === 'geral') {
    if (source) await markProcessed(admin, source, { relevant: false, reason: 'general_or_missing_lead' });
    return { processed: true, reason: 'general_or_missing_lead' };
  }

  const type = messageType(source);
  const candidate = SIGNAL_RE.test(source.body) || ['image', 'audio', 'document'].includes(type);
  if (!candidate) {
    await markProcessed(admin, source, { relevant: false, reason: 'no_commercial_signal' });
    return { processed: true, reason: 'no_commercial_signal' };
  }

  const sourceTime = new Date(source.created_at).getTime();
  const start = new Date(sourceTime - 36 * 60 * 60_000).toISOString();
  const { data: historyData, error: historyError } = await admin
    .from('messages')
    .select('id,organization_id,lead_id,whatsapp_channel_id,direction,sender_kind,body,raw_payload,created_at')
    .eq('lead_id', lead.id)
    .gte('created_at', start)
    .lte('created_at', source.created_at)
    .order('created_at', { ascending: false })
    .limit(45);
  if (historyError) throw historyError;
  const history = ([...(historyData ?? [])] as MessageRow[]).reverse();

  const enriched: Array<MessageRow & { intelligenceText: string }> = [];
  for (const row of history) {
    let intelligenceText = row.body;
    const rowType = messageType(row);
    if (['image', 'audio'].includes(rowType)) {
      const understanding = await understandInboundMedia({
        admin,
        organizationId: lead.organization_id,
        row,
      });
      if (understanding) intelligenceText = `${row.body} — ${understanding}`;
    }
    enriched.push({ ...row, intelligenceText });
  }

  const [{ data: developmentsData }, { data: unitsData }] = await Promise.all([
    admin.from('developments')
      .select('id,name,delivery_date')
      .eq('organization_id', lead.organization_id)
      .eq('active', true)
      .order('name'),
    admin.from('development_units')
      .select('id,development_id,unit_code,list_price')
      .eq('organization_id', lead.organization_id)
      .order('unit_code'),
  ]);
  const developments = (developmentsData ?? []) as DevelopmentRow[];
  const units = (unitsData ?? []) as UnitRow[];
  const analysis = await analyzeConversation({ lead, messages: enriched, developments, units });
  if (!analysis) {
    await markProcessed(admin, source, { relevant: true, analyzed: false });
    return { processed: true, reason: 'analysis_unavailable' };
  }

  let proposalId: string | null = null;
  let proposalNumber: number | null = null;
  let development: DevelopmentRow | null = null;
  let unit: UnitRow | null = null;
  if (
    analysis.bossa_proposal_detected
    && analysis.proposal_confidence >= 0.86
    && analysis.total_price > 0
  ) {
    development = matchDevelopment(analysis.development_name, developments);
    if (development) unit = matchUnit(analysis.unit_code, development.id, units);
    if (development) {
      const saved = await saveProposal({
        admin,
        lead,
        source,
        analysis,
        development,
        unit,
        messages: enriched,
      });
      proposalId = saved.proposalId;
      proposalNumber = saved.proposalNumber;
    }
  }

  await saveConversationSummary({
    admin,
    lead,
    source,
    analysis,
    proposalId,
    proposalNumber,
  });
  await markProcessed(admin, source, {
    relevant: analysis.meaningful_commercial_conversation,
    proposal_detected: Boolean(proposalId),
    proposal_id: proposalId,
    proposal_number: proposalNumber,
    confidence: analysis.proposal_confidence,
    development: development?.name ?? null,
    unit: unit?.unit_code ?? analysis.unit_code || null,
  });

  return {
    processed: true,
    reason: proposalId ? 'proposal_saved' : 'summary_saved',
    proposalId,
    proposalNumber,
  };
}

export async function processCommercialIntelligenceBatch(admin: AdminClient, limit = 12) {
  const since = new Date(Date.now() - 72 * 60 * 60_000).toISOString();
  const { data, error } = await admin
    .from('messages')
    .select('id,organization_id,lead_id,whatsapp_channel_id,direction,sender_kind,body,raw_payload,created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(250);
  if (error) throw error;

  const pending = (data as MessageRow[] | null ?? [])
    .filter((row) => !wasProcessed(row))
    .slice(0, limit);

  let processed = 0;
  let proposals = 0;
  let failed = 0;
  for (const row of pending) {
    try {
      const result = await processCommercialConversationMessage(admin, row.id);
      if (result.processed) processed++;
      if (result.proposalId) proposals++;
    } catch (error) {
      failed++;
      console.error('[commercial intelligence]', row.id, error);
    }
  }
  return { selected: pending.length, processed, proposals, failed };
}
