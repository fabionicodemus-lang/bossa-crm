import { normalizeManualPhone } from './whatsapp/utils';

export type BrowserCampaignMedia = {
  bucket: 'broadcast-media';
  path: string;
  filename: string;
  mime: 'application/pdf';
  size: number;
  sha256: string;
};

export type BrowserRecipientStatus = 'queued' | 'claimed' | 'sent' | 'uncertain' | 'skipped';

export function validBrowserPhone(value: string | null | undefined): string | null {
  const phone = normalizeManualPhone(String(value ?? '').trim());
  return /^[1-9][0-9]{7,14}$/.test(phone) ? phone : null;
}

export function safeBrowserMedia(organizationId: string, value: unknown): BrowserCampaignMedia[] | null {
  if (!Array.isArray(value) || value.length > 3) return null;
  let total = 0;
  const unique = new Set<string>();
  const media: BrowserCampaignMedia[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const item = entry as Record<string, unknown>;
    const path = String(item.path ?? '');
    const filename = String(item.filename ?? '');
    const size = Number(item.size);
    const sha256 = String(item.sha256 ?? '');
    if (item.bucket !== 'broadcast-media' || item.mime !== 'application/pdf'
      || !path.startsWith(`${organizationId}/`) || !/^[-a-zA-Z0-9_./]+$/.test(path)
      || path.includes('..') || unique.has(path)
      || !filename.toLowerCase().endsWith('.pdf') || filename.length > 160
      || !/^[a-f0-9]{64}$/.test(sha256)
      || !Number.isInteger(size) || size < 1 || size > 8 * 1024 * 1024) return null;
    total += size;
    unique.add(path);
    media.push({ bucket: 'broadcast-media', path, filename, mime: 'application/pdf', size, sha256 });
  }
  return total <= 20 * 1024 * 1024 ? media : null;
}

export function personalizeBrowserText(template: string, lead: {
  name: string; company?: string | null; enterprise?: string | null;
}) {
  const firstName = (lead.name.trim().split(/\s+/)[0] || 'corretor').slice(0, 60);
  return template
    .replaceAll('{{nome}}', firstName)
    .replaceAll('{{imobiliaria}}', (lead.company ?? '').slice(0, 120))
    .replaceAll('{{empreendimento}}', (lead.enterprise ?? '').slice(0, 120))
    .trim();
}

export function campaignRecipientSummary(rows: Array<{ status: BrowserRecipientStatus }>) {
  return rows.reduce((result, row) => {
    result[row.status]++;
    return result;
  }, { queued: 0, claimed: 0, sent: 0, uncertain: 0, skipped: 0 });
}
