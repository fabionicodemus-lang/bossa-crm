import type { MetaWebhookMessage } from '@/lib/whatsapp/webhookTypes';

export interface MetaAdAttribution {
  ctwa_clid?: string;
  source_id?: string;
  source_url?: string;
  headline?: string;
  body?: string;
  source_type?: string;
  captured_at: string;
}

export interface MetaAdAttributionMerge {
  metadata: Record<string, unknown>;
  firstAttribution: boolean;
  historyAppended: boolean;
  sourceLabel: string | null;
}

function textValue(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

function normalizeAttribution(
  referral: MetaWebhookMessage['referral'] | undefined,
  capturedAt: string,
): MetaAdAttribution | null {
  if (!referral || typeof referral !== 'object') return null;
  const normalized: MetaAdAttribution = {
    ctwa_clid: textValue(referral.ctwa_clid),
    source_id: textValue(referral.source_id),
    source_url: textValue(referral.source_url),
    headline: textValue(referral.headline),
    body: textValue(referral.body),
    source_type: textValue(referral.source_type),
    captured_at: capturedAt,
  };
  const hasReferralData = Boolean(
    normalized.ctwa_clid
    || normalized.source_id
    || normalized.source_url
    || normalized.headline
    || normalized.body
    || normalized.source_type,
  );
  return hasReferralData ? normalized : null;
}

function attributionFromUnknown(value: unknown): MetaAdAttribution | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const capturedAt = textValue(record.captured_at);
  if (!capturedAt) return null;
  return normalizeAttribution({
    ctwa_clid: textValue(record.ctwa_clid),
    source_id: textValue(record.source_id),
    source_url: textValue(record.source_url),
    headline: textValue(record.headline),
    body: textValue(record.body),
    source_type: textValue(record.source_type),
  }, capturedAt);
}

function attributionKey(value: MetaAdAttribution): string {
  if (value.ctwa_clid) return `ctwa:${value.ctwa_clid}`;
  return [value.source_id, value.source_url, value.headline, value.body, value.source_type]
    .map((item) => item ?? '')
    .join('|');
}

export function readMetaAdAttribution(
  metadata: Record<string, unknown> | null | undefined,
): MetaAdAttribution | null {
  return attributionFromUnknown(metadata?.ad);
}

export function metaAdSourceLabel(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const attribution = readMetaAdAttribution(metadata);
  if (!attribution) return null;
  if (attribution.headline) return `Anúncio Meta · ${attribution.headline}`;
  if (attribution.source_id) return `Anúncio Meta · ${attribution.source_id}`;
  return 'Anúncio Meta';
}

export function mergeMetaAdAttribution(
  currentMetadata: Record<string, unknown> | null | undefined,
  referral: MetaWebhookMessage['referral'] | undefined,
  capturedAt: string,
): MetaAdAttributionMerge {
  const metadata = { ...(currentMetadata ?? {}) };
  const incoming = normalizeAttribution(referral, capturedAt);
  const first = readMetaAdAttribution(metadata);

  if (!incoming) {
    return {
      metadata,
      firstAttribution: false,
      historyAppended: false,
      sourceLabel: metaAdSourceLabel(metadata),
    };
  }

  if (!first) {
    metadata.ad = incoming;
    return {
      metadata,
      firstAttribution: true,
      historyAppended: false,
      sourceLabel: metaAdSourceLabel(metadata),
    };
  }

  const incomingKey = attributionKey(incoming);
  const history = Array.isArray(metadata.ad_history)
    ? metadata.ad_history.map(attributionFromUnknown).filter((item): item is MetaAdAttribution => Boolean(item))
    : [];
  const alreadyCaptured = attributionKey(first) === incomingKey
    || history.some((item) => attributionKey(item) === incomingKey);

  if (!alreadyCaptured) {
    metadata.ad_history = [...history, incoming];
  }

  return {
    metadata,
    firstAttribution: false,
    historyAppended: !alreadyCaptured,
    sourceLabel: metaAdSourceLabel(metadata),
  };
}
