import type { SupabaseClient } from '@supabase/supabase-js';

export type NaraOperationalContext = {
  business_timezone: string;
  business_days: number[];
  business_open: string;
  business_close: string;
  hot_lead_sla_minutes: number;
  next_business_open: string;
  now_local: string;
  business_open_now: boolean;
  next_business_label: string;
  source_text: string;
};

type SettingsRow = {
  business_timezone?: string;
  business_days?: number[];
  business_open?: string;
  business_close?: string;
  hot_lead_sla_minutes?: number;
  next_business_open?: string;
};

function localParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday'));
  return {
    weekday,
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

function minutes(value: string) {
  const [h,m] = String(value || '00:00').slice(0,5).split(':').map(Number);
  return h * 60 + m;
}

function nextBusinessLabel(now: Date, settings: Required<SettingsRow>) {
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: settings.business_timezone,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  });
  const local = localParts(now, settings.business_timezone);
  for (let add = 0; add <= 7; add += 1) {
    const probe = new Date(now.getTime() + add * 86_400_000);
    const p = localParts(probe, settings.business_timezone);
    if (!settings.business_days.includes(p.weekday)) continue;
    const currentMinutes = local.hour * 60 + local.minute;
    if (add === 0 && currentMinutes < minutes(settings.business_open)) {
      return `hoje às ${settings.next_business_open.slice(0,5)}`;
    }
    if (add === 0) continue;
    if (add === 1) return `amanhã às ${settings.next_business_open.slice(0,5)}`;
    return `${formatter.format(probe)} às ${settings.next_business_open.slice(0,5)}`;
  }
  return `no próximo dia útil às ${settings.next_business_open.slice(0,5)}`;
}

export async function loadNaraOperationalContext(
  client: SupabaseClient,
  organizationId: string,
  now = new Date(),
): Promise<NaraOperationalContext> {
  const defaults: Required<SettingsRow> = {
    business_timezone: 'America/Sao_Paulo',
    business_days: [1,2,3,4,5],
    business_open: '08:00',
    business_close: '18:00',
    hot_lead_sla_minutes: 10,
    next_business_open: '08:00',
  };
  let settings = defaults;
  try {
    const { data, error } = await client.from('nara_operational_settings')
      .select('business_timezone,business_days,business_open,business_close,hot_lead_sla_minutes,next_business_open')
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error && error.code !== '42P01' && error.code !== 'PGRST205') throw error;
    settings = { ...defaults, ...(data ?? {}) } as Required<SettingsRow>;
  } catch {
    settings = defaults;
  }

  const local = localParts(now, settings.business_timezone);
  const currentMinutes = local.hour * 60 + local.minute;
  const openNow = settings.business_days.includes(local.weekday)
    && currentMinutes >= minutes(settings.business_open)
    && currentMinutes < minutes(settings.business_close);
  const next = nextBusinessLabel(now, settings);

  return {
    ...settings,
    now_local: `${local.date} ${String(local.hour).padStart(2,'0')}:${String(local.minute).padStart(2,'0')}`,
    business_open_now: openNow,
    next_business_label: next,
    source_text: [
      'SLA COMERCIAL CONFIRMADO:',
      `- Horário comercial: ${settings.business_open.slice(0,5)}–${settings.business_close.slice(0,5)}, dias úteis, fuso ${settings.business_timezone}.`,
      `- Lead quente/pedido de humano dentro do horário: corretor responde em até ${settings.hot_lead_sla_minutes} minutos.`,
      `- Status agora: ${openNow ? 'dentro do horário comercial' : 'fora do horário comercial'}.`,
      openNow
        ? `- Se perguntarem quanto demora, diga: “Um corretor te chama em até ${settings.hot_lead_sla_minutes} minutos.”`
        : `- Se perguntarem quanto demora, diga: “Nosso time volta ${next} e você será o primeiro a ser atendido.”`,
    ].join('\n'),
  };
}
