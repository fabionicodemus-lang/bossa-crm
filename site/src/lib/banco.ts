import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente com chave de serviço: só no servidor. Sem as variáveis, o site funciona e apenas não grava.
let cliente: SupabaseClient | null | undefined;
export function banco(): SupabaseClient | null {
  if (cliente !== undefined) return cliente;
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY; // mesmo nome usado no CRM
  cliente = url && chave ? createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return cliente;
}

export const ORG = () => process.env.BOSSA_ORGANIZATION_ID || "";

export { normalizarTelefone } from "./telefone";
