import { normalizeSignalText, type Enterprise } from './nara-conversation-signals';
import { naraConversationLanguage } from './nara-language';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

// Moved unchanged from the location recovery in ai.ts. These are approved
// institutional facts, not evidence of a unit's view, stock or payment terms.
const APPROVED_LOCATIONS = {
  flow: { name: 'Flow', area: 'Balneário Perequê, Porto Belo', beachMeters: 800, notBeachfront: false, map: 'Flow%20Aptos%20Porto%20Belo%20SC' },
  alma: { name: 'Alma', area: 'Balneário Perequê, Porto Belo', beachMeters: 300, notBeachfront: true, map: 'Alma%20Seahouses%20Porto%20Belo%20SC' },
  soul: { name: 'Soul', area: 'Itapema', beachMeters: 500, notBeachfront: false, map: 'Soul%20Residence%20Itapema%20SC' },
} as const;

function namedEnterprises(text: string): Enterprise[] {
  const value = normalizeSignalText(text);
  return (Object.keys(APPROVED_LOCATIONS) as Enterprise[]).filter((name) => new RegExp(`\\b${name}\\b`).test(value));
}

function requestsLocation(text: string): boolean {
  const value = normalizeSignalText(text);
  // A negated request is not permission to add unsolicited project facts.
  if (/\b(?:nao (?:quero|preciso|pedi|perguntei)|no (?:quiero|necesito|pedi)|(?:do not|don['’]?t) (?:want|need|ask))\b[^.!?;]{0,55}\b(?:localizacao|endereco|distancia|ubicacion|direccion|location|address|distance)\b/.test(value)) return false;
  const asksWhere = /\b(?:onde (?:fica|esta|e)|donde (?:queda|esta|se ubica)|where (?:is|are)|(?:qual|saber|ver|manda\w*|envi\w*|compartilh\w*|quero|preciso|cual|quiero|necesito|send|share|what is))\b[^.!?;]{0,45}\b(?:localiza\w*|endereco|ubicacion|direccion|location|address|mapa|map)\b/.test(value)
    || /\b(?:onde (?:fica|esta|e)|donde (?:queda|esta|se ubica)|where (?:is|are)|no mapa|en el mapa|on (?:the|a) map)\b/.test(value);
  const asksBeachDistance = /\b(?:mar|praia|playa|sea|beach)\b/.test(value)
    && /\b(?:quantos? metros|a quantos? metros|qual (?:e )?a distancia|qual distancia|distancia|longe|perto|cuantos metros|que tan lejos|lejos|cerca|how far|how many met(?:er|re)s|distance|near|close)\b/.test(value);
  return asksWhere || asksBeachDistance;
}

function hasOnlyApprovedLocationSubjects(text: string): boolean {
  // Inspect the location question itself, not a project mentioned in the
  // preceding financial question. This bounded vocabulary intentionally fails
  // closed for an office, another project or an unknown name, in any casing.
  const clauses = text.split(/[.!?;\n]+/u)
    .flatMap((clause) => clause.split(/\b(?:e|y|and)\s+(?=(?:qual|quais|quant[oa]s?|onde|cual(?:es)?|cuant[oa]s?|donde|what|where|how)\b)/iu))
    .filter(requestsLocation);
  const allowed = new Set(('o a os as e em no na nos nas do da dos das de ao aos ate para entre '
    + 'el la los las al del y en hasta desde the and at in from to of for '
    + 'onde fica ficam esta estao sao e localizado localizada situacao localizacao endereco mapa '
    + 'donde queda quedan se ubica ubicacion direccion where is are located location address map '
    + 'qual quais quanto quantos quantas cual cuantos metros distancia longe perto lejos cerca '
    + 'how far many meters metres distance near close mar praia playa sea beach '
    + 'ele ela dele dela esse essa este esta desse dessa deste desta isso it its this that there eso ese '
    + 'empreendimento projeto predio edificio condominio proyecto edificio development project building '
    + 'exatamente exata exacta exactly exact aproximadamente approximately por favor please '
    + 'eu me voce voces pode podem quero gostaria saber ver manda mande enviar envie informe compartilhe '
    + 'yo puedes quiero quisiera saber enviar envia i you can could want know see send share show tell '
    + 'aptos seahouses houses residence').split(' '));
  for (const location of Object.values(APPROVED_LOCATIONS)) {
    for (const word of normalizeSignalText(`${location.name} ${location.area}`).match(/[a-z]+/g) ?? []) allowed.add(word);
  }
  return clauses.length > 0 && clauses.every((clause) => {
    const words = normalizeSignalText(clause).match(/[\p{L}\p{N}]+/gu) ?? [];
    return words.every((word) => allowed.has(word));
  });
}

function unambiguousEnterprise(history: ChatMessage[], latest: string): Enterprise | null {
  // Do not resolve "the other one" or a named, unknown development by falling
  // back to the earlier project's distance. Multiple projects also fail closed.
  if (/\b(?:outro|outra|ambos|ambas|otro|otra|other|both)\b/.test(normalizeSignalText(latest))) return null;
  const current = namedEnterprises(latest);
  if (current.length) return current.length === 1 ? current[0] : null;
  for (let index = history.length - 2; index >= 0; index -= 1) {
    const names = namedEnterprises(history[index].content);
    if (names.length) return names.length === 1 ? names[0] : null;
  }
  return null;
}

/** Only answer an explicit current location/distance question from the approved
 * source. Never salvage free-form model prose or the customer's factual claims. */
export function naraApprovedLocationReply(history: ChatMessage[], options: { includeMap?: boolean } = {}): string {
  let latestIndex = history.length - 1;
  while (latestIndex >= 0 && history[latestIndex].role !== 'user') latestIndex -= 1;
  if (latestIndex < 0) return '';
  const latest = history[latestIndex].content;
  if (!requestsLocation(latest) || !hasOnlyApprovedLocationSubjects(latest)) return '';
  const enterprise = unambiguousEnterprise(history.slice(0, latestIndex + 1), latest);
  if (!enterprise) return '';
  const location = APPROVED_LOCATIONS[enterprise];
  const language = naraConversationLanguage(history.slice(0, latestIndex + 1));
  const reply = language === 'es'
    ? `El ${location.name} está en ${location.area}, a ${location.beachMeters} m del mar${location.notBeachfront ? '; no está frente al mar' : ''}.`
    : language === 'en'
      ? `${location.name} is in ${location.area}, ${location.beachMeters} m from the beach${location.notBeachfront ? '; it is not beachfront' : ''}.`
      : `O ${location.name} fica em ${location.area}, a ${location.beachMeters} m do mar${location.notBeachfront ? '; não é frente-mar' : ''}.`;
  if (!options.includeMap) return reply;
  const label = language === 'es' ? 'Puedes verlo en el mapa' : language === 'en' ? 'You can check the map' : 'Você pode conferir no mapa';
  return `${reply} ${label}: https://www.google.com/maps/search/?api=1&query=${location.map}`;
}
