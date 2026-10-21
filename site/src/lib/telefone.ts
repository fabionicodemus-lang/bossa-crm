/** Preserva DDI explícito. Sem +, aceita somente número nacional com DDD ou Brasil completo. */
export function normalizarTelefone(bruto: string): string | null {
  const entrada = bruto.trim();
  const d = entrada.replace(/\D/g, "");
  if (entrada.startsWith("+")) return /^[1-9]\d{6,14}$/.test(d) ? d : null;
  if (/^[1-9]\d{9,10}$/.test(d)) return "55" + d;
  if (/^55[1-9]\d{9,10}$/.test(d)) return d;
  return null;
}
