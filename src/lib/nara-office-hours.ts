export function officeHours(date: string, weekdayHours?: string, saturdayHours?: string): { open: number; close: number } | null {
  const weekday = new Date(`${date}T12:00:00-03:00`).getUTCDay();
  if (weekday === 0) return null;
  const raw = weekday === 6 ? saturdayHours : weekdayHours;
  const match = raw?.match(/^(\d{1,2}):([0-5]\d)-(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const open = Number(match[1]) * 60 + Number(match[2]);
  const close = Number(match[3]) * 60 + Number(match[4]);
  return close > open && close <= 1440 ? {open, close} : null;
}
