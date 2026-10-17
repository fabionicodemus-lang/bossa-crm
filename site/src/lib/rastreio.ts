"use client";
// Código de visita e envio de eventos. Roda só no navegador.
// O código é anônimo até a pessoa escolher falar com a Bossa (WhatsApp ou formulário).

import type { Evento } from "./eventos";
import { EVENTOS_META } from "./eventos";

type Detalhe = Record<string, string | number | boolean | undefined>;

const CHAVE_VISITANTE = "bossa_vid";
const CHAVE_SESSAO = "bossa_sid";
const CHAVE_CONSENTIMENTO = "bossa_consent";
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O, 1/I: fácil de ler no WhatsApp

type Visitante = { codigo: string; primeira: string; ultima: string; visitas: number };
type Sessao = { id: string; inicio: string; utm: Record<string, string>; referencia: string; entrada: string };

function guardar(tipo: "local" | "session", chave: string, valor: unknown) {
  try { (tipo === "local" ? localStorage : sessionStorage).setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento */ }
}
function ler<T>(tipo: "local" | "session", chave: string): T | null {
  try { const v = (tipo === "local" ? localStorage : sessionStorage).getItem(chave); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}

function novoCodigo(n = 6) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}

let memVisitante: Visitante | null = null;
let memSessao: Sessao | null = null;

/** Inicia visitante e sessão. Retorna true quando é uma volta ao site em outro dia. */
export function iniciar(): { visitante: Visitante; sessao: Sessao; voltou: number | null } {
  const agora = new Date();
  let v = ler<Visitante>("local", CHAVE_VISITANTE);
  let s = ler<Sessao>("session", CHAVE_SESSAO);
  let voltou: number | null = null;

  if (!s) {
    const url = new URL(location.href);
    const utm: Record<string, string> = {};
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"]) {
      const x = url.searchParams.get(k); if (x) utm[k] = x.slice(0, 200);
    }
    s = { id: crypto.randomUUID(), inicio: agora.toISOString(), utm, referencia: document.referrer.slice(0, 300), entrada: location.pathname };
    if (v) {
      const dias = Math.floor((agora.getTime() - new Date(v.ultima).getTime()) / 864e5);
      v = { ...v, visitas: v.visitas + 1, ultima: agora.toISOString() };
      if (dias >= 1) voltou = dias;
    }
    guardar("session", CHAVE_SESSAO, s);
  }
  if (!v) v = { codigo: novoCodigo(), primeira: agora.toISOString(), ultima: agora.toISOString(), visitas: 1 };
  guardar("local", CHAVE_VISITANTE, v);
  memVisitante = v; memSessao = s;
  return { visitante: v, sessao: s, voltou };
}

export function codigoVisita(): string {
  return (memVisitante ?? ler<Visitante>("local", CHAVE_VISITANTE))?.codigo ?? "";
}
export function utmsSessao(): Record<string, string> {
  return (memSessao ?? ler<Sessao>("session", CHAVE_SESSAO))?.utm ?? {};
}

export type Consentimento = "todos" | "necessarios" | null;
export function consentimento(): Consentimento {
  try { return (localStorage.getItem(CHAVE_CONSENTIMENTO) as Consentimento) ?? null; } catch { return null; }
}
export function definirConsentimento(c: Exclude<Consentimento, null>) {
  try { localStorage.setItem(CHAVE_CONSENTIMENTO, c); } catch { /* */ }
  window.dispatchEvent(new CustomEvent("bossa:consentimento", { detail: c }));
}

declare global {
  interface Window { gtag?: (...a: unknown[]) => void; fbq?: (...a: unknown[]) => void; }
}

/** Registra um evento: banco da Bossa sempre (anônimo); GA4 e Meta só com consentimento. */
export function rastrear(evento: Evento, detalhe: Detalhe = {}) {
  if (typeof window === "undefined") return;
  if (!memVisitante) iniciar();
  const v = memVisitante!, s = memSessao!;
  const corpo = {
    evento,
    detalhe,
    visitante: v.codigo,
    sessao: s.id,
    visita: v.visitas,
    pagina: location.pathname,
    titulo: document.title.slice(0, 160),
    referencia: s.referencia,
    utm: s.utm,
    tela: `${window.innerWidth}x${window.innerHeight}`,
    idioma: navigator.language,
    em: new Date().toISOString(),
  };
  const json = JSON.stringify(corpo);
  try {
    const ok = navigator.sendBeacon?.("/api/eventos", new Blob([json], { type: "application/json" }));
    if (!ok) fetch("/api/eventos", { method: "POST", body: json, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
  } catch { /* */ }

  if (consentimento() === "todos") {
    window.gtag?.("event", evento, { ...detalhe, visit_code: v.codigo });
    const meta = EVENTOS_META[evento];
    if (meta) window.fbq?.("track", meta, { content_name: String(detalhe.empreendimento ?? ""), content_category: evento });
  }
  if (process.env.NODE_ENV !== "production") console.debug("[bossa]", evento, detalhe);
}

/** Link do WhatsApp com a mensagem pronta e o código de visita. */
export function linkWhatsApp(numero: string, mensagem: string) {
  const ref = codigoVisita();
  const texto = ref ? `${mensagem} (ref. ${ref})` : mensagem;
  const base = numero ? `https://wa.me/${numero}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(texto)}`;
}
