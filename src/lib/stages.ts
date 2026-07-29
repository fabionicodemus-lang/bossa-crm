import type { LeadKind } from './types';

export const CLIENT_STAGES = [
  { id: 'novo_triagem', label: 'Novo / Triagem', color: '#7A8CA3' },
  { id: 'qualificacao_ia', label: 'Qualificação Nara', color: '#D4622F' },
  { id: 'nutricao_ativa', label: 'Nutrição ativa', color: '#9B6A45' },
  { id: 'passagem_pendente', label: 'Passagem pendente', color: '#C0392B' },
  { id: 'humano_ativo', label: 'Humano ativo', color: '#1F5F6B' },
  { id: 'agendado', label: 'Visita / Call', color: '#8A6A1F' },
  { id: 'pos_reuniao', label: 'Pós-reunião', color: '#6D5A8A' },
  { id: 'proposta_negociacao', label: 'Proposta / Negociação', color: '#174A52' },
  { id: 'futuro', label: 'Futuro / Nutrição longa', color: '#7A6F5D' },
  { id: 'fechado_ganho', label: 'Venda fechada', color: '#3E7C4F' },
  { id: 'encerrado', label: 'Encerrado', color: '#66727A' },
] as const;

export const BROKER_STAGES = [
  { id: 'novo_triagem', label: 'Novo / Triagem', color: '#7A8CA3' },
  { id: 'qualificacao_ia', label: 'Plantão qualificando', color: '#D4622F' },
  { id: 'nutricao_ativa', label: 'Relacionamento ativo', color: '#9B6A45' },
  { id: 'passagem_pendente', label: 'Passagem ao comercial', color: '#C0392B' },
  { id: 'humano_ativo', label: 'Comercial ativo', color: '#1F5F6B' },
  { id: 'agendado', label: 'Reunião / Visita', color: '#8A6A1F' },
  { id: 'pos_reuniao', label: 'Pós-reunião', color: '#6D5A8A' },
  { id: 'proposta_negociacao', label: 'Cliente / Proposta', color: '#174A52' },
  { id: 'futuro', label: 'Relacionamento futuro', color: '#7A6F5D' },
  { id: 'encerrado', label: 'Encerrado', color: '#66727A' },
] as const;

export function stagesFor(kind: LeadKind) {
  return kind === 'cliente' ? CLIENT_STAGES : BROKER_STAGES;
}

export function stageLabel(kind: LeadKind, stage: string): string {
  return stagesFor(kind).find((item) => item.id === stage)?.label ?? stage;
}

export function defaultStage(_kind: LeadKind): string {
  return 'novo_triagem';
}

export function isAiStage(stage: string): boolean {
  return ['novo_triagem', 'qualificacao_ia', 'nutricao_ativa', 'passagem_pendente', 'futuro'].includes(stage);
}

export function isHumanStage(stage: string): boolean {
  return ['humano_ativo', 'agendado', 'pos_reuniao', 'proposta_negociacao'].includes(stage);
}
