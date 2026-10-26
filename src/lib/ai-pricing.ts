import type { AiUsageRecord } from './ai';

/**
 * Preço e montagem do registro de consumo de IA.
 *
 * Fonte única para TODAS as chamadas à OpenAI do Bossa CRM: a Nara/Plantão
 * (ai.ts) e as análises em segundo plano (conversa do corretor, desempenho do
 * corretor, propostas/agenda, imagem e áudio). Antes, só a Nara gravava custo.
 */

export const AI_USAGE_KINDS = [
  'summary',
  'response',
  'broker_review',
  'broker_performance',
  'commercial_intelligence',
  'image_understanding',
  'audio_transcription',
] as const;

export type AiUsageKind = typeof AI_USAGE_KINDS[number];

export const LONG_CONTEXT_THRESHOLD = 272_000;

/** USD por 1 milhão de tokens. */
export function pricingFor(model: string) {
  if (model.startsWith('gpt-5.6-luna')) return { input: 1, cached: 0.1, write: 1.25, output: 6 };
  if (model.startsWith('gpt-5.6-terra')) return { input: 2.5, cached: 0.25, write: 3.125, output: 15 };
  if (model.startsWith('gpt-5.6-sol') || model === 'gpt-5.6') return { input: 5, cached: 0.5, write: 6.25, output: 30 };
  if (model.startsWith('gpt-5-mini')) return { input: 0.25, cached: 0.025, write: 0.25, output: 2 };
  return { input: 2.5, cached: 0.25, write: 3.125, output: 15 };
}

/**
 * USD por 1 milhão de tokens (texto e áudio de entrada têm preços diferentes)
 * e USD por minuto, usado quando a OpenAI devolve só a duração.
 *
 * ATENÇÃO: o preço de `gpt-transcribe` (modelo padrão do CRM) não está
 * confirmado. Enquanto não for confirmado na tabela de preços da OpenAI, ele
 * usa o mesmo valor de `gpt-4o-transcribe`, que é a faixa mais cara conhecida.
 */
export function transcriptionPricingFor(model: string) {
  if (model.startsWith('gpt-4o-mini-transcribe')) return { textInput: 1.25, audioInput: 3, output: 5, perMinute: 0.003 };
  if (model.startsWith('whisper')) return { textInput: 0, audioInput: 0, output: 0, perMinute: 0.006 };
  return { textInput: 2.5, audioInput: 6, output: 10, perMinute: 0.006 };
}

type ResponsesUsage = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number } | null;
  output_tokens_details?: { reasoning_tokens?: number } | null;
};

type ResponsesPayload = {
  id?: string;
  model?: string;
  usage?: ResponsesUsage | null;
};

type UsageFlags = {
  requestKind: AiUsageKind;
  /** Modelo pedido; usado quando a resposta não informa o modelo. */
  fallbackModel: string;
  preflightInputTokens?: number;
  preflightEstimated?: boolean;
  fallbackUsed?: boolean;
  compacted?: boolean;
};

function tokens(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

/** Sempre devolve um registro; sem `usage`, usa a contagem prévia de entrada. */
export function buildUsageRecord(payload: ResponsesPayload, flags: UsageFlags): AiUsageRecord {
  const preflightInputTokens = tokens(flags.preflightInputTokens);
  const usage = payload.usage ?? undefined;
  const inputTokens = tokens(usage?.input_tokens ?? preflightInputTokens);
  const cachedTokens = tokens(usage?.input_tokens_details?.cached_tokens);
  const cacheWriteTokens = tokens(usage?.input_tokens_details?.cache_write_tokens);
  const outputTokens = tokens(usage?.output_tokens);
  const reasoningTokens = tokens(usage?.output_tokens_details?.reasoning_tokens);
  const uncachedTokens = Math.max(0, inputTokens - cachedTokens - cacheWriteTokens);
  const longContext = inputTokens > LONG_CONTEXT_THRESHOLD;
  const model = payload.model || flags.fallbackModel;
  const pricing = pricingFor(model);
  const inputMultiplier = longContext ? 2 : 1;
  const outputMultiplier = longContext ? 1.5 : 1;
  const cost = (
    uncachedTokens * pricing.input * inputMultiplier
    + cachedTokens * pricing.cached * inputMultiplier
    + cacheWriteTokens * pricing.write * inputMultiplier
    + outputTokens * pricing.output * outputMultiplier
  ) / 1_000_000;

  return {
    request_kind: flags.requestKind,
    model,
    request_id: payload.id || null,
    input_tokens: inputTokens,
    cached_tokens: cachedTokens,
    cache_write_tokens: cacheWriteTokens,
    output_tokens: outputTokens,
    reasoning_tokens: reasoningTokens,
    preflight_input_tokens: preflightInputTokens,
    preflight_estimated: Boolean(flags.preflightEstimated),
    estimated_cost_usd: Number(cost.toFixed(8)),
    fallback_used: Boolean(flags.fallbackUsed),
    compacted: Boolean(flags.compacted),
    long_context: longContext,
  };
}

/**
 * Para as chamadas diretas à API de Responses (fora do ai.ts). Devolve `null`
 * quando a resposta não trouxe `usage`: sem números não há o que registrar.
 */
export function usageFromResponsesPayload(
  payload: unknown,
  flags: { requestKind: AiUsageKind; fallbackModel: string },
): AiUsageRecord | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as ResponsesPayload;
  if (!data.usage || typeof data.usage !== 'object') return null;
  return buildUsageRecord(data, flags);
}

type TranscriptionUsage = {
  type?: string;
  seconds?: number;
  input_tokens?: number;
  output_tokens?: number;
  input_token_details?: { text_tokens?: number; audio_tokens?: number } | null;
};

/** A API de transcrição cobra por tokens (modelos gpt-*) ou por duração (whisper). */
export function usageFromTranscription(usage: unknown, model: string): AiUsageRecord | null {
  if (!usage || typeof usage !== 'object') return null;
  const data = usage as TranscriptionUsage;
  const pricing = transcriptionPricingFor(model);
  const inputTokens = tokens(data.input_tokens);
  const outputTokens = tokens(data.output_tokens);
  const seconds = Number(data.seconds);
  let cost = 0;

  if (data.type === 'duration' || (!inputTokens && !outputTokens && Number.isFinite(seconds))) {
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    cost = (seconds / 60) * pricing.perMinute;
  } else {
    if (!inputTokens && !outputTokens) return null;
    const textTokens = Math.min(inputTokens, tokens(data.input_token_details?.text_tokens));
    // Sem o detalhamento, toda a entrada é tratada como áudio (o caso comum e o mais caro).
    const audioTokens = inputTokens - textTokens;
    cost = (
      textTokens * pricing.textInput
      + audioTokens * pricing.audioInput
      + outputTokens * pricing.output
    ) / 1_000_000;
  }

  return {
    request_kind: 'audio_transcription',
    model,
    request_id: null,
    input_tokens: inputTokens,
    cached_tokens: 0,
    cache_write_tokens: 0,
    output_tokens: outputTokens,
    reasoning_tokens: 0,
    preflight_input_tokens: 0,
    preflight_estimated: false,
    estimated_cost_usd: Number(cost.toFixed(8)),
    fallback_used: false,
    compacted: false,
    long_context: false,
  };
}
