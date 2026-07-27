import type { LeadKind } from './types';

export const CLIENT_STAGES = [
  { id: 'novo', label: 'Novo Lead', color: '#7A8CA3' },
  { id: 'ia', label: 'IA Atendendo', color: '#D4622F' },
  { id: 'qualificado', label: 'Qualificado (Quente)', color: '#C0392B' },
  { id: 'agendado', label: 'Visita / Call Agendada', color: '#8A6A1F' },
  { id: 'negociacao', label: 'Negociação (Humano)', color: '#1F5F6B' },
  { id: 'fechado', label: 'Fechado', color: '#3E7C4F' },
] as const;

export const BROKER_STAGES = [
  { id: 'n1', label: '1 · Cadastrado', color: '#7A8CA3' },
  { id: 'n2', label: '2 · Curioso', color: '#1F5F6B' },
  { id: 'n3', label: '3 · Ativo', color: '#D4622F' },
  { id: 'n4', label: '4 · Negociando', color: '#8A6A1F' },
  { id: 'n5', label: '5 · Parceiro Bossa', color: '#3E7C4F' },
] as const;

export function stagesFor(kind: LeadKind) {
  return kind === 'cliente' ? CLIENT_STAGES : BROKER_STAGES;
}

export function stageLabel(kind: LeadKind, stage: string): string {
  return stagesFor(kind).find((item) => item.id === stage)?.label ?? stage;
}

export function defaultStage(kind: LeadKind): string {
  return kind === 'cliente' ? 'novo' : 'n1';
}
