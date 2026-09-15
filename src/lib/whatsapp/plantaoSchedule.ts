import type { SupabaseClient } from '@supabase/supabase-js';

type Schedule = boolean[][];

function validSchedule(value: unknown): value is Schedule {
  return Array.isArray(value)
    && value.length === 7
    && value.every((day) => Array.isArray(day) && day.length === 24);
}

function currentSlot(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: days[weekday] ?? 0, hour: Number.isFinite(hour) ? hour : 0 };
}

export async function plantaoCanReplyNow(admin: SupabaseClient, organizationId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('ai_agent_configs')
    .select('active,schedule,schedule_timezone')
    .eq('organization_id', organizationId)
    .eq('agent', 'plantao')
    .maybeSingle();
  if (error) {
    console.error('[plantao schedule]', error.message);
    return false;
  }
  if (!data || data.active === false) return false;

  // Instalações antigas sem grade continuam ligadas; quando existe grade,
  // ela é a fonte de verdade do horário configurado na tela Plantão IA.
  if (!validSchedule(data.schedule)) return true;
  const zone = String(data.schedule_timezone || 'America/Sao_Paulo');
  const slot = currentSlot(zone);
  return Boolean(data.schedule[slot.day]?.[slot.hour]);
}
