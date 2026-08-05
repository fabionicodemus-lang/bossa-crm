import type { NaraCommercialTurnContext } from './nara-unit-queries';

export type NaraSimulatorCommercialDiagnostics = {
  price_consulted: boolean;
  returned_units: string[];
  consultation_names: string[];
};

export function countReplyWords(reply: string): number {
  const normalized = reply.trim();
  return normalized ? normalized.split(/\s+/u).length : 0;
}

function unitFromResult(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const unit = 'unidade' in value ? String(value.unidade ?? '').trim() : '';
  return unit || null;
}

export function naraCommercialDiagnostics(
  commercial: NaraCommercialTurnContext | null | undefined,
): NaraSimulatorCommercialDiagnostics {
  const calls = commercial?.calls ?? [];
  const units = new Set<string>();
  for (const call of calls) {
    if (Array.isArray(call.result)) {
      for (const row of call.result) {
        const unit = unitFromResult(row);
        if (unit) units.add(unit);
      }
      continue;
    }
    const unit = unitFromResult(call.result);
    if (unit) units.add(unit);
  }
  return {
    price_consulted: calls.length > 0,
    returned_units: [...units],
    consultation_names: calls.map((call) => call.name),
  };
}
