import { NextResponse } from "next/server";
import { EVENTOS, CHAVES_DETALHE } from "@/lib/eventos";
import { banco } from "@/lib/banco";

const permitidos = new Set<string>(EVENTOS);
const chaves = new Set<string>(CHAVES_DETALHE);
const COD = /^[A-Z2-9]{4,8}$/;

function limpar(v: unknown, max = 200): string | number | boolean | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.slice(0, max);
  return null;
}

export async function POST(req: Request) {
  let c: Record<string, unknown>;
  try {
    const texto = await req.text();
    if (texto.length > 8000) return new NextResponse(null, { status: 413 });
    c = JSON.parse(texto);
  } catch { return new NextResponse(null, { status: 400 }); }

  const evento = String(c.evento ?? "");
  const visitante = String(c.visitante ?? "");
  if (!permitidos.has(evento) || !COD.test(visitante)) return new NextResponse(null, { status: 400 });

  const detalhe: Record<string, unknown> = {};
  if (c.detalhe && typeof c.detalhe === "object") {
    for (const [k, v] of Object.entries(c.detalhe as Record<string, unknown>)) {
      if (chaves.has(k)) { const x = limpar(v); if (x !== null) detalhe[k] = x; }
    }
  }
  const utm: Record<string, string> = {};
  if (c.utm && typeof c.utm === "object") for (const [k, v] of Object.entries(c.utm as Record<string, unknown>)) if (/^(utm_\w+|fbclid|gclid)$/.test(k) && typeof v === "string") utm[k] = v.slice(0, 200);

  const db = banco();
  if (!db) { console.warn("[eventos] banco não configurado; evento não gravado"); return new NextResponse(null, { status: 204 }); }

  const pais = req.headers.get("x-vercel-ip-country") || null;
  const cidade = decodeURIComponent(req.headers.get("x-vercel-ip-city") || "") || null;
  const estado = req.headers.get("x-vercel-ip-country-region") || null;
  const sessao = typeof c.sessao === "string" && /^[0-9a-f-]{36}$/i.test(c.sessao) ? c.sessao : null;
  const visita = typeof c.visita === "number" ? Math.min(Math.max(1, Math.floor(c.visita)), 100000) : 1;

  // Visitante e sessão são criados/atualizados aqui; o evento entra em seguida.
  const { error } = await db.rpc("site_registrar_evento", {
    p_visitante: visitante,
    p_sessao: sessao,
    p_visita: visita,
    p_evento: evento,
    p_detalhe: detalhe,
    p_pagina: limpar(c.pagina, 300),
    p_referencia: limpar(c.referencia, 300),
    p_utm: utm,
    p_tela: limpar(c.tela, 20),
    p_idioma: limpar(c.idioma, 20),
    p_pais: pais,
    p_estado: estado,
    p_cidade: cidade,
    p_dispositivo: /Mobi|Android|iPhone/i.test(req.headers.get("user-agent") || "") ? "celular" : "computador",
  });
  if (error) console.error("[eventos]", evento, error.message);
  return new NextResponse(null, { status: 204 });
}
