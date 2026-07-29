import type { AiTurn } from './ai';
import type { Lead, LeadKind } from './types';

export type WorkflowStage =
  | 'novo_triagem'
  | 'qualificacao_ia'
  | 'nutricao_ativa'
  | 'passagem_pendente'
  | 'humano_ativo'
  | 'agendado'
  | 'pos_reuniao'
  | 'proposta_negociacao'
  | 'futuro'
  | 'fechado_ganho'
  | 'encerrado';

export type PriorityClass = 'A1' | 'A2' | 'B' | 'C' | 'D';
export type OwnerMode = 'ai' | 'human' | 'none';

export interface HybridDecision {
  stage: WorkflowStage;
  priorityClass: PriorityClass;
  ownerMode: OwnerMode;
  aiEnabled: boolean;
  handoffRequired: boolean;
  handoffReason: string;
  nextAction: string;
  nextActionType: string;
  nextActionDueAt: string | null;
  reactivationAt: string | null;
  noteTitle: string;
  noteDescription: string;
  taskTitle: string | null;
  taskDescription: string | null;
  taskPriority: 'urgent' | 'high' | 'normal' | 'low';
  taskDueAt: string | null;
  taskDedupeKey: string | null;
}

const AI_STAGES = new Set<WorkflowStage>([
  'novo_triagem',
  'qualificacao_ia',
  'nutricao_ativa',
  'passagem_pendente',
  'futuro',
]);

const HUMAN_STAGES = new Set<WorkflowStage>([
  'humano_ativo',
  'agendado',
  'pos_reuniao',
  'proposta_negociacao',
]);

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

function minutesFrom(now: Date, minutes: number): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

function daysFrom(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

function leadStage(lead: Lead): WorkflowStage {
  const stage = lead.stage as WorkflowStage;
  if (
    AI_STAGES.has(stage)
    || HUMAN_STAGES.has(stage)
    || stage === 'fechado_ganho'
    || stage === 'encerrado'
  ) return stage;
  return 'novo_triagem';
}

function currentOwnerMode(lead: Lead): OwnerMode {
  if (lead.owner_mode === 'human' || lead.owner_mode === 'none') return lead.owner_mode;
  return 'ai';
}

function explicitHighIntent(text: string, kind: LeadKind): string | null {
  const value = normalize(text);
  if (/\b(quero falar com (?:uma pessoa|alguem|consultor|corretor)|atendimento humano|me liga|pode me ligar|ligacao|videochamada)\b/.test(value)) {
    return 'O contato pediu atendimento humano ou ligação.';
  }
  if (/\b(agendar|marcar|visita|visitar|decorado|conhecer pessoalmente)\b/.test(value)) {
    return 'O contato pediu ou demonstrou intenção de agendar visita.';
  }
  if (/\b(proposta|reservar|reserva|fechar|negociar|contraproposta|desconto|condicao|entrada|reforco|parcelamento)\b/.test(value)) {
    return 'O contato entrou em proposta, condição ou negociação.';
  }
  if (/\b(unidade disponivel|qual unidade|apartamento pronto|pronto para morar|soul)\b/.test(value)) {
    return 'O contato pediu uma unidade específica ou demonstrou aderência à unidade pronta do Soul.';
  }
  if (kind === 'corretor' && /\b(tenho cliente|cliente ativo|estou com cliente|visita com cliente|proposta do cliente|reserva para cliente)\b/.test(value)) {
    return 'Corretor informou cliente ativo ou oportunidade concreta.';
  }
  return null;
}

function proposalSignal(text: string): boolean {
  const value = normalize(text);
  return /\b(proposta|reservar|reserva|fechar|negociar|contraproposta|desconto|condicao|entrada|reforco|parcelamento)\b/.test(value);
}

function appointmentSignal(text: string): boolean {
  const value = normalize(text);
  return /\b(agendar|marcar|visita|visitar|decorado|conhecer pessoalmente|videochamada)\b/.test(value);
}

function futureSignal(text: string): boolean {
  const value = normalize(text);
  return /\b(ano que vem|daqui a (?:\d+|alguns) meses|mais pra frente|sem pressa|depois que vender|quando vender|aguardando vender|aguardando credito|aguardando financiamento|so no futuro|em 20\d\d)\b/.test(value);
}

function optOutSignal(text: string): boolean {
  const value = normalize(text);
  return /\b(pare de mandar|nao me mande mais|nao quero receber|remova meu numero|sair da lista|cancele as mensagens|stop)\b/.test(value);
}

function closedWonSignal(text: string): boolean {
  const value = normalize(text);
  return /\b(comprei|fechamos|negocio fechado|contrato assinado|assinei o contrato|venda concluida)\b/.test(value);
}

function priorityFromTurn(turn: AiTurn, text: string, kind: LeadKind): PriorityClass {
  if (optOutSignal(text) || turn.classification === 'sem_interesse') return 'D';
  if (explicitHighIntent(text, kind)) return 'A1';
  if (kind === 'corretor' && ['negociando', 'parceiro'].includes(turn.classification)) return 'A1';
  if (turn.handoff || turn.stage === 'agendado' || turn.score >= 80) return 'A2';
  if (futureSignal(text)) return 'C';
  if (turn.score >= 40 || ['morno', 'quente', 'ativo'].includes(turn.classification)) return 'B';
  return 'C';
}

function humanStage(stage: WorkflowStage): boolean {
  return HUMAN_STAGES.has(stage);
}

export function aiCanReply(lead: Lead): boolean {
  const stage = leadStage(lead);
  const ownerMode = currentOwnerMode(lead);
  return Boolean(
    lead.ai_enabled
    && !lead.opt_out
    && !lead.automation_paused
    && ownerMode === 'ai'
    && AI_STAGES.has(stage),
  );
}

export function deriveHybridDecision(args: {
  lead: Lead;
  turn: AiTurn;
  lastUserMessage: string;
  now?: Date;
}): HybridDecision {
  const { lead, turn, lastUserMessage } = args;
  const now = args.now ?? new Date();
  const currentStage = leadStage(lead);
  const ownerMode = currentOwnerMode(lead);
  const highIntentReason = explicitHighIntent(lastUserMessage, lead.kind);
  const priorityClass = priorityFromTurn(turn, lastUserMessage, lead.kind);
  const isOptOut = optOutSignal(lastUserMessage);
  const won = lead.kind === 'cliente' && closedWonSignal(lastUserMessage);
  const alreadyHuman = ownerMode === 'human' || humanStage(currentStage);
  const future = futureSignal(lastUserMessage);
  const handoffRequired = !isOptOut && !won && (
    Boolean(highIntentReason)
    || turn.handoff
    || turn.stage === 'agendado'
    || (lead.kind === 'corretor' && ['negociando', 'parceiro'].includes(turn.classification))
  );

  let stage: WorkflowStage = currentStage;
  let nextAction = turn.next_action || 'Continuar o atendimento com base na conversa.';
  let nextActionType = 'followup';
  let nextActionDueAt: string | null = null;
  let reactivationAt: string | null = null;
  let taskTitle: string | null = null;
  let taskDescription: string | null = null;
  let taskPriority: HybridDecision['taskPriority'] = 'normal';
  let taskDueAt: string | null = null;
  let taskDedupeKey: string | null = null;
  let resolvedOwnerMode: OwnerMode = ownerMode;
  let aiEnabled = lead.ai_enabled;

  if (won) {
    stage = 'fechado_ganho';
    resolvedOwnerMode = 'none';
    aiEnabled = false;
    nextAction = 'Registrar fechamento e iniciar o processo de pós-venda.';
    nextActionType = 'pos_venda';
  } else if (isOptOut || priorityClass === 'D') {
    stage = 'encerrado';
    resolvedOwnerMode = 'none';
    aiEnabled = false;
    nextAction = isOptOut ? 'Respeitar o opt-out definitivo.' : nextAction;
    nextActionType = 'encerrar';
  } else if (alreadyHuman) {
    resolvedOwnerMode = 'human';
    aiEnabled = false;
    if (turn.stage === 'agendado') stage = 'agendado';
    else if (currentStage === 'agendado') stage = 'agendado';
    else if (currentStage === 'pos_reuniao') stage = 'pos_reuniao';
    else if (currentStage === 'proposta_negociacao' || proposalSignal(lastUserMessage)) stage = 'proposta_negociacao';
    else if (appointmentSignal(lastUserMessage)) stage = 'agendado';
    else stage = 'humano_ativo';

    nextActionType = priorityClass === 'A1' ? 'contato_urgente' : 'followup_humano';
    nextActionDueAt = priorityClass === 'A1' ? minutesFrom(now, 10) : minutesFrom(now, 24 * 60);
    taskTitle = priorityClass === 'A1' ? 'Responder oportunidade quente' : 'Dar continuidade ao atendimento';
    taskDescription = nextAction;
    taskPriority = priorityClass === 'A1' ? 'urgent' : priorityClass === 'A2' ? 'high' : 'normal';
    taskDueAt = nextActionDueAt;
    taskDedupeKey = `human:${stage}:${nextActionType}`;
  } else if (handoffRequired) {
    stage = 'passagem_pendente';
    resolvedOwnerMode = 'ai';
    aiEnabled = true;
    const dueMinutes = priorityClass === 'A1' ? 5 : 30;
    nextActionDueAt = minutesFrom(now, dueMinutes);
    nextActionType = 'aceitar_passagem';
    nextAction = priorityClass === 'A1'
      ? 'Um consultor deve aceitar a passagem e iniciar o contato imediatamente.'
      : 'Um consultor deve aceitar a passagem e assumir o atendimento no mesmo turno.';
    taskTitle = priorityClass === 'A1' ? 'Aceitar lead A1' : 'Aceitar passagem do lead';
    taskDescription = highIntentReason || turn.summary || turn.next_action;
    taskPriority = priorityClass === 'A1' ? 'urgent' : 'high';
    taskDueAt = nextActionDueAt;
    taskDedupeKey = 'handoff:pending';
  } else if (future || currentStage === 'futuro') {
    stage = 'futuro';
    resolvedOwnerMode = 'ai';
    aiEnabled = true;
    reactivationAt = lead.reactivation_at || daysFrom(now, 30);
    nextActionDueAt = reactivationAt;
    nextActionType = 'reativar';
    nextAction = turn.next_action || 'Retomar o contato na data de reativação, usando o motivo real da pausa.';
    taskTitle = 'Reativar lead futuro';
    taskDescription = nextAction;
    taskPriority = 'low';
    taskDueAt = reactivationAt;
    taskDedupeKey = 'reactivation:future';
  } else {
    stage = currentStage === 'novo_triagem' ? 'qualificacao_ia' : 'nutricao_ativa';
    resolvedOwnerMode = 'ai';
    aiEnabled = true;
    nextActionDueAt = priorityClass === 'A2' ? minutesFrom(now, 30) : priorityClass === 'C' ? daysFrom(now, 7) : minutesFrom(now, 24 * 60);
    nextActionType = 'qualificar_nutrir';
    taskTitle = 'Próxima ação da Nara/Plantão';
    taskDescription = nextAction;
    taskPriority = priorityClass === 'A2' ? 'high' : 'normal';
    taskDueAt = nextActionDueAt;
    taskDedupeKey = `ai:${stage}`;
  }

  const handoffReason = highIntentReason || (handoffRequired ? turn.next_action || turn.summary : '');
  const label = lead.kind === 'cliente' ? 'Nara' : 'Plantão';
  const noteTitle = `${label} analisou a conversa · classe ${priorityClass}`;
  const noteDescription = [
    turn.summary,
    turn.next_action ? `Próxima ação sugerida: ${turn.next_action}` : '',
    handoffReason ? `Motivo da passagem: ${handoffReason}` : '',
  ].filter(Boolean).join(' ');

  return {
    stage,
    priorityClass,
    ownerMode: resolvedOwnerMode,
    aiEnabled,
    handoffRequired,
    handoffReason,
    nextAction,
    nextActionType,
    nextActionDueAt,
    reactivationAt,
    noteTitle,
    noteDescription,
    taskTitle,
    taskDescription,
    taskPriority,
    taskDueAt,
    taskDedupeKey,
  };
}

export function workflowStageAllowsAi(stage: string): boolean {
  return AI_STAGES.has(stage as WorkflowStage);
}

export function isHumanWorkflowStage(stage: string): boolean {
  return HUMAN_STAGES.has(stage as WorkflowStage);
}
