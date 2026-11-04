export const metricDefinitions = {
  new: {
    label: "Novas oportunidades",
    formula:
      "Intenções de compra criadas no período; contato e oportunidade são distintos.",
    date: "Criação da oportunidade",
  },
  qualified: {
    label: "Qualificadas",
    formula:
      "Oportunidades que atingiram explicitamente a qualificação pela primeira vez.",
    date: "Primeiro evento confirmado de qualificação",
  },
  visits: {
    label: "Visitas realizadas",
    formula:
      "Ocorrências realizadas com comprador ou apresentação remota; exclui visita do corretor sozinho.",
    date: "Registro do desfecho realizado",
  },
  proposals: {
    label: "Oportunidades com proposta",
    formula:
      "Oportunidades distintas com primeiro envio formal; revisões e alternativas não aumentam o total.",
    date: "Primeiro envio registrado",
  },
  contracts: {
    label: "Contratos assinados",
    formula:
      "Contratos com documento, unidade e data de assinatura. Contagem bruta; distratos separados.",
    date: "Assinatura documentada",
  },
  value: {
    label: "Valor contratado bruto",
    formula: "Soma dos valores dos contratos assinados no período.",
    date: "Assinatura documentada",
  },
  receipts: {
    label: "Entradas confirmadas",
    formula:
      "Soma de entradas confirmadas por administrador com comprovante e identificador único.",
    date: "Recebimento confirmado",
  },
  cancellations: {
    label: "Distratos",
    formula: "Contratos cancelados com data e motivo, sem apagar a assinatura.",
    date: "Data do distrato",
  },
  reactivated: {
    label: "Reativações",
    formula:
      "Eventos de retorno de perdido/nutrição; preserva a criação original.",
    date: "Reativação",
  },
} as const;
export type Metric = keyof typeof metricDefinitions;
export const stages = {
  new: "Novo",
  contact: "Em atendimento",
  qualified: "Qualificado",
  visit_scheduled: "Visita agendada",
  visit_completed: "Visita realizada",
  proposal: "Proposta enviada",
  negotiation: "Negociação",
  signed: "Contrato assinado",
  nurture: "Nutrição",
  lost: "Perdido",
} as const;
export const losses = {
  entry: "Entrada",
  installment: "Parcela",
  reinforcement: "Reforços",
  price: "Preço total",
  delivery: "Entrega",
  layout: "Planta",
  location: "Localização",
  competitor: "Concorrente",
  postponed: "Compra adiada",
  no_reply: "Não respondeu",
  other: "Outro",
};
export type Filters = {
  development?: string;
  owner?: string;
  broker?: string;
  source?: string;
  format?: string;
};
const DAY = 86400000;
export function localDay(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
function parseDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Data inválida.");
  const date = new Date(`${day}T03:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== day
  )
    throw new Error("Data inválida.");
  return date;
}
export function periodRange(
  params: Record<string, string | undefined>,
  now = new Date(),
) {
  const day = localDay(now);
  const today = parseDay(day);
  const period = params.period ?? "30";
  let start = new Date(
    today.getTime() - (period === "today" ? 0 : period === "7" ? 6 : 29) * DAY,
  );
  let end = new Date(today.getTime() + DAY);
  if (period === "month") start = parseDay(`${day.slice(0, 7)}-01`);
  if (period === "custom") {
    start = parseDay(params.start ?? day);
    end = new Date(parseDay(params.end ?? day).getTime() + DAY);
  }
  if (
    end <= start ||
    end.getTime() - start.getTime() > 367 * DAY ||
    start > now
  )
    throw new Error("Escolha um período válido de até 367 dias.");
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    startDay: start.toISOString().slice(0, 10),
    endDay: new Date(end.getTime() - DAY).toISOString().slice(0, 10),
  };
}
export function relativeChange(current: number, reference: number | null) {
  return reference !== null && reference > 0
    ? (current / reference - 1) * 100
    : null;
}
export function rate(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}
export type Dashboard = {
  updated_at: string;
  start: string;
  end: string;
  tracking_started_at: string | null;
  history_incomplete: boolean;
  comparison_incomplete: boolean;
  metrics: Record<Metric, { value: number; previous: number }>;
  stages: { stage: keyof typeof stages; count: number }[];
  actions: {
    id: string;
    lead_id: string;
    title: string;
    reason: string;
    priority: number;
  }[];
  proposal_cohort: {
    size: number;
    converted: number;
    open: number;
    cutoff: string;
  };
  visit_cohort: { size: number; converted: number; cutoff: string };
  attendance: {
    completed: number;
    no_show: number;
    cancelled: number;
    pending: number;
  };
  quality: Record<string, number>;
};
