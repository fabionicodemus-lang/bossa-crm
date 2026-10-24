"use client";
import { useRef, useState } from "react";
import { normalizarTelefone } from "@/lib/telefone";
import { codigoVisita, rastrear, utmsSessao } from "@/lib/rastreio";

type Props = {
  formulario: "book" | "visita" | "interesse" | "corretor" | "contato";
  empreendimento?: string;
  botao: string;
  sucesso: string;
  interesse?: boolean;
  alma?: boolean;
  solicitacao?: boolean;
  creci?: boolean;
  data?: boolean;
};

export function FormLead({
  formulario,
  empreendimento,
  botao,
  sucesso,
  interesse = false,
  alma = false,
  solicitacao = false,
  creci = false,
  data = false,
}: Props) {
  const [erros, setErros] = useState<Record<string, string>>({});
  const [estado, setEstado] = useState<"livre" | "enviando" | "ok" | "falha">(
    "livre",
  );
  const [falha, setFalha] = useState("");
  const comecou = useRef(false);
  const enviando = useRef(false);
  const id = (c: string) => `${formulario}-${c}`;

  function inicio() {
    if (!comecou.current) {
      comecou.current = true;
      rastrear("form_start", { formulario, empreendimento });
    }
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando.current) return;
    const f = new FormData(e.currentTarget);
    const validacao: Record<string, string> = {};
    if (String(f.get("nome") ?? "").trim().length < 2)
      validacao.nome = "Escreva seu nome para sabermos com quem falar.";
    if (!normalizarTelefone(String(f.get("whatsapp") ?? "")))
      validacao.whatsapp =
        "Confira o DDD e o número. Para outro país, informe também + e o código do país.";
    if (f.get("consentimento") !== "on")
      validacao.consentimento =
        "Precisamos do seu aceite para entrar em contato sobre este assunto.";
    if (Object.keys(validacao).length) {
      setErros(validacao);
      setEstado("livre");
      e.currentTarget
        .querySelector<HTMLElement>(`[name="${Object.keys(validacao)[0]}"]`)
        ?.focus();
      return;
    }
    enviando.current = true;
    setEstado("enviando");
    setErros({});
    const corpo = {
      formulario,
      empreendimento,
      nome: f.get("nome"),
      whatsapp: f.get("whatsapp"),
      interesse: f.get("interesse") ?? undefined,
      creci: f.get("creci") ?? undefined,
      data: f.get("data") ?? undefined,
      consentimento: f.get("consentimento") === "on",
      site: f.get("site"),
      visitante: codigoVisita(),
      utm: utmsSessao(),
    };
    try {
      const r = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const j = await r.json();
      if (r.status === 422 && j.erros && Object.keys(j.erros).length) {
        setErros(j.erros || {});
        setEstado("livre");
        return;
      }
      if (!r.ok || j.ok !== true || j.gravado !== true) {
        setFalha(
          "Não foi possível concluir o registro. Tente novamente ou converse com a equipe pelo WhatsApp.",
        );
        setEstado("falha");
        return;
      }
      rastrear("lead_submit", {
        formulario,
        empreendimento,
        interesse: corpo.interesse ? String(corpo.interesse) : undefined,
      });
      if (solicitacao && formulario === "book")
        rastrear("request_material", { empreendimento, formulario, arquivo: "apresentacao-flow" });
      if (!alma && !solicitacao && formulario === "visita")
        rastrear("request_visit", {
          empreendimento,
          data: String(corpo.data ?? ""),
        });
      if (!alma && !solicitacao && formulario === "book")
        rastrear("download_material", { empreendimento, arquivo: "book" });
      setEstado("ok");
    } catch {
      setFalha(
        navigator.onLine === false
          ? "Sem conexão no momento. Seus dados continuam aqui. Tente novamente quando a conexão voltar."
          : "Não foi possível concluir o registro. Tente novamente ou converse com a equipe pelo WhatsApp.",
      );
      setEstado("falha");
    } finally {
      enviando.current = false;
    }
  }

  if (estado === "ok")
    return (
      <div className="form__ok" role="status">
        <p className="lead">{sucesso}</p>
      </div>
    );

  return (
    <form className="form" onSubmit={enviar} onChange={inicio} noValidate>
      <div className="campo">
        <label htmlFor={id("nome")}>
          Nome <span aria-hidden="true">*</span>
        </label>
        <input
          id={id("nome")}
          name="nome"
          required
          autoComplete="name"
          aria-invalid={!!erros.nome}
          aria-describedby={erros.nome ? id("nome-e") : undefined}
        />
        {erros.nome && (
          <span className="erro" id={id("nome-e")}>
            {erros.nome}
          </span>
        )}
      </div>
      <div className="campo">
        <label htmlFor={id("whats")}>
          {alma ? "WhatsApp *" : "WhatsApp com DDD (ou código do país)"}
        </label>
        <input
          id={id("whats")}
          name="whatsapp"
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          aria-invalid={!!erros.whatsapp}
          aria-describedby={
            [alma ? id("whats-ajuda") : "", erros.whatsapp ? id("whats-e") : ""]
              .filter(Boolean)
              .join(" ") || undefined
          }
        />
        {alma && (
          <span id={id("whats-ajuda")}>
            No Brasil, informe DDD e número. Para outro país, comece com + e o
            código do país.
          </span>
        )}
        {erros.whatsapp && (
          <span className="erro" id={id("whats-e")}>
            {erros.whatsapp}
          </span>
        )}
      </div>
      {creci && (
        <div className="campo">
          <label htmlFor={id("creci")}>CRECI</label>
          <input id={id("creci")} name="creci" />
        </div>
      )}
      {interesse && (
        <div className="campo">
          <label htmlFor={id("int")}>
            {alma ? "Como você imagina usar o Alma? — opcional" : "Interesse"}
          </label>
          <select
            id={id("int")}
            name="interesse"
            defaultValue={alma ? "" : "Morar"}
          >
            {alma && <option value="">Selecione, se quiser</option>}
            <option>Morar</option>
            {alma && <option>Casa de praia</option>}
            <option>Investir</option>
            {alma ? (
              <option>Ainda estou conhecendo</option>
            ) : (
              <option>Os dois</option>
            )}
          </select>
        </div>
      )}
      {data && (
        <div className="campo">
          <label htmlFor={id("data")}>Data sugerida para a visita</label>
          <input id={id("data")} name="data" type="date" />
        </div>
      )}
      <div style={{ position: "absolute", left: -9999 }} aria-hidden="true">
        <label>
          Site
          <input name="site" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="consentimento" htmlFor={id("ok")}>
        <input
          id={id("ok")}
          name="consentimento"
          type="checkbox"
          required
          aria-invalid={!!erros.consentimento}
          aria-describedby={erros.consentimento ? id("ok-e") : undefined}
        />
        <span>
          Aceito receber contato da Bossa por WhatsApp sobre este assunto. Veja
          a <a href="/privacidade">Política de Privacidade</a>.
          {erros.consentimento && (
            <>
              <br />
              <span className="erro" id={id("ok-e")}>
                {erros.consentimento}
              </span>
            </>
          )}
        </span>
      </label>
      <button
        className="botao"
        type="submit"
        disabled={estado === "enviando"}
        style={{ justifySelf: "start" }}
      >
        {estado === "enviando" ? (alma ? "Registrando…" : "Enviando…") : botao}
      </button>
      {estado === "falha" && (
        <p className="erro" role="alert">
          {falha}
        </p>
      )}
    </form>
  );
}
