"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Empreendimento, Planta } from "@/content/empreendimentos";
import { LinkWhatsApp } from "../LinkWhatsApp";
import { rastrear } from "@/lib/rastreio";
import { useExposicaoFlow, VisorFlow } from "./Experiencia";
export function PlantasFlow({
  e,
  indice,
  escolher,
  contextoVista = "",
}: {
  e: Empreendimento;
  indice: number;
  escolher: (i: number) => void;
  contextoVista?: string;
}) {
  const p = e.plantas[indice],
    vistos = useRef(new Set<string>()),
    ref = useExposicaoFlow(
      "view_floorplan",
      p.slug,
      { empreendimento: e.slug, planta: p.slug, metragem: p.areaNum },
      vistos.current,
    ),
    [zoom, setZoom] = useState(false),
    [retorno, setRetorno] = useState("");
  useEffect(() => setRetorno(""), [p.slug]);
  const aviso =
    p.slug === "duplex-tipo-1"
      ? "Prancha ilustrativa do Duplex Tipo 1, com os pisos inferior e superior e área privativa total de 117,7 m². Amplie para consultar o desenho."
      : p.suites === 3
        ? "Prancha ilustrativa com os pisos inferior e superior. Consulte a equipe para esclarecer a distribuição."
        : "Planta humanizada ilustrativa. Consulte a equipe sobre o detalhamento do projeto.";
  const foto = {
    src: p.imagens[0].src,
    alt: p.imagens[0].alt,
    titulo: `${p.nome} · ${p.area} · ${p.suites} suítes`,
    legenda: aviso,
  };
  async function compartilhar() {
    const url = `${location.origin}/empreendimentos/${e.slug}/plantas/${p.slug}#opcoes-flow`;
    setRetorno("");
    try {
      if (navigator.share) {
        await navigator.share({ title: foto.titulo, url });
        setRetorno("Compartilhamento concluído no dispositivo.");
      } else {
        await navigator.clipboard.writeText(url);
        setRetorno("Link copiado.");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setRetorno(
        "Não foi possível compartilhar automaticamente. Copie o endereço abaixo.",
      );
    }
  }
  return (
    <div>
      <div
        id="opcoes-flow"
        className="fl-opcoes"
        role="group"
        aria-label="Escolher planta do Flow"
        onKeyDown={(ev) => {
          const foco = e.plantas.findIndex(
            (x) =>
              ev.target instanceof HTMLElement &&
              ev.target.dataset.planta === x.slug,
          );
          if (foco < 0) return;
          const n =
            ev.key === "ArrowRight"
              ? (foco + 1) % e.plantas.length
              : ev.key === "ArrowLeft"
                ? (foco + e.plantas.length - 1) % e.plantas.length
                : -1;
          if (n >= 0) {
            ev.preventDefault();
            escolher(n);
            document
              .querySelector<HTMLButtonElement>(
                `[data-planta="${e.plantas[n].slug}"]`,
              )
              ?.focus();
          }
        }}
      >
        {[false, true].map((duplex) => (
          <div className="fl-opcoes-grupo" key={String(duplex)}>
            <p className="fl-rot">{duplex ? "Duplex" : "Apartamentos tipo"}</p>
            <div>
              {e.plantas.map(
                (q, j) =>
                  (q.suites === 3) === duplex && (
                    <button
                      type="button"
                      key={q.slug}
                      data-planta={q.slug}
                      aria-pressed={j === indice}
                      aria-controls="fl-planta-painel"
                      onClick={() => {
                        setRetorno("");
                        escolher(j);
                      }}
                    >
                      <b>{q.area}</b>
                      <span>{q.suites} suítes</span>
                      <small>{q.nome}</small>
                    </button>
                  ),
              )}
            </div>
          </div>
        ))}
      </div>
      <div ref={ref} id="fl-planta-painel" className="fl-planta-painel">
        <div>
          <button
            className="fl-planta-quadro"
            type="button"
            aria-label="Ampliar planta selecionada"
            onClick={() => {
              setZoom(true);
              rastrear("floorplan_zoom", {
                empreendimento: e.slug,
                planta: p.slug,
              });
            }}
          >
            <Image
              src={p.imagens[0].src}
              alt={p.imagens[0].alt}
              fill
              sizes="(max-width:860px) 100vw, 55vw"
              style={{ objectFit: "contain" }}
            />
          </button>
          <p className="fl-nota">{aviso}</p>
        </div>
        <div className="fl-pilha">
          <p className="fl-rot">{p.nome}</p>
          <h3 className="fl-h3">
            {p.area} · {p.suites} suítes
          </h3>
          <p className="fl-p">{p.descricao}</p>
          <p>Área privativa</p>
          <LinkWhatsApp
            className="fl-bt"
            empreendimento={e.slug}
            planta={p.slug}
            botao="flow_planta"
            mensagem={`Olá! Quero conhecer a planta ${p.nome}, de ${p.area}, com ${p.suites} suítes, do Flow Aptos. Podemos conversar sobre uma visita? ${contextoVista}`}
          >
            Quero conhecer esta planta
          </LinkWhatsApp>
          <div className="fl-acoes">
            <button
              className="fl-bt fl-bt--linha"
              onClick={() => {
                setZoom(true);
                rastrear("floorplan_zoom", {
                  empreendimento: e.slug,
                  planta: p.slug,
                });
              }}
            >
              Ampliar planta
            </button>
            <button className="fl-bt fl-bt--linha" onClick={compartilhar}>
              Compartilhar planta
            </button>
          </div>
          <p role="status">{retorno}</p>
          {retorno.includes("Copie") && (
            <label>
              Link da planta
              <input
                readOnly
                value={`${typeof location !== "undefined" ? location.origin : ""}/empreendimentos/${e.slug}/plantas/${p.slug}#opcoes-flow`}
                onFocus={(ev) => ev.target.select()}
              />
            </label>
          )}
          <p className="fl-nota">
            Plantas ilustrativas. Medidas podem variar conforme o projeto
            executivo. Informações de vagas e condições atuais devem ser
            confirmadas com a equipe.
          </p>
        </div>
      </div>
      {zoom && <VisorFlow foto={foto} fechar={() => setZoom(false)} />}
    </div>
  );
}
