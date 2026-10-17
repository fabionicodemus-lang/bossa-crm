import { NextResponse } from "next/server";
import { banco, ORG, normalizarTelefone } from "@/lib/banco";

const FORMULARIOS = new Set(["book", "visita", "interesse", "corretor", "contato"]);
const COD = /^[A-Z2-9]{4,8}$/;

export async function POST(req: Request) {
  let c: Record<string, unknown>;
  try { c = await req.json(); } catch { return NextResponse.json({ erro: "Não foi possível ler o envio." }, { status: 400 }); }

  // Campo-armadilha: pessoas não veem, robôs preenchem.
  if (typeof c.site === "string" && c.site.length > 0) return NextResponse.json({ ok: true });

  const nome = String(c.nome ?? "").trim().slice(0, 120);
  const telefone = normalizarTelefone(String(c.whatsapp ?? ""));
  const formulario = String(c.formulario ?? "");
  const empreendimento = String(c.empreendimento ?? "").slice(0, 60);
  const interesse = String(c.interesse ?? "").slice(0, 40);
  const creci = String(c.creci ?? "").slice(0, 30);
  const visitante = COD.test(String(c.visitante ?? "")) ? String(c.visitante) : null;

  const erros: Record<string, string> = {};
  if (nome.length < 2) erros.nome = "Escreva seu nome para sabermos com quem falar.";
  if (!telefone) erros.whatsapp = "Confira o número, com DDD ou código do país.";
  if (c.consentimento !== true) erros.consentimento = "Precisamos do seu aceite para entrar em contato.";
  if (!FORMULARIOS.has(formulario)) erros.formulario = "Formulário desconhecido.";
  if (Object.keys(erros).length) return NextResponse.json({ erros }, { status: 422 });

  const db = banco();
  if (!db || !ORG()) {
    console.warn("[leads] banco não configurado; lead não gravado", { formulario, empreendimento });
    return NextResponse.json({ ok: true, gravado: false });
  }

  const { data, error } = await db.rpc("site_registrar_lead", {
    p_organizacao: ORG(),
    p_nome: nome,
    p_telefone: telefone,
    p_formulario: formulario,
    p_empreendimento: empreendimento || null,
    p_interesse: interesse || null,
    p_creci: creci || null,
    p_visitante: visitante,
    p_utm: (c.utm && typeof c.utm === "object") ? c.utm : {},
  });
  if (error) {
    console.error("[leads]", error.message);
    return NextResponse.json({ erro: "Não conseguimos registrar agora. Fale com a gente pelo WhatsApp." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, gravado: true, lead: data });
}
