"use client";
import { useRef, useState } from "react";
import { codigoVisita, rastrear, utmsSessao } from "@/lib/rastreio";

type Props = {
  formulario: "book" | "visita" | "interesse" | "corretor" | "contato";
  empreendimento?: string;
  botao: string;
  sucesso: string;
  interesse?: boolean;
  creci?: boolean;
  data?: boolean;
};

export function FormLead({ formulario, empreendimento, botao, sucesso, interesse = false, creci = false, data = false }: Props) {
  const [erros, setErros] = useState<Record<string, string>>({});
  const [estado, setEstado] = useState<"livre" | "enviando" | "ok" | "falha">("livre");
  const [falha, setFalha] = useState("");
  const comecou = useRef(false);
  const id = (c: string) => `${formulario}-${c}`;

  function inicio() { if (!comecou.current) { comecou.current = true; rastrear("form_start", { formulario, empreendimento }); } }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setEstado("enviando"); setErros({});
    const corpo = {
      formulario, empreendimento,
      nome: f.get("nome"), whatsapp: f.get("whatsapp"), interesse: f.get("interesse") ?? undefined, creci: f.get("creci") ?? undefined,
      data: f.get("data") ?? undefined, consentimento: f.get("consentimento") === "on", site: f.get("site"),
      visitante: codigoVisita(), utm: utmsSessao(),
    };
    try {
      const r = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
      const j = await r.json();
      if (r.status === 422) { setErros(j.erros || {}); setEstado("livre"); return; }
      if (!r.ok) { setFalha(j.erro || "Não conseguimos registrar agora."); setEstado("falha"); return; }
      rastrear("lead_submit", { formulario, empreendimento, interesse: String(corpo.interesse ?? "") });
      if (formulario === "visita") rastrear("request_visit", { empreendimento, data: String(corpo.data ?? "") });
      if (formulario === "book") rastrear("download_material", { empreendimento, arquivo: "book" });
      setEstado("ok");
    } catch { setFalha("Sem conexão no momento. Tente de novo ou fale pelo WhatsApp."); setEstado("falha"); }
  }

  if (estado === "ok") return <div className="form__ok" role="status"><p className="lead">{sucesso}</p></div>;

  return (
    <form className="form" onSubmit={enviar} onFocus={inicio} noValidate>
      <div className="campo">
        <label htmlFor={id("nome")}>Nome</label>
        <input id={id("nome")} name="nome" autoComplete="name" aria-invalid={!!erros.nome} aria-describedby={erros.nome ? id("nome-e") : undefined} />
        {erros.nome && <span className="erro" id={id("nome-e")}>{erros.nome}</span>}
      </div>
      <div className="campo">
        <label htmlFor={id("whats")}>WhatsApp com DDD (ou código do país)</label>
        <input id={id("whats")} name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" aria-invalid={!!erros.whatsapp} aria-describedby={erros.whatsapp ? id("whats-e") : undefined} />
        {erros.whatsapp && <span className="erro" id={id("whats-e")}>{erros.whatsapp}</span>}
      </div>
      {creci && (
        <div className="campo"><label htmlFor={id("creci")}>CRECI</label><input id={id("creci")} name="creci" /></div>
      )}
      {interesse && (
        <div className="campo">
          <label htmlFor={id("int")}>Interesse</label>
          <select id={id("int")} name="interesse" defaultValue="Morar"><option>Morar</option><option>Investir</option><option>Os dois</option></select>
        </div>
      )}
      {data && (
        <div className="campo"><label htmlFor={id("data")}>Data sugerida para a visita</label><input id={id("data")} name="data" type="date" /></div>
      )}
      <div style={{ position: "absolute", left: -9999 }} aria-hidden="true"><label>Site<input name="site" tabIndex={-1} autoComplete="off" /></label></div>
      <label className="consentimento" htmlFor={id("ok")}>
        <input id={id("ok")} name="consentimento" type="checkbox" aria-invalid={!!erros.consentimento} />
        <span>Aceito receber contato da Bossa por WhatsApp sobre este assunto. Veja a <a href="/privacidade">Política de Privacidade</a>.{erros.consentimento && <><br /><span className="erro">{erros.consentimento}</span></>}</span>
      </label>
      <button className="botao" type="submit" disabled={estado === "enviando"} style={{ justifySelf: "start" }}>{estado === "enviando" ? "Enviando…" : botao}</button>
      {estado === "falha" && <p className="erro" role="alert">{falha}</p>}
    </form>
  );
}
