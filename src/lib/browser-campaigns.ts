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

/** Celulares BR com nove dígitos ou wa_id legado com oito dígitos. */
export function validBrowserMobilePhone(value: string | null | undefined): string | null {
  const phone = validBrowserPhone(value);
  if (!phone) return null;
  // Para números estrangeiros, só considerar cadastros com DDI explícito.
  if (!phone.startsWith('55')) return String(value ?? '').trim().startsWith('+') ? phone : null;
  const ddd = phone.slice(2, 4);
  const local = phone.slice(4);
  const validDdd = /^(?:1[1-9]|2[12478]|3[1-578]|4[1-9]|5[1345]|6[1-9]|7[134579]|8[1-9]|9[1-9])$/.test(ddd);
  return validDdd && (/^9\d{8}$/.test(local) || /^[6-9]\d{7}$/.test(local)) ? phone : null;
}

export function hasBrowserRecipientNameToken(value: string) {
  return /\{\{\s*nome\s*\}\}/i.test(value);
}

export function browserRecipientFirstName(name: string | null | undefined): string | null {
  const firstName = String(name ?? '').trim().split(/\s+/)[0]?.slice(0, 60) ?? '';
  if (!firstName || /^(?:n[aã]o|sem|corretor(?:a)?|imobili[aá]ria|grupo|equipe|construtora|atendimento|contato|desconhecid[oa]|cliente)$/i.test(firstName))
    return null;
  return firstName;
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
  if (!hasBrowserRecipientNameToken(template))
    throw new Error('Inclua {{nome}} em toda mensagem para cumprimentar o corretor pelo primeiro nome.');
  const firstName = browserRecipientFirstName(lead.name);
  if (!firstName) throw new Error('Este corretor precisa de um primeiro nome válido no CRM antes do envio.');
  return template
    .replace(/\{\{\s*nome\s*\}\}/gi, firstName)
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
