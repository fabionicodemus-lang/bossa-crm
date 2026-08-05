from pathlib import Path
import re


def replace_once(path: Path, old: str, new: str) -> None:
    source = path.read_text(encoding='utf-8')
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one exact anchor, found {count}: {old[:100]!r}')
    path.write_text(source.replace(old, new, 1), encoding='utf-8')


def regex_once(path: Path, pattern: str, replacement: str) -> None:
    source = path.read_text(encoding='utf-8')
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{path}: regex anchor not found: {pattern[:120]!r}')
    path.write_text(updated, encoding='utf-8')

root = Path('.')

routing = r'''export function normalizeNaraRoutingText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

function withoutNegatedBrokerIdentity(value: string): string {
  let text = normalizeNaraRoutingText(value);
  if (/\bnao sou (?:um |uma )?corretor(?:a)?\b/.test(text)) {
    text = text.replace(/\b(corretor|corretora|imobiliaria|creci)\b/g, ' ');
  }
  return text.replace(/\s+/g, ' ').trim();
}

export function isAssistedSaleSignal(value: string): boolean {
  const text = normalizeNaraRoutingText(value);
  return /\b(?:meu|minha|o|a|um|uma)\s+(?:corretor|corretora|imobiliaria)\b.{0,50}\b(?:me indicou|me mandou|me apresentou|me encaminhou|passou meu contato|indicou voces)\b/.test(text)
    || /\b(?:vim|cheguei|fui indicado|recebi indicacao)\b.{0,40}\b(?:corretor|corretora|imobiliaria)\b/.test(text)
    || /\b(?:corretor|corretora|imobiliaria)\b.{0,40}\b(?:me indicou|me mandou|me apresentou|me encaminhou)\b/.test(text);
}

export function isExplicitBrokerSignal(value: string): boolean {
  if (isAssistedSaleSignal(value)) return false;
  const text = withoutNegatedBrokerIdentity(value);
  return /\b(?:sou|trabalho como|atuo como|falo como)\s+(?:um |uma )?corretor(?:a)?(?: de imoveis)?\b/.test(text)
    || /\b(?:sou|trabalho|atuo)\s+(?:em|numa|na)\s+(?:uma )?imobiliaria\b/.test(text)
    || /\b(?:minha|da nossa) imobiliaria\b/.test(text)
    || /\bmeu creci\b/.test(text)
    || /\bcorretor(?:a)? parceiro(?:a)?\b/.test(text);
}

export function hasStrongBrokerVocabulary(value: string): boolean {
  if (isAssistedSaleSignal(value)) return false;
  const text = withoutNegatedBrokerIdentity(value);
  return /\b(?:espelho(?: de vendas)?|comissionamento|comissao|vgv|pool de vendas|tabela de comissao|parceria com imobiliaria|parceria imobiliaria|meu cliente|tenho (?:um )?cliente|cliente interessado)\b/.test(text)
    || /\bcreci\s*[-:]?\s*\d+/i.test(text);
}

export function isBrokerRoutingSignal(value: string): boolean {
  return isExplicitBrokerSignal(value) || hasStrongBrokerVocabulary(value);
}

export function isCurrentCustomerSignal(value: string): boolean {
  const text = normalizeNaraRoutingText(value);
  if (/\bnao sou (?:um |uma )?cliente\b/.test(text)) return false;
  return /\b(?:ja comprei|sou cliente|comprei com voces|segunda via|boleto|meu contrato|minha unidade|meu apartamento|assistencia tecnica|pos-venda)\b/.test(text);
}
'''
(root / 'src/lib/nara-contact-routing.ts').write_text(routing, encoding='utf-8')

ai = root / 'src/lib/ai.ts'
replace_once(ai,
"import { extractNaraPrompt } from './nara-prompt-config';\n",
"import { extractNaraPrompt } from './nara-prompt-config';\nimport { isAssistedSaleSignal, isBrokerRoutingSignal, isCurrentCustomerSignal } from './nara-contact-routing';\n")
replace_once(ai,
"type OutsideBuyerDestination = 'plantao' | 'pos_venda' | 'equipe';",
"type OutsideBuyerDestination = 'plantao' | 'pos_venda' | 'equipe' | 'venda_assistida';")
regex_once(ai,
    r"function outsideBuyerDestination\(history: ChatMessage\[\]\): OutsideBuyerDestination \| null \{.*?\n\}\n\nfunction routeOutsideBuyerProfile",
    r'''function outsideBuyerDestination(history: ChatMessage[]): OutsideBuyerDestination | null {
  const userMessages = history
    .filter((item) => item.role === 'user')
    .map((item) => item.content);
  const fullHistory = userMessages.map(routingText).join('\n');
  const current = routingText(lastUserText(history));

  if (userMessages.some(isAssistedSaleSignal)) return 'venda_assistida';
  if (userMessages.some(isBrokerRoutingSignal)) return 'plantao';
  if (userMessages.some(isCurrentCustomerSignal)) return 'pos_venda';
  if (/\b(fornecedor|prestador|curriculo|vaga|trabalhar com voces|cobranca|imprensa)\b/.test(fullHistory)) return 'equipe';

  const ambiguousSignal = /\b(entrega|chaves|contrato|pos-venda|assistencia)\b/.test(current);
  const existingClientSignal = /\b(ja comprei|sou cliente|minha unidade|meu apartamento|comprei com voces|minha obra)\b/.test(current);
  return ambiguousSignal && existingClientSignal ? 'pos_venda' : null;
}

function routeOutsideBuyerProfile''')
replace_once(ai,
"  const consultant = runtimeVariable(context, 'consultant_on_duty_name');\n  if (destination === 'plantao') {",
"  const consultant = runtimeVariable(context, 'consultant_on_duty_name');\n  if (destination === 'venda_assistida') {\n    return 'Como você veio indicado por um corretor, vou registrar a parceria e passar seu atendimento ao comercial. Qual é o nome do corretor e da imobiliária?';\n  }\n  if (destination === 'plantao') {")
replace_once(ai,
"  if (destination === 'plantao') return 'Contato se identificou como corretor ou imobiliária e deve continuar pelo Plantão.';\n  if (destination === 'pos_venda') return 'Contato indicou que já é cliente e precisa de atendimento de pós-venda.';",
"  if (destination === 'plantao') return 'Contato se identificou como corretor ou imobiliária e deve continuar pelo Plantão.';\n  if (destination === 'venda_assistida') return 'Possível comprador informou que veio indicado por corretor ou imobiliária; a venda deve preservar a parceria.';\n  if (destination === 'pos_venda') return 'Contato indicou que já é cliente e precisa de atendimento de pós-venda.';")
replace_once(ai,
"  if (destination === 'plantao') return 'Continuar o atendimento pelo Plantão no pipeline de corretores.';\n  if (destination === 'pos_venda') return 'Encaminhar para o pós-venda e identificar o assunto informado pelo cliente.';",
"  if (destination === 'plantao') return 'Continuar o atendimento pelo Plantão no pipeline de corretores.';\n  if (destination === 'venda_assistida') return 'Registrar o corretor e a imobiliária de origem e encaminhar ao comercial sem conduzir venda direta.';\n  if (destination === 'pos_venda') return 'Encaminhar para o pós-venda e identificar o assunto informado pelo cliente.';")
replace_once(ai,
"vi (?:um )?anuncio.*(?:flow|alma|apartamento|imovel|empreendimento)|quero saber mais.*empreendimento",
"vi (?:um )?anuncio.*(?:flow|alma|apartamento|imovel|empreendimento)|vi (?:um )?anuncio(?: de voces| da bossa)?|quero saber mais.*empreendimento")
replace_once(ai,
"export function naraReplyWordCount(value: string): number {\n  return value.match(/[\\p{L}\\p{N}]+(?:['’.-][\\p{L}\\p{N}]+)*/gu)?.length ?? 0;\n}\n",
"export function naraReplyWordCount(value: string): number {\n  return value.match(/[\\p{L}\\p{N}]+(?:['’.-][\\p{L}\\p{N}]+)*/gu)?.length ?? 0;\n}\n\nexport function naraReplyQuestionCount(value: string): number {\n  return value.match(/\\?/g)?.length ?? 0;\n}\n")
replace_once(ai,
"  if (naraReplyWordCount(value) > NARA_REPLY_WORD_LIMIT) violations.push('mais_de_45_palavras');\n  if (hasForbiddenScarcityClaim(value)) violations.push('escassez_fabricada');",
"  if (naraReplyWordCount(value) > NARA_REPLY_WORD_LIMIT) violations.push('mais_de_45_palavras');\n  if (naraReplyQuestionCount(value) > 1) violations.push('mais_de_uma_pergunta');\n  if (hasForbiddenScarcityClaim(value)) violations.push('escassez_fabricada');")
replace_once(ai,
"function enforceNaraTriage(turn: AiTurn, lead: Lead, history: ChatMessage[], context: AiTrainingContext): AiTurn {",
"export function enforceNaraTriage(turn: AiTurn, lead: Lead, history: ChatMessage[], context: AiTrainingContext): AiTurn {")

units = root / 'src/lib/nara-unit-queries.ts'
replace_once(units,
"import type { Lead } from './types';\n",
"import type { Lead } from './types';\nimport { isAssistedSaleSignal, isBrokerRoutingSignal, isCurrentCustomerSignal } from './nara-contact-routing';\n")
replace_once(units,
"  blocked_reason?: 'corretor' | 'cliente_atual';",
"  blocked_reason?: 'corretor' | 'cliente_atual' | 'venda_assistida';")
regex_once(units,
    r"function routingProfileText\(value: string\): string \{.*?\n\}\n\nfunction blockedCommercialContext",
    r'''function blockedCommercialProfile(
  lead: Lead,
  history: ChatMessage[],
): 'corretor' | 'cliente_atual' | 'venda_assistida' | null {
  if (lead.kind === 'corretor') return 'corretor';
  const userMessages = history
    .filter((item) => item.role === 'user')
    .map((item) => item.content);
  if (userMessages.some(isAssistedSaleSignal)) return 'venda_assistida';
  if (userMessages.some(isBrokerRoutingSignal)) return 'corretor';
  const metadata = JSON.stringify(lead.metadata ?? {});
  if (isBrokerRoutingSignal(metadata)) return 'corretor';
  if (userMessages.some(isCurrentCustomerSignal) || isCurrentCustomerSignal(metadata)) return 'cliente_atual';
  return null;
}

function blockedCommercialContext''')
replace_once(units,
"  reason: 'corretor' | 'cliente_atual',\n  consultedAt: string,\n): NaraCommercialTurnContext {\n  if (reason === 'corretor') {",
"  reason: 'corretor' | 'cliente_atual' | 'venda_assistida',\n  consultedAt: string,\n): NaraCommercialTurnContext {\n  if (reason === 'venda_assistida') {\n    return {\n      consulted_at: consultedAt,\n      source_table: 'development_units',\n      calls: [],\n      blocked_reason: reason,\n      error: 'nara_price_disabled_for_assisted_sale',\n      source_text: 'CONSULTA COMERCIAL BLOQUEADA: o contato informou que veio indicado por corretor ou imobiliária. Não conduza venda direta nem informe preço, tabela, unidade ou disponibilidade. Registre a origem e encaminhe ao comercial.',\n    };\n  }\n  if (reason === 'corretor') {")

hybrid_server = root / 'src/lib/hybrid-server.ts'
replace_once(hybrid_server,
"import type { Lead } from './types';\n",
"import type { Lead } from './types';\nimport { isAssistedSaleSignal, isBrokerRoutingSignal } from './nara-contact-routing';\n")
regex_once(hybrid_server,
    r"function normalize\(value: string\): string \{.*?\n\}\n\nfunction brokerRoutingDecision",
    "function brokerRoutingDecision")
insert_anchor = "export async function applyHybridDecision(args: {"
assisted_fn = r'''function assistedSaleDecision(base: HybridDecision, turn: AiTurn): HybridDecision {
  const dueAt = new Date(Date.now() + 5 * 60_000).toISOString();
  return {
    ...base,
    stage: 'passagem_pendente',
    priorityClass: 'A1',
    ownerMode: 'ai',
    aiEnabled: true,
    handoffRequired: true,
    handoffReason: 'O contato informou que veio indicado por corretor ou imobiliária; a parceria precisa ser preservada.',
    nextAction: 'Registrar o corretor e a imobiliária de origem e assumir o atendimento comercial sem condução direta pela Nara.',
    nextActionType: 'venda_assistida',
    nextActionDueAt: dueAt,
    reactivationAt: null,
    noteTitle: 'Nara identificou venda assistida por corretor',
    noteDescription: turn.summary
      ? `${turn.summary} A indicação do corretor deve ser registrada antes da continuidade comercial.`
      : 'O contato veio indicado por corretor ou imobiliária e foi encaminhado para continuidade humana.',
    taskTitle: 'Assumir venda assistida',
    taskDescription: 'Registrar corretor e imobiliária de origem e continuar o atendimento preservando a parceria.',
    taskPriority: 'urgent',
    taskDueAt: dueAt,
    taskDedupeKey: 'handoff:venda-assistida',
  };
}

'''
replace_once(hybrid_server, insert_anchor, assisted_fn + insert_anchor)
replace_once(hybrid_server,
"  const routedToBroker = args.lead.kind === 'cliente'\n    && explicitlyIdentifiesAsBroker(args.lastUserMessage);\n  const decision = routedToBroker\n    ? brokerRoutingDecision(baseDecision, args.turn)\n    : baseDecision;\n  const classification = routedToBroker ? 'cadastrado' : args.turn.classification;\n  const now = new Date().toISOString();",
"  const routedToAssistedSale = args.lead.kind === 'cliente'\n    && isAssistedSaleSignal(args.lastUserMessage);\n  const routedToBroker = args.lead.kind === 'cliente'\n    && !routedToAssistedSale\n    && isBrokerRoutingSignal(args.lastUserMessage);\n  const decision = routedToAssistedSale\n    ? assistedSaleDecision(baseDecision, args.turn)\n    : routedToBroker\n      ? brokerRoutingDecision(baseDecision, args.turn)\n      : baseDecision;\n  const classification = routedToBroker ? 'cadastrado' : args.turn.classification;\n  const now = new Date().toISOString();")
replace_once(hybrid_server,
"    ...(routedToBroker ? {\n      contact_kind_routed_from: 'cliente',\n      contact_kind_routed_to: 'corretor',\n      contact_kind_routed_at: now,\n      contact_kind_routed_reason: args.lastUserMessage,\n    } : {}),",
"    ...(routedToBroker ? {\n      contact_kind_routed_from: 'cliente',\n      contact_kind_routed_to: 'corretor',\n      contact_kind_routed_at: now,\n      contact_kind_routed_reason: args.lastUserMessage,\n    } : {}),\n    ...(routedToAssistedSale ? {\n      sale_assisted: true,\n      sale_assisted_detected_at: now,\n      sale_assisted_source_message: args.lastUserMessage,\n    } : {}),")
replace_once(hybrid_server,
"  const shouldLog = routedToBroker\n    || changed(decision.stage, args.lead.stage)",
"  const shouldLog = routedToBroker\n    || routedToAssistedSale\n    || changed(decision.stage, args.lead.stage)")
replace_once(hybrid_server,
"      type: routedToBroker ? 'lead_direcionado_corretor' : 'analise_hibrida_ia',",
"      type: routedToBroker\n        ? 'lead_direcionado_corretor'\n        : routedToAssistedSale\n          ? 'venda_assistida_identificada'\n          : 'analise_hibrida_ia',")
replace_once(hybrid_server,
"        routed_to_kind: routedToBroker ? 'corretor' : null,\n        stage_before:",
"        routed_to_kind: routedToBroker ? 'corretor' : null,\n        sale_assisted: routedToAssistedSale,\n        stage_before:")
replace_once(hybrid_server,
"        routed_to_kind: routedToBroker ? 'corretor' : null,\n      },\n    };",
"        routed_to_kind: routedToBroker ? 'corretor' : null,\n        sale_assisted: routedToAssistedSale,\n      },\n    };")

ai_v120 = root / 'src/lib/ai-v120.ts'
replace_once(ai_v120,
"function hasPriorTriage(history: ChatMessage[]): boolean {\n  return assistantMessages(history).some(looksLikeTriageQuestion);\n}\n",
"function hasPriorTriage(history: ChatMessage[]): boolean {\n  return assistantMessages(history).some(looksLikeTriageQuestion);\n}\n\nexport function naraReplyOpeningKey(value: string): string {\n  const firstClause = normalizeText(value.split(/[.!?]/, 1)[0] ?? '');\n  if (!firstClause) return '';\n  return firstClause.split(' ').slice(0, 4).join(' ');\n}\n\nfunction withoutRepeatedOpening(value: string): string {\n  const match = value.trim().match(/^[^.!?]+[.!?]\\s*(.+)$/s);\n  if (!match?.[1]?.trim()) return '';\n  const remainder = match[1].trim();\n  return remainder.charAt(0).toLocaleUpperCase('pt-BR') + remainder.slice(1);\n}\n")
replace_once(ai_v120,
"function postProcessNaraTurn(turn: AiTurn, history: ChatMessage[]): AiTurn {",
"export function postProcessNaraTurn(turn: AiTurn, history: ChatMessage[]): AiTurn {")
replace_once(ai_v120,
"  const latest = normalizeText(lastUserText(history));\n  const priorReplies = assistantMessages(history).map(normalizeText);\n\n  const asksAboutBossa",
"  const latest = normalizeText(lastUserText(history));\n  const priorMessages = assistantMessages(history);\n  const priorReplies = priorMessages.map(normalizeText);\n\n  const asksIfRobot = /\\b(voce e|vc e|e uma|eh uma)\\s*(?:um |uma )?(?:robo|robot|ia|inteligencia artificial)|\\bassistente digital\\b/.test(latest);\n  if (asksIfRobot) {\n    return applyConversationDecision(turn, {\n      reply: 'Sou a assistente digital da Bossa, sim 🙂 Se preferir falar com uma pessoa, chamo alguém do time agora. Quer que eu faça isso?',\n      handoff: true,\n      summary: 'Contato perguntou se a Nara é uma inteligência artificial.',\n      nextAction: 'Oferecer passagem imediata para atendimento humano.',\n    });\n  }\n\n  const asksAboutBossa")
replace_once(ai_v120,
"  const normalizedReply = normalizeText(turn.reply);\n  const repeated = Boolean(normalizedReply) && priorReplies.slice(-8).includes(normalizedReply);",
"  const currentOpening = naraReplyOpeningKey(turn.reply);\n  const priorOpenings = priorMessages.slice(-12).map(naraReplyOpeningKey).filter(Boolean);\n  if (currentOpening && priorOpenings.includes(currentOpening)) {\n    const rewritten = withoutRepeatedOpening(turn.reply);\n    if (rewritten) turn.reply = rewritten;\n  }\n\n  const normalizedReply = normalizeText(turn.reply);\n  const repeated = Boolean(normalizedReply) && priorReplies.slice(-8).includes(normalizedReply);")

acceptance = r'''import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  enforceNaraTriage,
  hasForbiddenScarcityClaim,
  naraReplyGuardrailViolations,
  naraReplyQuestionCount,
} from '../src/lib/ai.ts';
import { naraReplyOpeningKey, postProcessNaraTurn } from '../src/lib/ai-v120.ts';
import { aiCanReply, deriveHybridDecision } from '../src/lib/hybrid.ts';
import { isAssistedSaleSignal, isBrokerRoutingSignal } from '../src/lib/nara-contact-routing.ts';
import { loadNaraCommercialTurnContext } from '../src/lib/nara-unit-queries.ts';

const passed = [];
async function accept(number, title, run) {
  await run();
  passed.push({ number, title });
}

const baseLead = {
  id: 'lead', organization_id: 'org', kind: 'cliente', name: 'Teste', phone: '5547999999999',
  stage: 'novo_triagem', owner_mode: 'ai', ai_enabled: true, opt_out: false,
  automation_paused: false, enterprise: 'Flow Aptos', metadata: {}, reactivation_at: null,
  handoff_requested_at: null, owner_id: null, backup_owner_id: null,
};

function turn(overrides = {}) {
  return {
    reply: 'Posso te mostrar as opções.', classification: 'morno', score: 45, stage: 'ia',
    summary: 'Contato em atendimento.', next_action: 'Continuar.', handoff: false,
    attachment_ids: [],
    extracted: {
      enterprise: '', purpose: '', typology: '', budget: '', deadline: '',
      decision_maker: '', company: '', creci: '', region: '', client_status: '',
    },
    ...overrides,
  };
}

const generalCommercial = {
  consulted_at: '2026-08-05T12:00:00Z', source_table: 'development_units',
  calls: [{
    name: 'faixa_empreendimento', arguments: { empreendimento: 'Flow' },
    result: { empreendimento: 'Flow Aptos', valor_minimo: 900000, valor_maximo: 1050000, entrada_minima: 180000, qtd_disponiveis: 4 },
  }],
  source_text: '[faixa_empreendimento] empreendimento=Flow Aptos; valor_minimo=R$ 900.000,00; valor_maximo=R$ 1.050.000,00; entrada_minima=R$ 180.000,00; qtd_disponiveis=4',
};
const unitCommercial = {
  consulted_at: '2026-08-05T12:00:00Z', source_table: 'development_units',
  calls: [{
    name: 'consultar_apartamento', arguments: { empreendimento: 'Flow', unidade: '901' },
    result: { empreendimento: 'Flow Aptos', unidade: '901', andar: 9, tipologia: '2 suítes', valor: 900000, entrada: 180000, parcela_media: 4500, quantidade_parcelas: 60, indice_correcao: 'CUB/SC', validade_tabela: '2026-08-31', referencia_tabela: '2026-08', preco_atualizado_em: '2026-08-05T10:00:00Z' },
  }],
  source_text: '[consultar_apartamento] empreendimento=Flow Aptos; unidade=901; andar=9; tipologia=2 suítes; valor=R$ 900.000,00; entrada=R$ 180.000,00; parcela_media=R$ 4.500,00; quantidade_parcelas=60; indice_correcao=CUB/SC; validade_tabela=2026-08-31',
};

class Query {
  constructor(rows) { this.rows = rows; this.filters = []; this.orders = []; this.maxRows = null; }
  select() { return this; }
  eq(column, value) { this.filters.push((row) => row[column] === value); return this; }
  gt(column, value) { this.filters.push((row) => Number(row[column]) > Number(value)); return this; }
  gte(column, value) { this.filters.push((row) => Number(row[column]) >= Number(value)); return this; }
  lte(column, value) { this.filters.push((row) => Number(row[column]) <= Number(value)); return this; }
  in(column, values) { this.filters.push((row) => values.includes(row[column])); return this; }
  order(column, options = {}) { this.orders.push({ column, ascending: options.ascending !== false }); return this; }
  limit(value) { this.maxRows = value; return this; }
  execute() {
    let data = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    for (const order of [...this.orders].reverse()) {
      data = [...data].sort((a, b) => {
        const result = Number(a[order.column]) - Number(b[order.column]);
        return order.ascending ? result : -result;
      });
    }
    if (this.maxRows !== null) data = data.slice(0, this.maxRows);
    return Promise.resolve({ data, error: null });
  }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
  maybeSingle() { return this.execute().then(({ data, error }) => ({ data: data[0] ?? null, error })); }
}
class FakeSupabase {
  constructor(tables) { this.tables = tables; }
  from(name) { return new Query(this.tables[name] ?? []); }
}
const fakeClient = new FakeSupabase({
  developments: [{ id: 'flow', organization_id: 'org', name: 'Flow Aptos', slug: 'flow-aptos', code: 'FLOW', delivery_date: '2027-11-01', active: true }],
  development_typologies: [{ id: 'flow-2s', organization_id: 'org', development_id: 'flow', code: '02', name: '2 suítes', bedrooms: 2, suites: 2, private_area_m2: 62, active: true }],
  development_units: [
    { id: 'f901', organization_id: 'org', development_id: 'flow', typology_id: 'flow-2s', unit_code: '901', floor: 9, status: 'disponivel', list_price: 900000, entry_amount: 180000, installment_count: 60, installment_amount: 4500, payment_plan: { table_reference: '2026-08', indice_correcao: 'CUB/SC' }, price_updated_at: '2026-08-05T10:00:00Z' },
    { id: 'f1301', organization_id: 'org', development_id: 'flow', typology_id: 'flow-2s', unit_code: '1301', floor: 13, status: 'reservado', list_price: 980000, entry_amount: 196000, installment_count: 60, installment_amount: 4900, payment_plan: {}, price_updated_at: '2026-08-05T10:00:00Z' },
  ],
});

await accept(1, 'Primeira mensagem de anúncio apresenta produtos sem triagem', () => {
  const result = enforceNaraTriage(turn({ reply: 'A Bossa tem o Flow, com entrega em 2027, e o Alma, com 30 andares. Viu qual dos dois?' }), baseLead, [{ role: 'user', content: 'Vi um anúncio de vocês' }], {});
  assert.match(result.reply, /Nara.*Bossa/i);
  assert.match(result.reply, /Flow.*Alma/i);
  assert.doesNotMatch(result.reply, /direcionar certinho/i);
});

await accept(2, 'Pedido do menor recebe faixa e permanece frio', () => {
  const result = enforceNaraTriage(turn({ reply: 'No Flow, os valores começam em R$ 900 mil.', score: 72, classification: 'quente' }), baseLead, [{ role: 'user', content: 'Quanto custa o menor?' }], { commercial: generalCommercial });
  assert.equal(result.classification, 'frio');
  assert.ok(result.score <= 20);
  assert.match(result.reply, /R\$ 900 mil/);
});

await accept(3, 'Duas tentativas de triagem não entram em loop', () => {
  const history = [
    { role: 'assistant', content: 'Para eu te direcionar certinho, você está buscando um imóvel para comprar ou precisa falar com a Bossa sobre outro assunto?' },
    { role: 'user', content: 'Não respondi' },
    { role: 'assistant', content: 'Só para eu seguir pelo caminho certo: seu interesse é conhecer um imóvel para comprar ou você precisa de outro atendimento da Bossa?' },
    { role: 'user', content: 'Ainda não sei' },
  ];
  const result = enforceNaraTriage(turn(), baseLead, history, {});
  assert.equal(result.handoff, true);
  assert.doesNotMatch(result.reply, /buscando um imóvel para comprar/i);
  assert.doesNotMatch(result.reply, /interesse é conhecer um imóvel/i);
});

await accept(4, 'Vinte turnos não repetem abertura', () => {
  const history = [];
  const openings = new Set();
  for (let index = 1; index <= 20; index += 1) {
    history.push({ role: 'user', content: `Quero saber sobre a planta ${index}` });
    const processed = postProcessNaraTurn(turn({ reply: `Entendi. A planta ${index} tem uma configuração própria.` }), history);
    const opening = naraReplyOpeningKey(processed.reply);
    assert.ok(opening);
    assert.equal(openings.has(opening), false, `abertura repetida no turno ${index}: ${opening}`);
    openings.add(opening);
    history.push({ role: 'assistant', content: processed.reply });
  }
});

await accept(5, 'Faixa sem intenção passa com origem comprovada', () => {
  const result = enforceNaraTriage(turn({ reply: 'Hoje a faixa do Flow vai de R$ 900 mil a R$ 1,05 milhão.' }), baseLead, [{ role: 'user', content: 'Qual a faixa do Flow?' }], { commercial: generalCommercial });
  assert.match(result.reply, /R\$ 900 mil/);
  assert.equal(result.handoff, false);
});

await accept(6, 'Apartamento específico sem intenção é bloqueado', () => {
  const result = enforceNaraTriage(turn({ reply: 'O 901 custa R$ 900 mil, entrada de R$ 180 mil e parcela de R$ 4.500.', attachment_ids: ['tabela'] }), baseLead, [{ role: 'user', content: 'Qual o valor da unidade 901?' }], { commercial: unitCommercial });
  assert.doesNotMatch(result.reply, /901|900 mil|180 mil|4\.500/);
  assert.deepEqual(result.attachment_ids, []);
  assert.ok(result.score <= 20);
});

await accept(7, 'Apartamento específico com intenção mantém condição completa', () => {
  const reply = 'O 901, 9º andar, custa R$ 900 mil, entrada de R$ 180 mil e parcelas de R$ 4.500. Valor atual, corrigido pelo CUB/SC até a entrega.';
  const result = enforceNaraTriage(turn({ reply, score: 88, classification: 'quente', handoff: true }), baseLead, [{ role: 'user', content: 'Quero comprar para morar. Qual o valor da unidade 901 do Flow?' }], { commercial: unitCommercial });
  assert.equal(result.reply, reply);
  assert.match(result.reply, /entrada de R\$ 180 mil/);
  assert.match(result.reply, /parcelas de R\$ 4\.500/);
  assert.match(result.reply, /CUB\/SC/);
});

await accept(8, 'Indisponível retorna vazio e não fabrica escassez', async () => {
  const context = await loadNaraCommercialTurnContext(fakeClient, 'org', baseLead, [{ role: 'user', content: 'A unidade 1301 do Flow está disponível?' }]);
  assert.equal(context?.calls[0]?.result, null);
  assert.equal(hasForbiddenScarcityClaim('Esse apartamento não está disponível. Posso verificar alternativas?'), false);
  assert.equal(hasForbiddenScarcityClaim('Esse apartamento acabou de ser vendido.'), true);
});

await accept(9, 'Pedido de tabela recebe somente curadoria agregada', async () => {
  const context = await loadNaraCommercialTurnContext(fakeClient, 'org', baseLead, [{ role: 'user', content: 'Me manda a tabela completa do Flow' }]);
  assert.equal(context?.calls.length, 1);
  assert.equal(context?.calls[0]?.name, 'faixa_empreendimento');
});

await accept(10, 'Falha da consulta escala sem inventar números', async () => {
  const failing = { from() { throw new Error('database unavailable'); } };
  const context = await loadNaraCommercialTurnContext(failing, 'org', baseLead, [{ role: 'user', content: 'Quanto custa o Flow?' }]);
  assert.ok(context?.error);
  assert.equal(context?.calls.length, 0);
  assert.match(context?.source_text ?? '', /não respondeu|Não informe números/i);
});

await accept(11, 'Vocabulário de corretor bloqueia preço e aciona mudança de pipeline', async () => {
  const message = 'Tenho um cliente e preciso do espelho, comissão, VGV e tabela do Flow.';
  assert.equal(isBrokerRoutingSignal(message), true);
  const context = await loadNaraCommercialTurnContext({ from() { throw new Error('não deveria consultar'); } }, 'org', baseLead, [{ role: 'user', content: message }]);
  assert.equal(context?.blocked_reason, 'corretor');
  assert.equal(context?.calls.length, 0);
});

await accept(12, 'Cliente atual com boleto vai ao pós-venda sem consulta', async () => {
  const context = await loadNaraCommercialTurnContext({ from() { throw new Error('não deveria consultar'); } }, 'org', baseLead, [{ role: 'user', content: 'Já comprei com vocês e preciso da segunda via do boleto.' }]);
  assert.equal(context?.blocked_reason, 'cliente_atual');
  assert.equal(context?.calls.length, 0);
});

await accept(13, 'Venda assistida preserva o corretor e bloqueia condução direta', async () => {
  const message = 'Meu corretor me indicou. Qual o valor do Flow?';
  assert.equal(isAssistedSaleSignal(message), true);
  assert.equal(isBrokerRoutingSignal(message), false);
  const context = await loadNaraCommercialTurnContext({ from() { throw new Error('não deveria consultar'); } }, 'org', baseLead, [{ role: 'user', content: message }]);
  assert.equal(context?.blocked_reason, 'venda_assistida');
  assert.equal(context?.calls.length, 0);
});

await accept(14, 'Pedido de visita vira A1 com tarefa em cinco minutos', () => {
  const now = new Date('2026-08-05T12:00:00Z');
  const decision = deriveHybridDecision({ lead: baseLead, turn: turn({ score: 60 }), lastUserMessage: 'Quero agendar uma visita', now });
  assert.equal(decision.priorityClass, 'A1');
  assert.equal(decision.stage, 'passagem_pendente');
  assert.equal(decision.taskPriority, 'urgent');
  assert.equal(decision.taskDueAt, '2026-08-05T12:05:00.000Z');
});

await accept(15, 'Humano ativo não é reassumido pela IA', () => {
  const lead = { ...baseLead, stage: 'humano_ativo', owner_mode: 'human', ai_enabled: false };
  assert.equal(aiCanReply(lead), false);
  const decision = deriveHybridDecision({ lead, turn: turn({ summary: 'Novo resumo da conversa.' }), lastUserMessage: 'Tenho outra dúvida' });
  assert.equal(decision.ownerMode, 'human');
  assert.equal(decision.aiEnabled, false);
  assert.match(decision.noteDescription, /Novo resumo/);
});

await accept(16, 'Falha da OpenAI cria tarefa urgente sem mensagem genérica', async () => {
  const source = await readFile(new URL('../src/lib/whatsapp/aiFailure.ts', import.meta.url), 'utf8');
  assert.match(source, /customer_notified: false/);
  assert.match(source, /priority: 'urgent'/);
  assert.match(source, /owner_mode: 'human'/);
  assert.doesNotMatch(source, /provider\.sendText/);
});

await accept(17, 'Janela de 24 horas bloqueia envio e registra atividade', async () => {
  const source = await readFile(new URL('../src/lib/whatsapp/webhookProcessor.ts', import.meta.url), 'utf8');
  assert.ok(source.indexOf('isCustomerServiceWindowOpen') < source.indexOf('provider.sendText'));
  assert.match(source, /type: 'janela_whatsapp_fechada'/);
});

await accept(18, 'Nenhuma resposta passa de 45 palavras', () => {
  const long = Array.from({ length: 46 }, (_, index) => `palavra${index}`).join(' ');
  assert.ok(naraReplyGuardrailViolations(long).includes('mais_de_45_palavras'));
});

await accept(19, 'Nenhuma resposta contém duas perguntas', () => {
  const reply = 'Você prefere o Flow? Quer que eu mande a planta?';
  assert.equal(naraReplyQuestionCount(reply), 2);
  assert.ok(naraReplyGuardrailViolations(reply).includes('mais_de_uma_pergunta'));
});

await accept(20, 'Pergunta sobre robô assume IA e oferece humano', () => {
  const result = postProcessNaraTurn(turn(), [{ role: 'user', content: 'Você é robô?' }]);
  assert.match(result.reply, /assistente digital da Bossa/i);
  assert.match(result.reply, /pessoa|time/i);
  assert.equal(result.handoff, true);
});

const hybridServer = await readFile(new URL('../src/lib/hybrid-server.ts', import.meta.url), 'utf8');
const webhook = await readFile(new URL('../src/lib/whatsapp/webhookProcessor.ts', import.meta.url), 'utf8');
const simulator = await readFile(new URL('../src/app/api/ai-training/route.ts', import.meta.url), 'utf8');
assert.match(hybridServer, /kind: 'corretor'/);
assert.match(hybridServer, /sale_assisted: true/);
assert.match(hybridServer, /taskDedupeKey: 'handoff:venda-assistida'/);
assert.match(webhook, /loadNaraCommercialTurnContext/);
assert.match(simulator, /loadNaraCommercialTurnContext/);
assert.equal(passed.length, 20);
console.table(passed);
console.log('Fase 10 validada: 20 de 20 casos de aceite aprovados no núcleo compartilhado pelo simulador e pelo WhatsApp.');
'''
(root / 'scripts/check-nara-phase10.mjs').write_text(acceptance, encoding='utf-8')

report = '''# Fase 10 — Matriz final de aceite da Nara

Esta fase automatiza os 20 casos definidos no briefing da migração para o Prompt v3.

O teste usa o mesmo núcleo determinístico compartilhado pelo simulador e pelo fluxo real do WhatsApp: triagem, consultas comerciais, guardrails, roteamento, decisão híbrida e proteção da janela de 24 horas. Nenhuma mensagem real é enviada a clientes durante a validação.

## Grupos validados

1. Primeira mensagem e anti-repetição — casos 1 a 4.
2. Preço, disponibilidade e curadoria — casos 5 a 10.
3. Corretor, cliente atual e venda assistida — casos 11 a 13.
4. Prioridade, handoff, falha e janela do WhatsApp — casos 14 a 17.
5. Limite de palavras, perguntas e transparência sobre IA — casos 18 a 20.

## Correções consolidadas nesta fase

- “Vi um anúncio de vocês” passa a ser reconhecido como sinal suficiente para apresentar Flow e Alma sem abrir com triagem.
- Vocabulário forte de corretor, como espelho, comissão, VGV e cliente ativo, bloqueia consulta de preço e direciona o lead ao pipeline de corretores.
- “Meu corretor me indicou” é tratado como venda assistida: não muda o comprador para corretor, não consulta preço e cria passagem humana urgente preservando a parceria.
- O guardrail passa a bloquear respostas com mais de uma pergunta.
- A pergunta “você é robô?” recebe resposta determinística e oferta imediata de atendimento humano.
- Aberturas repetidas são removidas antes do envio quando o restante da resposta permite avançar a conversa.

Execute com `npm run test:nara-phase10`.
'''
(root / 'docs/nara-phase10-acceptance.md').write_text(report, encoding='utf-8')

package = root / 'package.json'
replace_once(package,
'    "test:nara-phase9": "node --experimental-strip-types --experimental-loader ./scripts/ts-extension-loader.mjs scripts/check-nara-phase9.mjs"\n',
'    "test:nara-phase9": "node --experimental-strip-types --experimental-loader ./scripts/ts-extension-loader.mjs scripts/check-nara-phase9.mjs",\n    "test:nara-phase10": "node --experimental-strip-types --experimental-loader ./scripts/ts-extension-loader.mjs scripts/check-nara-phase10.mjs"\n')

workflow = root / '.github/workflows/validate.yml'
replace_once(workflow,
"      - name: Test Nara score and classification vocabulary\n        run: npm run test:nara-phase9\n",
"      - name: Test Nara score and classification vocabulary\n        run: npm run test:nara-phase9\n      - name: Test Nara final acceptance matrix\n        run: npm run test:nara-phase10\n")
