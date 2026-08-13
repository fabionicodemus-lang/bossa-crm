export type MetaLeadField = {
  name?: string;
  values?: unknown[];
};

export type MetaLeadDetails = {
  id?: string;
  created_time?: string;
  ad_id?: string;
  field_data?: MetaLeadField[];
  [key: string]: unknown;
};

export type MetaLeadgenEvent = {
  leadgenId: string;
  formId: string | null;
  adId: string | null;
  pageId: string | null;
  createdTime: string | number | null;
  rawValue: Record<string, unknown>;
};

function normalizedKey(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function normalizedAnswer(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function normalizeMetaLeadPhone(raw: string | null) {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (trimmed.startsWith('+')) return digits;
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function canonicalEnterprise(value: string) {
  const normalized = normalizedAnswer(value);
  if (/\balma\b/.test(normalized)) return 'Alma Sea Houses';
  if (/\bflow\b/.test(normalized)) return 'Flow Aptos';
  if (/\bsoul\b/.test(normalized)) return 'Soul Residence';
  if (/\bjazz\b/.test(normalized)) return 'Jazz Residence';
  return value.trim() || null;
}

function inferEnterprise(answers: Record<string, string>) {
  const direct = Object.entries(answers).find(([key, value]) => {
    if (!value.trim()) return false;
    const normalized = normalizedKey(key);
    return normalized.includes('empreendimento')
      || normalized === 'projeto'
      || normalized.includes('projeto_de_interesse')
      || normalized.includes('imovel_de_interesse');
  });
  if (direct) return canonicalEnterprise(direct[1]);

  for (const value of Object.values(answers)) {
    const normalized = normalizedAnswer(value);
    if (/\b(alma|flow|soul|jazz)\b/.test(normalized)) return canonicalEnterprise(value);
  }
  return null;
}

export function parseMetaLeadFieldData(fieldData: MetaLeadField[] | undefined) {
  const answers: Record<string, string> = {};
  for (const field of fieldData ?? []) {
    const name = String(field?.name ?? '').trim();
    if (!name) continue;
    answers[name] = (field.values ?? [])
      .map((item) => (item == null ? '' : String(item).trim()))
      .filter(Boolean)
      .join(', ');
  }

  const answerByKey = new Map(
    Object.entries(answers).map(([key, value]) => [normalizedKey(key), value]),
  );
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = answerByKey.get(normalizedKey(key))?.trim();
      if (value) return value;
    }
    return null;
  };

  const firstName = pick('first_name', 'primeiro_nome', 'nome');
  const lastName = pick('last_name', 'sobrenome');
  const combinedName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const name = pick('full_name', 'nome_completo', 'name') ?? (combinedName || null);
  const email = pick('email', 'e-mail', 'email_address');
  const phoneRaw = pick('phone_number', 'telefone', 'phone', 'celular', 'whatsapp');

  return {
    name,
    email,
    phone: normalizeMetaLeadPhone(phoneRaw),
    enterprise: inferEnterprise(answers),
    answers,
  };
}

export function extractMetaLeadgenEvents(payload: unknown): MetaLeadgenEvent[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as {
    object?: unknown;
    entry?: Array<{
      id?: unknown;
      changes?: Array<{ field?: unknown; value?: Record<string, unknown> }>;
    }>;
  };
  if (root.object !== 'page' || !Array.isArray(root.entry)) return [];

  const events: MetaLeadgenEvent[] = [];
  for (const entry of root.entry) {
    for (const change of entry.changes ?? []) {
      if (String(change.field ?? '') !== 'leadgen') continue;
      const value = change.value ?? {};
      const leadgenId = String(value.leadgen_id ?? '').trim();
      if (!leadgenId) continue;
      events.push({
        leadgenId,
        formId: String(value.form_id ?? '').trim() || null,
        adId: String(value.ad_id ?? '').trim() || null,
        pageId: String(value.page_id ?? entry.id ?? '').trim() || null,
        createdTime: (value.created_time as string | number | undefined) ?? null,
        rawValue: value,
      });
    }
  }
  return events;
}
