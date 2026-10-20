/**
 * Modelo principal: atendimento de Nara (clientes) e Plantão (corretores).
 * Modelo leve: compactação de histórico, leitura auxiliar e tarefas internas.
 * Fallback: aplicado somente quando o modelo de atendimento falha.
 */
export type AiWorkload = 'conversation' | 'background';

export type AiModelRoutingSettings = {
  primary: string;
  light: string;
  fallback: string;
};

export function aiModelRoutingSettings(env: Record<string, string | undefined> = process.env): AiModelRoutingSettings {
  return {
    primary: env.OPENAI_MODEL?.trim() || 'gpt-6.1-sol',
    light: env.OPENAI_MODEL_LIGHT?.trim() || 'gpt-6-luna',
    fallback: env.OPENAI_MODEL_FALLBACK?.trim() || 'gpt-6-luna',
  };
}

export function selectAiModels(settings: AiModelRoutingSettings, workload: AiWorkload) {
  const primary = workload === 'background' ? settings.light : settings.primary;
  const fallback = settings.fallback && settings.fallback !== primary ? settings.fallback : null;
  return { primary, fallback };
}

/** O cache explícito é compatível com GPT-5.6 e modelos posteriores. */
export function supportsExplicitCaching(model: string): boolean {
  return /^gpt-(?:5\.(?:[6-9]|\d{2,})|(?:[6-9]|[1-9]\d)(?:\.\d+)?)(?:-|$)/.test(model);
}

export type AiTokenRates = { input: number; cached: number; write: number; output: number };

/** Tarifas USD por 1 milhão de tokens, Responses API, processamento Standard. */
export function pricingFor(model: string): AiTokenRates {
  if (model.startsWith('gpt-6.1-sol')) return { input: 2, cached: 0.1, write: 2.5, output: 10 };
  if (model.startsWith('gpt-6-luna')) return { input: 0.1, cached: 0.01, write: 0.125, output: 0.5 };
  if (model.startsWith('gpt-5.6-luna')) return { input: 0.2, cached: 0.02, write: 0.25, output: 1.2 };
  if (model.startsWith('gpt-5.6-terra')) return { input: 2, cached: 0.2, write: 2.5, output: 12 };
  if (model.startsWith('gpt-5.6-sol') || model === 'gpt-5.6') return { input: 4, cached: 0.4, write: 5, output: 20 };
  if (model.startsWith('gpt-5-mini')) return { input: 0.25, cached: 0.025, write: 0.25, output: 2 };
  // Não registrar uma tarifa falsa para um modelo desconhecido.
  return { input: 0, cached: 0, write: 0, output: 0 };
}
