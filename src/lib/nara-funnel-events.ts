import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Explicit evidence only. Deliberately independent from stage-based legacy milestones. */
export const NARA_FUNNEL_ACTIVITY_TYPE = 'nara_funil';
export const NARA_FUNNEL_SCHEMA_VERSION = 1;
export const NARA_FUNNEL_EVENTS = [
  'lead_recebido', 'resposta_enviada', 'primeira_resposta_util', 'interesse_identificado',
  'proximo_passo_oferecido', 'compromisso_solicitado', 'compromisso_confirmado',
  'compromisso_realizado', 'nao_compareceu', 'cancelado', 'reagendado',
  'proposta_solicitada', 'proposta_enviada', 'proposta_apresentada',
  'atendimento_humano_solicitado', 'encaminhado', 'assumido',
  'negociacao_iniciada', 'venda_fechada', 'perdido', 'sem_interesse', 'opt_out',
] as const;
export type NaraFunnelEvent = typeof NARA_FUNNEL_EVENTS[number];

type CollectionMode = 'automatic_partial' | 'human_record' | 'not_instrumented' | 'observed_only';
/** Coverage of the hooks shipped with this version, not a promise of historical completeness. */
export const NARA_FUNNEL_COLLECTION: Record<NaraFunnelEvent, { mode: CollectionMode; note: string }> = {
  lead_recebido: { mode: 'automatic_partial', note: 'Novos leads identificados pelo fluxo de entrada WhatsApp da Nara; não cobre todas as importações/origens.' },
  resposta_enviada: { mode: 'automatic_partial', note: 'Respostas da Nara enviadas com registro de mensagem; não mede utilidade.' },
  primeira_resposta_util: { mode: 'not_instrumented', note: 'Exige revisão de utilidade ligada à mensagem; coletor de revisão ainda não conectado.' },
  interesse_identificado: { mode: 'not_instrumented', note: 'Sem coletor explícito conectado; não inferido de score ou estágio.' },
  proximo_passo_oferecido: { mode: 'not_instrumented', note: 'Sem coletor de convite enviado conectado.' },
  compromisso_solicitado: { mode: 'automatic_partial', note: 'Pedidos explícitos no fluxo de agenda da Nara.' },
  compromisso_confirmado: { mode: 'automatic_partial', note: 'Confirmações verificadas no fluxo de agenda da Nara.' },
  compromisso_realizado: { mode: 'human_record', note: 'Conclusão registrada explicitamente por responsável na agenda.' },
  nao_compareceu: { mode: 'human_record', note: 'Não comparecimento registrado explicitamente por responsável na agenda.' },
  cancelado: { mode: 'human_record', note: 'Cancelamento pela ação da agenda; não cobre todas as exclusões/fluxos legados.' },
  reagendado: { mode: 'human_record', note: 'Mudança de horário registrada pela ação da agenda.' },
  proposta_solicitada: { mode: 'automatic_partial', note: 'Pedido explícito de proposta/simulação no fluxo da Nara.' },
  proposta_enviada: { mode: 'human_record', note: 'Envio de proposta individual declarado pelo operador; não presume envio pela geração de PDF.' },
  proposta_apresentada: { mode: 'human_record', note: 'Apresentação efetiva declarada pelo operador; não decorre de envio.' },
  atendimento_humano_solicitado: { mode: 'automatic_partial', note: 'Passagens criadas no atendimento híbrido instrumentado.' },
  encaminhado: { mode: 'automatic_partial', note: 'Atribuições instrumentadas com responsável; não comprova aceitação.' },
  assumido: { mode: 'human_record', note: 'Aceite do responsável identificado; não comprova primeiro contato.' },
  negociacao_iniciada: { mode: 'not_instrumented', note: 'Sem coletor explícito conectado; stage legado não é convertido.' },
  venda_fechada: { mode: 'not_instrumented', note: 'Sem coletor explícito conectado nesta trilha; vendas legadas permanecem no seu relatório.' },
  perdido: { mode: 'not_instrumented', note: 'Sem coletor explícito de perda conectado.' },
  sem_interesse: { mode: 'not_instrumented', note: 'Sem coletor explícito de desinteresse conectado.' },
  opt_out: { mode: 'automatic_partial', note: 'Pedidos de supressão recebidos no atendimento da Nara.' },
};

export type NaraFunnelEvidence = {
  source_message_id?: string;
  outbound_message_id?: string;
  agenda_event_id?: string;
  handoff_id?: string;
  proposal_id?: string;
  source_activity_id?: string;
};
export type NaraFunnelDimensions = {
  contact_kind?: 'cliente' | 'corretor';
  origin?: string;
  campaign_id?: string;
  development?: string;
  unit?: string;
  responsible_id?: string;
  meeting_mode?: 'presencial' | 'video' | 'telefone';
  next_step?: 'visita' | 'video' | 'proposta' | 'humano' | 'outro';
  proposal_version?: number;
};
export type RecordNaraFunnelEventArgs = {
  organizationId: string;
  leadId: string;
  event: NaraFunnelEvent;
  source: string;
  evidence: NaraFunnelEvidence;
  occurredAt?: string;
  actorId?: string | null;
  /** Stable transition identity, never a random ID or current retry timestamp. */
  dedupeKey?: string;
  dimensions?: NaraFunnelDimensions;
};

const eventNames = new Set<string>(NARA_FUNNEL_EVENTS);
const evidenceKeys = ['source_message_id', 'outbound_message_id', 'agenda_event_id',
  'handoff_id', 'proposal_id', 'source_activity_id'] as const;
const agendaEvents = new Set<NaraFunnelEvent>([
  'compromisso_confirmado', 'compromisso_realizado', 'nao_compareceu', 'cancelado', 'reagendado',
]);
const handoffEvents = new Set<NaraFunnelEvent>(['atendimento_humano_solicitado', 'encaminhado', 'assumido']);
const proposalEvents = new Set<NaraFunnelEvent>(['proposta_enviada', 'proposta_apresentada']);

function textValue(value: unknown, max = 200): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined;
}
function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function cleanEvidence(value: unknown): NaraFunnelEvidence {
  const raw = recordValue(value) ?? {};
  return Object.fromEntries(evidenceKeys.flatMap((key) => {
    const entry = textValue(raw[key]);
    return entry ? [[key, entry]] : [];
  })) as NaraFunnelEvidence;
}
function cleanDimensions(value: unknown): NaraFunnelDimensions {
  const raw = recordValue(value) ?? {};
  const result: NaraFunnelDimensions = {};
  for (const key of ['origin', 'campaign_id', 'development', 'unit', 'responsible_id'] as const) {
    const entry = textValue(raw[key]);
    if (entry) result[key] = entry;
  }
  if (raw.contact_kind === 'cliente' || raw.contact_kind === 'corretor') result.contact_kind = raw.contact_kind;
  if (raw.meeting_mode === 'presencial' || raw.meeting_mode === 'video' || raw.meeting_mode === 'telefone') result.meeting_mode = raw.meeting_mode;
  if (raw.next_step === 'visita' || raw.next_step === 'video' || raw.next_step === 'proposta'
    || raw.next_step === 'humano' || raw.next_step === 'outro') result.next_step = raw.next_step;
  if (typeof raw.proposal_version === 'number' && Number.isSafeInteger(raw.proposal_version) && raw.proposal_version > 0) {
    result.proposal_version = raw.proposal_version;
  }
  return result;
}
function validateEvidence(event: NaraFunnelEvent, evidence: NaraFunnelEvidence, actorId?: string | null, dedupeKey?: string) {
  if (!Object.keys(evidence).length) throw new Error('O evento do funil exige uma evidência identificável.');
  if (agendaEvents.has(event) && !evidence.agenda_event_id) throw new Error('O evento exige o compromisso correspondente.');
  if (handoffEvents.has(event) && !evidence.handoff_id) throw new Error('O evento exige a passagem humana correspondente.');
  if (proposalEvents.has(event) && !evidence.proposal_id) throw new Error('O evento exige uma proposta personalizada identificada.');
  if (event === 'reagendado' && !dedupeKey && !evidence.source_activity_id) {
    throw new Error('Reagendamento exige identidade estável da transição.');
  }
  if ((event === 'compromisso_realizado' || event === 'nao_compareceu' || event === 'proposta_apresentada') && !actorId) {
    throw new Error('O resultado exige registro explícito de um responsável humano.');
  }
  if (event === 'proposta_enviada' && !evidence.outbound_message_id && !actorId) {
    throw new Error('Proposta criada ou detectada não comprova envio.');
  }
  if ((event === 'resposta_enviada' || event === 'proximo_passo_oferecido' || event === 'primeira_resposta_util')
    && !evidence.outbound_message_id) throw new Error('O evento exige uma mensagem efetivamente enviada.');
  if (event === 'primeira_resposta_util' && (!actorId || !evidence.source_activity_id)) {
    throw new Error('Envio não comprova utilidade; registre uma revisão explícita.');
  }
}

/** Stable keys ignore retry time and secondary messages for the same real entity/outcome. */
export function buildNaraFunnelActivity(args: RecordNaraFunnelEventArgs) {
  const organizationId = textValue(args.organizationId);
  const leadId = textValue(args.leadId);
  const source = textValue(args.source, 80);
  const actorId = textValue(args.actorId) ?? null;
  if (!organizationId || !leadId || !source || !eventNames.has(args.event)) throw new Error('Identidade ou tipo do evento inválido.');
  if (args.actorId && !actorId) throw new Error('Responsável inválido.');
  const dedupeKey = textValue(args.dedupeKey, 1000);
  if (args.dedupeKey && !dedupeKey) throw new Error('Identidade de transição inválida.');
  const evidence = cleanEvidence(args.evidence);
  validateEvidence(args.event, evidence, actorId, dedupeKey);
  const date = new Date(args.occurredAt ?? Date.now());
  if (!Number.isFinite(date.getTime())) throw new Error('Data do evento inválida.');
  const identity = args.event === 'lead_recebido' ? leadId
    : agendaEvents.has(args.event) ? evidence.agenda_event_id
      : handoffEvents.has(args.event) ? evidence.handoff_id
        : proposalEvents.has(args.event) ? evidence.proposal_id
          : evidence.source_message_id || evidence.outbound_message_id || evidence.source_activity_id;
  if (!identity) throw new Error('O evento exige uma mensagem ou atividade de origem.');
  const transition = dedupeKey ?? (args.event === 'reagendado' ? evidence.source_activity_id : '') ?? '';
  const digest = createHash('sha256').update(JSON.stringify([
    'nara-funnel-v1', organizationId, leadId, args.event, identity, transition,
  ])).digest('hex');
  // UUIDv8: application-specific SHA-256 identity, valid for the existing UUID PK.
  const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-8${digest.slice(13, 16)}-${((parseInt(digest[16], 16) & 3) | 8).toString(16)}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  return {
    id, organization_id: organizationId, lead_id: leadId, user_id: actorId,
    type: NARA_FUNNEL_ACTIVITY_TYPE,
    title: `Nara · ${args.event.replaceAll('_', ' ')}`,
    description: 'Marco explícito do funil, com origem rastreável. Não inferido do estágio comercial.',
    metadata: {
      schema_version: NARA_FUNNEL_SCHEMA_VERSION,
      event: args.event,
      event_key: `nara-funnel-v1:${digest}`,
      occurred_at: date.toISOString(),
      source,
      evidence,
      // Preserve only the hash, not arbitrary input that could contain contact details.
      transition_key: transition ? createHash('sha256').update(transition).digest('hex') : null,
      dimensions: cleanDimensions(args.dimensions),
    },
  };
}

/** Call after the actual operation succeeded. No stage changes, messages or calendar writes. */
export async function recordNaraFunnelEvent(client: SupabaseClient, args: RecordNaraFunnelEventArgs) {
  const row = buildNaraFunnelActivity(args);
  const { data, error } = await client.from('activities').upsert(row, {
    onConflict: 'id', ignoreDuplicates: true,
  }).select('id');
  if (error) throw new Error(`Não foi possível registrar o marco do funil: ${error.message}`);
  return { recorded: Boolean(data?.length), id: row.id };
}

/** Telemetry failure must never turn a completed action into a new send/retry. */
export async function tryRecordNaraFunnelEvent(client: SupabaseClient, args: RecordNaraFunnelEventArgs) {
  try { return await recordNaraFunnelEvent(client, args); }
  catch {
    console.error('[nara funil] Marco explícito não registrado; a ação comercial não será repetida.');
    return { recorded: false, id: null, error: 'funnel_event_not_recorded' };
  }
}

type FunnelActivityRow = {
  id?: unknown; organization_id?: unknown; lead_id?: unknown; user_id?: unknown;
  type?: unknown; created_at?: unknown; metadata?: unknown;
};
type EventCounter = { events: number | null; unique_leads: number | null; collection: CollectionMode };
function emptyCounters(): Record<NaraFunnelEvent, EventCounter> {
  return Object.fromEntries(NARA_FUNNEL_EVENTS.map((event) => {
    const collection = NARA_FUNNEL_COLLECTION[event].mode;
    return [event, { events: collection === 'not_instrumented' ? null : 0,
      unique_leads: collection === 'not_instrumented' ? null : 0, collection }];
  })) as Record<NaraFunnelEvent, EventCounter>;
}

export function summarizeNaraFunnelEvents(rows: FunnelActivityRow[], args: {
  organizationId: string; from?: string; to?: string; contactKind?: 'cliente' | 'corretor';
}) {
  const counters = emptyCounters();
  const byContactKind = { cliente: emptyCounters(), corretor: emptyCounters(), desconhecido: emptyCounters() };
  const people = new Map<string, Set<string>>();
  const seen = new Set<string>();
  let ignored = 0; let duplicates = 0;
  let firstTime = Number.POSITIVE_INFINITY; let lastTime = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const metadata = recordValue(row.metadata);
    const event = metadata?.event;
    const evidence = cleanEvidence(metadata?.evidence);
    const occurredAt = textValue(metadata?.occurred_at);
    const key = textValue(metadata?.event_key);
    const leadId = textValue(row.lead_id);
    const source = textValue(metadata?.source, 80);
    if (row.organization_id !== args.organizationId || row.type !== NARA_FUNNEL_ACTIVITY_TYPE
      || metadata?.schema_version !== NARA_FUNNEL_SCHEMA_VERSION || typeof event !== 'string'
      || !eventNames.has(event) || !key || !leadId || !source || !occurredAt
      || !Number.isFinite(new Date(occurredAt).getTime())) { ignored += 1; continue; }
    const normalizedDate = new Date(occurredAt).toISOString();
    const dimensions = cleanDimensions(metadata.dimensions);
    if ((args.from && normalizedDate < args.from) || (args.to && normalizedDate >= args.to)
      || (args.contactKind && dimensions.contact_kind !== args.contactKind)) { ignored += 1; continue; }
    try {
      validateEvidence(event as NaraFunnelEvent, evidence, textValue(row.user_id), textValue(metadata.transition_key));
    } catch { ignored += 1; continue; }
    if (seen.has(key)) { duplicates += 1; continue; }
    seen.add(key);
    const timestamp = Date.parse(normalizedDate);
    firstTime = Math.min(firstTime, timestamp); lastTime = Math.max(lastTime, timestamp);
    const kind = dimensions.contact_kind ?? 'desconhecido';
    for (const [group, target] of [['all', counters], [kind, byContactKind[kind]]] as const) {
      const counter = target[event as NaraFunnelEvent];
      counter.events = (counter.events ?? 0) + 1;
      if (counter.collection === 'not_instrumented') counter.collection = 'observed_only';
      const setKey = `${group}:${event}`;
      const set = people.get(setKey) ?? new Set<string>();
      set.add(leadId); people.set(setKey, set);
      target[event as NaraFunnelEvent].unique_leads = set.size;
    }
  }
  return {
    schema_version: NARA_FUNNEL_SCHEMA_VERSION,
    counts: counters,
    by_contact_kind: byContactKind,
    collection_catalog: NARA_FUNNEL_COLLECTION,
    coverage: {
      source: 'explicit_activity_events_only',
      observed_from: Number.isFinite(firstTime) ? new Date(firstTime).toISOString() : null,
      observed_until: Number.isFinite(lastTime) ? new Date(lastTime).toISOString() : null,
      records_examined: rows.length, accepted_events: seen.size,
      ignored_records: ignored, duplicate_records: duplicates,
      legacy_milestones_included: false, retrospective_inference: false,
    },
    conversion_rates: null,
    limitations: [
      'Eventos explícitos após instrumentação; dados antigos não foram reconstruídos.',
      'Pessoas únicas usam o lead canônico do CRM; contatos duplicados precisam de conciliação antes de comparar coortes.',
      'Sem taxas de conversão: este resumo não estabelece sozinho uma coorte elegível completa.',
      'Assunção não comprova primeiro contato humano; resposta enviada não comprova resposta útil.',
    ],
  };
}

/** Caller must supply its session client. API adds RLS and explicit organization scope. */
export async function loadNaraFunnelSummary(client: SupabaseClient, args: {
  organizationId: string; from: string; to: string; contactKind?: 'cliente' | 'corretor'; maxRows?: number;
}) {
  if (!textValue(args.organizationId) || !Number.isFinite(Date.parse(args.from)) || !Number.isFinite(Date.parse(args.to))
    || Date.parse(args.from) >= Date.parse(args.to)) throw new Error('Período ou organização inválidos.');
  const from = new Date(args.from).toISOString(); const to = new Date(args.to).toISOString();
  const requestedMax = args.maxRows ?? 10_000;
  const maxRows = Number.isFinite(requestedMax) ? Math.max(1, Math.min(10_000, Math.floor(requestedMax))) : 10_000;
  const rows: FunnelActivityRow[] = [];
  for (let offset = 0; offset <= maxRows; offset += 500) {
    const pageLength = Math.min(500, maxRows + 1 - offset);
    let query = client.from('activities').select('id,organization_id,lead_id,user_id,type,created_at,metadata')
      .eq('organization_id', args.organizationId).eq('type', NARA_FUNNEL_ACTIVITY_TYPE)
      .eq('metadata->>schema_version', String(NARA_FUNNEL_SCHEMA_VERSION))
      .gte('metadata->>occurred_at', from).lt('metadata->>occurred_at', to)
      .order('created_at', { ascending: true }).order('id', { ascending: true });
    if (args.contactKind) query = query.eq('metadata->dimensions->>contact_kind', args.contactKind);
    const { data, error } = await query.range(offset, offset + pageLength - 1);
    if (error) throw new Error('Não foi possível consultar os eventos explícitos do funil.');
    rows.push(...(data ?? []));
    if (!data || data.length < pageLength) break;
  }
  const truncated = rows.length > maxRows;
  const result = summarizeNaraFunnelEvents(rows.slice(0, maxRows), { ...args, from, to });
  return {
    ...result,
    period: { from, to, end_exclusive: true },
    coverage: { ...result.coverage, truncated, max_records: maxRows },
  };
}

/** Offline preparation only. No production path invokes an experiment or changes a prompt. */
export function previewNaraExperimentAssignment(args: {
  enabled?: boolean; organizationId: string; canonicalPersonId: string; experimentId: string; seed: string;
}): { active: false; variant: null } | { active: true; variant: 'control' | 'candidate' } {
  if (args.enabled !== true) return { active: false, variant: null };
  if (![args.organizationId, args.canonicalPersonId, args.experimentId, args.seed].every((value) => textValue(value))) {
    throw new Error('Experimento exige identidade canônica, organização, versão e semente estável.');
  }
  const digest = createHash('sha256').update(JSON.stringify([
    args.organizationId, args.canonicalPersonId, args.experimentId, args.seed,
  ])).digest();
  return { active: true, variant: (digest[0] & 1) === 0 ? 'control' : 'candidate' };
}
