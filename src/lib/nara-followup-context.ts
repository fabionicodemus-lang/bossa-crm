import { hasExplicitContactPreference, naraContactZone, preferredContactWindow, validNaraTimezone } from './nara-timezone';

/** Small, deterministic projection of persisted facts; never re-run qualification. */
export type NaraFollowupLead = {
  id?: string;
  organization_id?: string;
  kind?: string;
  name?: string | null;
  enterprise?: string | null;
  phone?: string | null;
  stage?: string;
  owner_mode?: string | null;
  ai_enabled?: boolean | null;
  opt_out?: boolean | null;
  automation_paused?: boolean | null;
  archived_at?: string | null;
  last_inbound_at?: string | null;
  last_human_activity_at?: string | null;
  metadata?: unknown;
};

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}
function text(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }

function journeyFor(lead: NaraFollowupLead) {
  const journey = object(object(lead.metadata).nara_journey);
  return journey.schema_version === 1 ? journey : {};
}

export function naraFollowupContactZone(lead: NaraFollowupLead, fallbackZone: string) {
  const metadata = object(lead.metadata);
  const zone = metadata.contact_time_preference_timezone;
  const original = text(metadata.contact_time_preference_original);
  if (zone === 'Europe/Lisbon' && /\bporto\s+belo\b/i.test(original)
    && naraContactZone(original) === 'America/Sao_Paulo') return 'America/Sao_Paulo';
  return validNaraTimezone(zone) ? zone : validNaraTimezone(fallbackZone) ? fallbackZone : 'America/Sao_Paulo';
}

/** Only a client agreement is a contact embargo. An internal task SLA is not. */
export function naraFollowupContactBlock(lead: NaraFollowupLead, now: Date, fallbackZone: string): string | null {
  const journey = journeyFor(lead);
  if (journey.return_needs_clarification === true) return 'retorno_combinado_nao_esclarecido';
  const pending = text(object(journey.pending_reason).code);
  if (journey.requested_next_step === 'human' || journey.requested_next_step === 'proposal'
    || pending === 'awaiting_human') return 'aguardando_humano';
  if (pending === 'no_interest') return 'sem_interesse';

  const agreed = object(journey.agreed_return);
  if (agreed.source === 'client') {
    const timestamp = text(agreed.not_before);
    // An absolute timestamp must include a zone. Do not interpret a date in the server's local zone.
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)
      || !Number.isFinite(Date.parse(timestamp))) return 'retorno_combinado_invalido';
    const [year, month, day] = timestamp.slice(0, 10).split('-').map(Number);
    if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return 'retorno_combinado_invalido';
    if (now.getTime() < Date.parse(timestamp)) return 'aguardando_retorno_combinado';
  }

  const metadata = object(lead.metadata);
  const original = text(metadata.contact_time_preference_original);
  if (original) {
    const preferred = preferredContactWindow(original, naraFollowupContactZone(lead, fallbackZone));
    if (preferred) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: preferred.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(now);
      const minutes = Number(parts.find((part) => part.type === 'hour')?.value) * 60
        + Number(parts.find((part) => part.type === 'minute')?.value);
      if (minutes < preferred.startMinutes || minutes >= preferred.endMinutes) return 'fora_da_preferencia_de_contato';
    } else if (hasExplicitContactPreference(original)) return 'preferencia_de_contato_nao_interpretada';
  }
  return null;
}

function knownEnterprise(lead: NaraFollowupLead) {
  const extracted = object(object(lead.metadata).ai_extracted);
  const supplied = text(extracted.enterprise) || text(lead.enterprise);
  const value = supplied.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (/^flow(?: aptos)?$/.test(value)) return 'Flow';
  if (/^alma(?: sea ?houses)?$/.test(value)) return 'Alma';
  if (value === 'soul') return 'Soul';
  if (value === 'jazz') return 'Jazz';
  return '';
}

function safeName(value: unknown) {
  const first = text(value).split(/\s+/)[0];
  return /^[\p{L}][\p{L}'’-]{0,31}$/u.test(first) ? first : '';
}

export type NaraFollowupLanguage = 'pt_BR' | 'es' | 'en';
export type NaraFollowupText = { body: string; context: string };

/** No client_text, prices, promises, URLs or arbitrary model output are echoed here. */
export function buildNaraFollowupText(args: {
  lead: NaraFollowupLead;
  language: NaraFollowupLanguage;
  confirmedMaterialSent?: boolean;
}): NaraFollowupText {
  const { lead, language } = args;
  const journey = journeyFor(lead);
  const objection = object(journey.main_objection);
  const pending = object(journey.pending_reason);
  // A code without a grounded source sentence is not sufficient evidence of an objection.
  const code = text(objection.client_text) ? text(objection.code) : '';
  const enterprise = knownEnterprise(lead);
  const name = safeName(lead.name);
  const greeting = language === 'es' ? `Hola${name ? `, ${name}` : ''}.`
    : language === 'en' ? `Hi${name ? `, ${name}` : ''}.` : `Oi${name ? `, ${name}` : ''}!`;
  const product = enterprise ? (language === 'pt_BR' ? ` do ${enterprise}` : ` de ${enterprise}`) : '';
  const enProduct = enterprise ? ` at ${enterprise}` : '';
  const responses: Record<string, Record<NaraFollowupLanguage, string>> = {
    beach_distance: {
      pt_BR: `Sobre a localização${product}, quer retomar sua dúvida sobre a distância da praia?`,
      es: `Sobre la ubicación${product}, ¿retomamos tu duda sobre la distancia a la playa?`,
      en: `About the location${enProduct}, would you like to revisit your question about the distance to the beach?`,
    },
    delivery_concern: {
      pt_BR: `Sobre o prazo de entrega${product}, qual informação ainda falta para você avaliar com segurança?`,
      es: `Sobre el plazo de entrega${product}, ¿qué información te falta para evaluar con tranquilidad?`,
      en: `About the delivery timeline${enProduct}, what information would help you evaluate it?`,
    },
    unit_view: {
      pt_BR: `Sobre a vista da unidade${product}, quer continuar essa conferência com o comercial?`,
      es: `Sobre la vista de la unidad${product}, ¿quieres continuar esa consulta con el equipo comercial?`,
      en: `About the unit's view${enProduct}, would you like to continue checking it with our sales team?`,
    },
    price: {
      pt_BR: `Sobre os valores${product}, quer retomar a consulta às opções atuais?`,
      es: `Sobre los valores${product}, ¿quieres retomar la consulta de las opciones actuales?`,
      en: `About the prices${enProduct}, would you like to revisit the currently available options?`,
    },
    payment_terms: {
      pt_BR: `Sobre as condições de pagamento${product}, quer retomar esse ponto com o comercial sem precisar repetir o pedido?`,
      es: `Sobre las condiciones de pago${product}, ¿quieres retomarlas con el equipo comercial sin repetir tu solicitud?`,
      en: `About the payment terms${enProduct}, would you like to continue with our sales team without repeating your request?`,
    },
    trust: {
      pt_BR: 'Sobre sua dúvida em relação à Bossa, qual ponto você gostaria de esclarecer primeiro?',
      es: 'Sobre tu duda acerca de Bossa, ¿qué punto te gustaría aclarar primero?',
      en: 'About your question regarding Bossa, which point would you like to clarify first?',
    },
    timing: {
      pt_BR: `Sobre o seu momento de compra${product}, prefere continuar agora ou combinar outra data?`,
      es: `Sobre tu momento de compra${product}, ¿prefieres continuar ahora o acordar otra fecha?`,
      en: `About your buying timeline${enProduct}, would you prefer to continue now or agree on another date?`,
    },
    availability: {
      pt_BR: `Sobre a disponibilidade${product}, quer que eu retome a consulta ao estoque atual?`,
      es: `Sobre la disponibilidad${product}, ¿quieres que retome la consulta del inventario actual?`,
      en: `About availability${enProduct}, would you like me to check the current inventory?`,
    },
    visit: {
      pt_BR: `Quer retomar a organização da visita${product} de onde paramos?`,
      es: `¿Retomamos la organización de la visita${product} donde la dejamos?`,
      en: `Would you like to continue organizing the visit${enProduct} from where we left off?`,
    },
    video: {
      pt_BR: `Quer retomar a organização da videochamada${product} de onde paramos?`,
      es: `¿Retomamos la organización de la videollamada${product} donde la dejamos?`,
      en: `Would you like to continue organizing the video call${enProduct} from where we left off?`,
    },
    material: {
      pt_BR: `Conseguiu analisar o material que enviei${product}? Posso ajudar com a dúvida que ficou.`,
      es: `¿Pudiste revisar el material que envié${product}? Puedo ayudarte con la duda pendiente.`,
      en: `Did you get a chance to review the material I sent${enProduct}? I can help with any remaining question.`,
    },
    needs_evidence: {
      pt_BR: `Qual informação${product} você ainda precisa conferir antes de avançar?`,
      es: `¿Qué información${product} necesitas comprobar antes de avanzar?`,
      en: `What information${enProduct} would you still like to check before moving forward?`,
    },
    awaiting_return: {
      pt_BR: `Podemos retomar nossa conversa${product} do ponto em que paramos?`,
      es: `¿Podemos retomar nuestra conversación${product} donde la dejamos?`,
      en: `Can we continue our conversation${enProduct} from where we left off?`,
    },
    product: {
      pt_BR: `Sobre o ${enterprise}, quer retomar a dúvida que ficou pendente?`,
      es: `Sobre ${enterprise}, ¿quieres retomar la duda pendiente?`,
      en: `About ${enterprise}, would you like to revisit your remaining question?`,
    },
    generic: {
      pt_BR: 'Quer retomar nossa conversa de onde paramos?',
      es: '¿Quieres retomar nuestra conversación donde la dejamos?',
      en: 'Would you like to continue our conversation from where we left off?',
    },
  };
  const nextStep = journey.requested_next_step;
  const pendingCode = text(pending.client_text) ? text(pending.code) : '';
  const context = nextStep === 'visit' || nextStep === 'video' ? nextStep
    : ['beach_distance', 'delivery_concern', 'unit_view', 'price', 'payment_terms', 'trust', 'timing', 'availability'].includes(code) ? code
      : args.confirmedMaterialSent ? 'material'
        : pendingCode === 'needs_evidence' || pendingCode === 'awaiting_return' ? pendingCode
          : enterprise ? 'product' : 'generic';
  return { body: `${greeting} ${responses[context][language]}`, context };
}
