import { enterpriseInFocus } from './nara-conversation-signals';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function normal(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * A household actively evaluating how an apartment would work is a prospective
 * buyer, even if they haven't announced a budget or said "quero comprar".
 * This is a modest score floor, never a commercial handoff or appointment.
 */
export function hasConcreteHousingInterest(history: ChatMessage[]): boolean {
  const messages = history.filter((item) => item.role === 'user').map((item) => normal(item.content));
  const latest = messages.at(-1) ?? '';
  if (!latest || /\b(?:nao quero comprar|nao vou comprar|nao tenho interesse|apenas pesquisando|so estou pesquisando|nao estou procurando|fora do meu orcamento|nao cabe no meu orcamento)\b/.test(latest)) return false;

  const conversation = messages.join(' ');
  const explicitHousing = messages.some((text) =>
    /\b(?:quero|queremos|procuro|procuramos|busco|buscamos|preciso|precisamos|pretendo|pretendemos|gostaria de|gostariamos de|estou buscando|estamos buscando)\b.{0,65}\b(?:apartamento|apto|imovel|casa de praia|morar|investir|veranear)\b/.test(text)
    || /\b(?:para morar|pra morar|para viver|pra viver|para minha familia|para meus filhos|quero investir no|quero investir em)\b/.test(text),
  );

  const householdProfile = /\b(?:somos (?:\d+|dois|duas|tres|quatro|cinco) pessoas|meus filhos|minha familia|nossa familia|meu marido|minha esposa|trabalho de casa|home office)\b/.test(conversation);
  const evaluatingFit = /\b(?:suites|quartos|planta|metragem|espaco|62 m2|73 m2|103 m2|114 m2|145 m2|168 m2|coworking|lazer|cabe|apertado|serve|atende|distribuicao)\b/.test(conversation);
  return explicitHousing || (householdProfile && evaluatingFit);
}

/**
 * Only enrich a *validated CRM quote* when the buyer actually objected to the
 * price. The official price is kept verbatim and no new commercial condition is
 * introduced. An explicit "only the number" request remains number-only.
 */
export function priceObjectionValueBridge(
  reply: string,
  history: ChatMessage[],
  source: 'model' | 'crm' | 'unconfirmed',
  enterprise?: string | null,
): string {
  if (source !== 'crm') return reply;
  const latest = normal([...history].reverse().find((item) => item.role === 'user')?.content ?? '');
  const objection = /\b(?:achei|considero|estou achando|to achando)\b.{0,65}\bcaro\b|\b(?:esta|ta)\s+(?:muito\s+)?caro\b|\b(?:preco|valor) (?:esta |ta )?(?:alto|puxado)\b|\bmais caro\b|\b(?:concorrente|outro empreendimento|outra construtora) (?:e |esta |ta )?mais barat[oa]\b|\bacima (?:do que esperava|do meu orcamento)\b/.test(latest);
  if (!objection || /\b(?:so|apenas|somente) (?:quero |me passe |me diga )?(?:o |a )?(?:preco|valor|numero|total)\b|\bsem (?:explicacao|detalhes)\b/.test(latest)) return reply;
  if (!/\br\$\s*[\d.,]/i.test(reply)) return reply;

  const focus = enterpriseInFocus(history) || normal(enterprise ?? '');
  const project = /\bflow\b/.test(focus) ? 'flow' : /\balma\b/.test(focus) ? 'alma' : /\bsoul\b/.test(focus) ? 'soul' : null;
  if (!project) return reply;

  const comparison = {
    flow: 'Para comparar com outro imóvel, vale olhar também a entrega prevista para novembro de 2027, os dois pavimentos de lazer e o padrão de execução da Bossa. Se quiser, podemos comparar esses pontos com o projeto que você viu.',
    alma: 'Na comparação, vale considerar a proposta de dois apartamentos por andar, os espaços de convivência familiar e a entrega prevista para julho de 2030. Se quiser, podemos comparar esses critérios com o outro projeto.',
    soul: 'Na comparação, um ponto importante é que o Soul já foi entregue. Se quiser, podemos olhar juntos os critérios de localização, planta e estado do imóvel.',
  }[project];
  return `${reply.trim()}\n\n${comparison}`;
}
