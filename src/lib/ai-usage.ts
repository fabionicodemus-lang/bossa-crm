import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiUsageRecord } from './ai';

function numeric(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function recordAiUsage(args: {
  admin: SupabaseClient;
  organizationId: string;
  leadId: string;
  records: AiUsageRecord[];
}) {
  if (!args.records.length) return;
  const { error } = await args.admin.from('ai_usage_logs').insert(args.records.map((item) => ({
    organization_id: args.organizationId,
    lead_id: args.leadId,
    request_kind: item.request_kind,
    model: item.model,
    request_id: item.request_id,
    input_tokens: item.input_tokens,
    cached_tokens: item.cached_tokens,
    cache_write_tokens: item.cache_write_tokens,
    output_tokens: item.output_tokens,
    reasoning_tokens: item.reasoning_tokens,
    preflight_input_tokens: item.preflight_input_tokens,
    preflight_estimated: item.preflight_estimated,
    estimated_cost_usd: item.estimated_cost_usd,
    fallback_used: item.fallback_used,
    compacted: item.compacted,
    long_context: item.long_context,
  })));
  if (error) console.error('[ai usage log]', error.message);

  const { data: lead } = await args.admin.from('leads').select('metadata').eq('id', args.leadId).maybeSingle();
  const current = (lead?.metadata ?? {}) as Record<string, unknown>;
  const previous = current.ai_usage && typeof current.ai_usage === 'object'
    ? current.ai_usage as Record<string, unknown>
    : {};
  const totals = args.records.reduce((acc, item) => ({
    calls: acc.calls + 1,
    input_tokens: acc.input_tokens + item.input_tokens,
    cached_tokens: acc.cached_tokens + item.cached_tokens,
    cache_write_tokens: acc.cache_write_tokens + item.cache_write_tokens,
    output_tokens: acc.output_tokens + item.output_tokens,
    reasoning_tokens: acc.reasoning_tokens + item.reasoning_tokens,
    estimated_cost_usd: acc.estimated_cost_usd + item.estimated_cost_usd,
    fallback_calls: acc.fallback_calls + (item.fallback_used ? 1 : 0),
    compacted_calls: acc.compacted_calls + (item.compacted ? 1 : 0),
  }), {
    calls: 0,
    input_tokens: 0,
    cached_tokens: 0,
    cache_write_tokens: 0,
    output_tokens: 0,
    reasoning_tokens: 0,
    estimated_cost_usd: 0,
    fallback_calls: 0,
    compacted_calls: 0,
  });
  const latest = args.records.at(-1);
  await args.admin.from('leads').update({
    metadata: {
      ...current,
      ai_usage: {
        calls: numeric(previous.calls) + totals.calls,
        input_tokens: numeric(previous.input_tokens) + totals.input_tokens,
        cached_tokens: numeric(previous.cached_tokens) + totals.cached_tokens,
        cache_write_tokens: numeric(previous.cache_write_tokens) + totals.cache_write_tokens,
        output_tokens: numeric(previous.output_tokens) + totals.output_tokens,
        reasoning_tokens: numeric(previous.reasoning_tokens) + totals.reasoning_tokens,
        estimated_cost_usd: Number((numeric(previous.estimated_cost_usd) + totals.estimated_cost_usd).toFixed(8)),
        fallback_calls: numeric(previous.fallback_calls) + totals.fallback_calls,
        compacted_calls: numeric(previous.compacted_calls) + totals.compacted_calls,
        last_model: latest?.model ?? previous.last_model ?? null,
        last_at: new Date().toISOString(),
      },
    },
  }).eq('id', args.leadId);
}
