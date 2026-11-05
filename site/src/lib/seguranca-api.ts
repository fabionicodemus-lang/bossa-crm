import { createHash } from "node:crypto";
import { isIP } from "node:net";

export class ErroApiPublica extends Error {
  readonly status: number;
  readonly retryAfter?: number;
  constructor(status: number, mensagem: string, retryAfter?: number) {
    super(mensagem);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

// Evita que outro site use o navegador de um visitante para enviar nossos formulários.
// Origin não autentica robôs: limites e validação do conteúdo continuam necessários.
export function validarOrigem(req: Request): void {
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    throw new ErroApiPublica(403, "Origem do envio não permitida.");
  }
  const origem = req.headers.get("origin");
  if (!origem) return; // Clientes sem cabeçalhos de navegador ainda passam pelas demais validações.
  try {
    const url = new URL(origem);
    if (url.origin === new URL(req.url).origin && origem === url.origin) return;
  } catch { /* Origem inválida é recusada abaixo. */ }
  throw new ErroApiPublica(403, "Origem do envio não permitida.");
}

export async function lerObjetoJson(req: Request, limite: number): Promise<Record<string, unknown>> {
  const tipo = req.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (tipo !== "application/json") throw new ErroApiPublica(415, "Envie os dados no formato JSON.");
  const declarado = req.headers.get("content-length");
  if (declarado && Number(declarado) > limite) throw new ErroApiPublica(413, "Envio muito grande.");
  if (!req.body) throw new ErroApiPublica(400, "Não foi possível ler o envio.");

  const leitor = req.body.getReader();
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  try {
    for (;;) {
      const parte = await leitor.read();
      if (parte.done) break;
      tamanho += parte.value.byteLength;
      if (tamanho > limite) {
        await leitor.cancel().catch(() => {});
        throw new ErroApiPublica(413, "Envio muito grande.");
      }
      partes.push(parte.value);
    }
  } finally { leitor.releaseLock(); }
  const bytes = new Uint8Array(tamanho);
  let posicao = 0;
  for (const parte of partes) { bytes.set(parte, posicao); posicao += parte.byteLength; }
  try {
    const valor: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (valor && typeof valor === "object" && !Array.isArray(valor)) return valor as Record<string, unknown>;
  } catch { /* Resposta controlada para JSON inválido. */ }
  throw new ErroApiPublica(400, "Não foi possível ler o envio.");
}

type Contador = { quantidade: number; expira: number };

// Proteção local adicional, com memória limitada. Instâncias/regiões não compartilham
// contadores; o WAF é a camada de controle de tráfego distribuído.
export function criarLimitador(maximoChaves = 4096, agora: () => number = Date.now) {
  const contadores = new Map<string, Contador>();
  return (chave: string, limite: number, janelaMs: number): number => {
    const tempo = agora();
    let contador = contadores.get(chave);
    if (!contador || contador.expira <= tempo) {
      if (contadores.size >= maximoChaves) {
        for (const [k, v] of contadores) if (v.expira <= tempo) contadores.delete(k);
        if (contadores.size >= maximoChaves) contadores.delete(contadores.keys().next().value!);
      }
      contador = { quantidade: 0, expira: tempo + janelaMs };
      contadores.set(chave, contador);
    }
    contador.quantidade += 1;
    return contador.quantidade > limite ? Math.max(1, Math.ceil((contador.expira - tempo) / 1000)) : 0;
  };
}

const limitar = criarLimitador();

export function limitarEnvios(req: Request, grupo: "leads" | "eventos"): void {
  // Só confiamos no IP sobrescrito pela plataforma, nunca em um cabeçalho do
  // visitante num servidor genérico. Não guardamos IPs em texto nem em logs.
  if (process.env.VERCEL !== "1") return;
  const ip = req.headers.get("x-vercel-forwarded-for")?.trim();
  if (!ip || !isIP(ip)) return;
  const chave = `${grupo}:${createHash("sha256").update(ip).digest("hex")}`;
  const retry = limitar(chave, grupo === "leads" ? 20 : 240, 60_000);
  if (retry) throw new ErroApiPublica(429, "Muitos envios. Aguarde um minuto e tente novamente.", retry);
}

export function erroPublico(error: unknown): Response {
  const conhecido = error instanceof ErroApiPublica;
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  if (conhecido && error.retryAfter) headers.set("retry-after", String(error.retryAfter));
  return new Response(JSON.stringify({ erro: conhecido ? error.message : "Não foi possível ler o envio." }), {
    status: conhecido ? error.status : 400,
    headers,
  });
}

const CHAVES_UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"] as const;
export function limparUtm(valor: unknown): Record<string, string> {
  const resultado: Record<string, string> = {};
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return resultado;
  const entrada = valor as Record<string, unknown>;
  for (const chave of CHAVES_UTM) if (typeof entrada[chave] === "string") resultado[chave] = entrada[chave].slice(0, 200);
  return resultado;
}
