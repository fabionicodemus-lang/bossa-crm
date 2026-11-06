import type { AiTurn } from './ai';
import type { Lead } from './types';
import { agendaActionFromText, agendaModeFromConversation } from './nara-agenda-intent';
import { explicitHumanRequest, financialNegotiationIntent, refusesHandoff, withoutNegatedRequests } from './nara-conversation-signals';
import { naraContactZone } from './nara-timezone';

type Evidence = { code: string; client_text: string; source_message_id: string | null; recorded_at: string };
export type NaraJourney = {
  schema_version: 1;
  main_objection: Evidence | null;
  pending_reason: Evidence | null;
  requested_next_step: 'visit' | 'video' | 'proposal' | 'human' | null;
  agreed_return: { not_before: string; source: 'client'; client_text: string; source_message_id: string | null } | null;
  return_needs_clarification: boolean;
  last_client_request: string;
  last_source_message_id: string | null;
  updated_at: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown, max = 600): string { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function normalize(value: string): string { return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase(); }

/** A general payment question is a handoff, not necessarily a requested proposal. */
export function explicitNaraProposalRequest(input: string): boolean {
  if (refusesHandoff(input) && !explicitHumanRequest(input)) return false;
  const value = withoutNegatedRequests(normalize(input));
  if (/\bnao\b.{0,30}\b(?:quero|preciso|gostaria|precisamos|envie|mande)\b.{0,35}\b(?:proposta|contraproposta|simulacao)\b/.test(value)
    || /\b(?:saber|entender|explicar|explicacao|informacoes|como funciona|como voces)\b.{0,55}\b(?:proposta|simulacao)\b/.test(value)
    || /\b(?:so pesquisando|apenas pesquisando|sem proposta|sem compromisso|nao e uma proposta)\b/.test(value)) return false;
  return /\b(?:quero|gostaria|preciso|pode|podemos|vamos)\b.{0,45}\b(?:proposta|contraproposta|simulacao)\b/.test(value)
    || /\b(?:minha proposta|ofereco|aceitam)\b.{0,70}\d.{0,50}\b(?:entrada|parcelas|vezes|a vista)\b/.test(value);
}
function evidence(value: unknown): Evidence | null {
  const row = record(value);
  return text(row.code) && text(row.client_text) ? {
    code: text(row.code, 50), client_text: text(row.client_text),
    source_message_id: text(row.source_message_id) || null, recorded_at: text(row.recorded_at),
  } : null;
}

export function readNaraJourney(metadata: Record<string, unknown> | null | undefined): NaraJourney {
  const row = record(metadata?.nara_journey);
  const agreed = record(row.agreed_return);
  const steps = ['visit', 'video', 'proposal', 'human'];
  return {
    schema_version: 1,
    main_objection: evidence(row.main_objection), pending_reason: evidence(row.pending_reason),
    requested_next_step: steps.includes(String(row.requested_next_step)) ? row.requested_next_step as NaraJourney['requested_next_step'] : null,
    agreed_return: agreed.source === 'client' && Number.isFinite(Date.parse(String(agreed.not_before)))
      ? { not_before: String(agreed.not_before), source: 'client', client_text: text(agreed.client_text), source_message_id: text(agreed.source_message_id) || null } : null,
    return_needs_clarification: row.return_needs_clarification === true,
    last_client_request: text(row.last_client_request), last_source_message_id: text(row.last_source_message_id) || null,
    updated_at: text(row.updated_at),
  };
}

/** Conservative customer-agreed callback, not a visit, delivery date or internal SLA.
 * Ambiguous requests stay blocked for clarification; no guessed month/timezone. */
export function extractNaraAgreedReturn(input: string, now = new Date(), timezone = 'America/Sao_Paulo') {
  const value = normalize(input);
  const callback = /\b(?:me (?:procure|chame|contate|ligue)|(?:pode|podemos|vamos) (?:me )?(?:falar|conversar|retomar|voltar a falar)|(?:volte|retorne) (?:a falar|o contato)|entre em contato|so (?:posso|quero) (?:falar|conversar))\b/.test(value);
  const temporal = /\b(?:amanha|hoje|segunda|terca|quarta|quinta|sexta|sabado|domingo|semana|mes|dia|dias|depois|as\s+\d)\b|\d{1,2}\/\d{1,2}/.test(value);
  if (!callback || !temporal || agendaActionFromText(input) !== 'none') return { requested: false, notBefore: null };
  if (/\b(?:nao (?:me |quero |pode )?(?:procure|chame|contate|ligue)|nao entre em contato)\b/.test(value)) return { requested: false, notBefore: null };
  // Alternatives and a refusal are not an agreement to the first date mentioned.
  if (/\bou\b/.test(value) || [...value.matchAll(/\b\d{1,2}\/\d{1,2}(?:\/\d{4})?\b/g)].length > 1
    || (/\bhoje\b/.test(value) && /\bamanha\b/.test(value))) return { requested: true, notBefore: null };
  if (/\bnao\b.{0,30}\b(?:falar|conversar|retomar|chamar|ligar|contatar)\b/.test(value)) return { requested: true, notBefore: null };
  let parts: Intl.DateTimeFormatPart[];
  try { parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now); }
  catch { return { requested: true, notBefore: null }; }
  const part = (kind: string) => Number(parts.find((p) => p.type === kind)?.value);
  let year = part('year'), month = part('month'), day = part('day');
  const numeric = value.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  const relative = value.match(/\b(?:daqui a|em)\s+(\d{1,3})\s+dias?\b/);
  let knownDate = false;
  if (numeric) { day = Number(numeric[1]); month = Number(numeric[2]); year = Number(numeric[3] || year); knownDate = true; }
  else if (/\b(?:hoje|amanha)\b/.test(value) || relative) {
    const offset = relative ? Number(relative[1]) : /\bdepois de amanha\b/.test(value) ? 2 : /\bamanha\b/.test(value) ? 1 : 0;
    if (offset > 180) return { requested: true, notBefore: null };
    const date = new Date(Date.UTC(year, month - 1, day + offset));
    year = date.getUTCFullYear(); month = date.getUTCMonth() + 1; day = date.getUTCDate(); knownDate = true;
  }
  // "Na terça", "dia 10" and "semana que vem" need the precise date agreed.
  if (!knownDate) return { requested: true, notBefore: null };
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() + 1 !== month || calendar.getUTCDate() !== day) return { requested: true, notBefore: null };
  // Capture the complete declared digits before validating. A malformed 25h or
  // 15:99 must never silently fall back to 08:30 or be truncated to 15:00.
  const time = value.match(/\b(?:as|depois das|apos as|a partir das)\s+(\d+)(?:\s*[:h]\s*(\d*))?/)
    || value.match(/\b(\d+)[:h](\d*)\b/);
  if (time && (Number(time[1]) > 23 || Number(time[2] || 0) > 59 || (time[2] && time[2].length !== 2))) {
    return { requested: true, notBefore: null };
  }
  if (time && Number(time[1]) < 12 && /\b(?:tarde|noite|pm)\b/.test(value)) return { requested: true, notBefore: null };
  if (/\b(?:manha|tarde|noite)\b/.test(value) && !time) return { requested: true, notBefore: null };
  const hour = time ? Number(time[1]) : 8, minute = time ? Number(time[2] || 0) : 30;
  // Convert the declared local wall time, validating the round-trip (DST gaps).
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = desired;
  for (let i = 0; i < 3; i++) {
    const local = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(candidate));
    const get = (key: string) => Number(local.find((p) => p.type === key)?.value);
    const actual = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    if (actual === desired) break;
    if (i === 2) return { requested: true, notBefore: null };
    candidate += desired - actual;
  }
  if (candidate <= now.getTime() || candidate - now.getTime() > 366 * 86_400_000) return { requested: true, notBefore: null };
  return { requested: true, notBefore: new Date(candidate).toISOString() };
}

export function updateNaraJourney(args: {
  metadata?: Record<string, unknown>; lastUserMessage: string; sourceMessageId?: string | null;
  handoffRequired?: boolean; agendaConfirmed?: boolean; now?: Date;
}): NaraJourney {
  const now = args.now || new Date();
  const previous = readNaraJourney(args.metadata);
  // A webhook retry must not re-date an agreement made using "amanhã".
  if (args.sourceMessageId && previous.last_source_message_id === args.sourceMessageId) return previous;
  const result = { ...previous, last_client_request: text(args.lastUserMessage),
    last_source_message_id: args.sourceMessageId || null, updated_at: now.toISOString() };
  const value = normalize(args.lastUserMessage);
  const make = (code: string): Evidence => ({ code, client_text: text(args.lastUserMessage),
    source_message_id: args.sourceMessageId || null, recorded_at: now.toISOString() });
  const objections: Array<[string, RegExp]> = [
    ['beach_distance', /(?:longe|distancia|distante).{0,32}(?:praia|mar)|(?:praia|mar).{0,25}(?:longe|distante)/],
    ['delivery_concern', /(?:receio|medo|preocup|risco).{0,55}(?:atras|entrega|obra)|(?:obra|entrega).{0,25}(?:atras)/],
    ['unit_view', /\b(?:vista|visao).{0,30}(?:andar|unidade|apartamento|mar)|\b(?:andar|unidade).{0,25}vista\b/],
    ['trust', /\b(?:confiavel|confiar|confianca|so marketing|boa mesmo)\b/],
    ['price', /\b(?:caro|cara|acima do (?:meu )?orcamento|mais barato|preco alto)\b/],
    ['timing', /\b(?:vou pensar|sem pressa|mais para frente|mais pra frente|ano que vem)\b/],
  ];
  const objection = objections.find(([, pattern]) => pattern.test(value));
  if (objection) { result.main_objection = make(objection[0]); result.pending_reason = make('needs_evidence'); }
  if (financialNegotiationIntent(args.lastUserMessage) && !refusesHandoff(args.lastUserMessage)) {
    result.requested_next_step = 'proposal';
  } else if (explicitHumanRequest(args.lastUserMessage)) result.requested_next_step = 'human';
  else if (agendaActionFromText(args.lastUserMessage) === 'cancel') {
    result.requested_next_step = null; result.pending_reason = null;
  } else if (['schedule', 'reschedule'].includes(agendaActionFromText(args.lastUserMessage))) {
    result.requested_next_step = agendaModeFromConversation([], args.lastUserMessage) === 'video' ? 'video' : 'visit';
    result.pending_reason = make('awaiting_agenda');
  } else if (refusesHandoff(args.lastUserMessage) || /\b(?:nao quero visita|nao quero video|agora nao|vou pensar)\b/.test(value)) {
    result.requested_next_step = null; result.pending_reason = make('considering');
  }
  if (args.handoffRequired) result.pending_reason = make('awaiting_human');
  if (args.agendaConfirmed) result.pending_reason = null;
  const originalZone = text(args.metadata?.contact_time_preference_timezone) || 'America/Sao_Paulo';
  const preference = text(args.metadata?.contact_time_preference_original);
  const zone = originalZone === 'Europe/Lisbon' && /\bporto\s+belo\b/i.test(preference)
    && naraContactZone(preference) === 'America/Sao_Paulo' ? 'America/Sao_Paulo' : originalZone;
  // A direct date/time answer may complete the pending clarification; require a
  // narrowly temporal answer so a new purchase/visit deadline is not repurposed.
  const clarificationOnly = previous.return_needs_clarification
    && /^(?:(?:pode ser|sim|entao|no dia|dia|em|na|no)\s+)*(?:\d{1,2}\/\d{1,2}(?:\/\d{4})?|depois de amanha|amanha|hoje)(?:\s+(?:as|apos as|depois das|a partir das)\s+\d{1,2}(?::\d{2}|h\d{0,2})?)?[.!]?$/.test(value.trim());
  const callback = extractNaraAgreedReturn(clarificationOnly ? `Podemos falar ${args.lastUserMessage}` : args.lastUserMessage, now, zone);
  if (callback.requested) {
    result.agreed_return = callback.notBefore ? { not_before: callback.notBefore, source: 'client',
      client_text: text(args.lastUserMessage), source_message_id: args.sourceMessageId || null } : null;
    result.return_needs_clarification = !callback.notBefore;
    result.pending_reason = make('awaiting_return');
  } else if (/\b(?:pode(?:mos)? (?:me )?(?:chamar|ligar|falar|conversar) agora|vamos (?:falar|continuar|retomar) agora)\b/.test(value)) {
    result.agreed_return = null; result.return_needs_clarification = false;
    if (result.pending_reason?.code === 'awaiting_return') result.pending_reason = null;
  }
  if (!callback.requested && /\bagora\b/.test(value)
    && (explicitHumanRequest(args.lastUserMessage) || explicitNaraProposalRequest(args.lastUserMessage))) {
    result.agreed_return = null; result.return_needs_clarification = false;
    if (result.pending_reason?.code === 'awaiting_return') result.pending_reason = make('awaiting_human');
  }
  return result;
}

export function naraFutureCommitment(metadata: Record<string, unknown> | undefined, now = new Date()): boolean {
  const journey = readNaraJourney(metadata);
  return journey.return_needs_clarification || Boolean(journey.agreed_return && Date.parse(journey.agreed_return.not_before) > now.getTime());
}

export type DeliveredNaraMaterial = { file_id: string; message_id: string; title: string; sent_at: string };
export function deliveredNaraMaterials(rows: Array<Record<string, unknown>>): DeliveredNaraMaterial[] {
  const unique = new Map<string, DeliveredNaraMaterial>();
  for (const row of rows) {
    const raw = record(row.raw_payload);
    const fileId = text(raw.ai_file_id);
    if (row.direction !== 'out' || !['sent', 'delivered', 'read'].includes(String(row.status)) || !fileId || !text(row.id)) continue;
    if (!unique.has(fileId)) unique.set(fileId, { file_id: fileId, message_id: text(row.id),
      title: text(row.body, 180).replace(/^📎\s*/, ''), sent_at: text(row.created_at) });
  }
  return [...unique.values()].slice(0, 20);
}

/** Additive briefing: existing keys stay available to the card/template consumers. */
export function buildNaraHandoffBriefing(args: {
  lead: Lead; turn: AiTurn; metadata: Record<string, unknown>; lastUserMessage: string;
  sourceMessageId?: string | null; responsibleId: string | null; responsibleName: string | null;
  nextAction: string; priority: string; dueAt: string | null; materials?: DeliveredNaraMaterial[];
}) {
  const profile = { ...record(args.metadata.ai_extracted),
    ...Object.fromEntries(Object.entries(args.turn.extracted).filter(([, v]) => typeof v === 'string' && v.trim())) };
  const journey = readNaraJourney(args.metadata);
  const ad = record(args.metadata.ad);
  return {
    schema_version: 2, lead_name: args.lead.name, phone: args.lead.phone, contact_kind: args.lead.kind,
    source: args.lead.source, source_campaign: text(args.metadata.utm_campaign) || text(args.metadata.campaign_id) || null,
    source_ad_id: text(ad.source_id) || null, source_page: text(args.metadata.source_page) || text(ad.source_url) || null,
    source_unit: text(args.metadata.source_unit) || null,
    enterprise: text(profile.enterprise) || args.lead.enterprise || null,
    purpose: text(profile.purpose) || null, typology: text(profile.typology) || null,
    budget: text(profile.budget) || null, deadline: text(profile.deadline) || null,
    decision_maker: text(profile.decision_maker) || null,
    location: text(profile.region) || text(args.metadata.contact_time_preference_city) || null,
    payment_method: text(args.metadata.payment_method) || null,
    best_contact_time_original: text(args.metadata.contact_time_preference_original) || null,
    best_contact_time_brasilia: text(args.metadata.contact_time_preference_brasilia) || null,
    contact_timezone: text(args.metadata.contact_time_preference_timezone) || null,
    main_objection: journey.main_objection?.client_text || null,
    main_objection_code: journey.main_objection?.code || null,
    pending_reason: journey.pending_reason, requested_next_step: journey.requested_next_step,
    agreed_return: journey.agreed_return, return_needs_clarification: journey.return_needs_clarification,
    latest_client_request: text(args.lastUserMessage), source_message_id: args.sourceMessageId || null,
    declared_terms_are_approved: false, summary: args.turn.summary,
    delivered_materials: args.materials || [],
    next_best_action: args.nextAction, priority_class: args.priority,
    responsible_id: args.responsibleId, responsible_name: args.responsibleName,
    acceptance_status: 'pending', acceptance_due_at: args.dueAt,
    advisor_guidance: 'Retome a dúvida e o pedido registrados. Valores declarados pelo cliente não são condições aprovadas; confirme apenas em fonte comercial vigente. Materiais listados têm envio registrado, não leitura comprovada.',
  };
}
