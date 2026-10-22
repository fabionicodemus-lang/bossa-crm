"use client";
import Image from "next/image";
import { useState } from "react";
import { VisorFlow } from "./Experiencia";
import { LinkWhatsApp } from "../LinkWhatsApp";
import { rastrear } from "@/lib/rastreio";

// Quadros do vídeo de drone "Vista dos andares" (Bossa), um por andar, em três direções.
const DIRECOES = [
  {
    id: "a",
    nome: "Para o mar",
    sub: "Praia do Perequê e Itapema",
    andares: [
      "7º",
      "8º",
      "10º",
      "12º",
      "13º",
      "15º",
      "17º",
      "18º",
      "20º",
      "22º",
      "23º",
      "Rooftop",
    ],
  },
  {
    id: "c",
    nome: "Para a baía",
    sub: "Baía de Porto Belo",
    andares: [
      "7º",
      "8º",
      "10º",
      "12º",
      "13º",
      "15º",
      "17º",
      "18º",
      "20º",
      "22º",
      "23º",
      "Rooftop",
    ],
  },
  {
    id: "b",
    nome: "Para os morros",
    sub: "Rio Perequê e Balneário Camboriú",
    andares: [
      "24º",
      "23º",
      "21º",
      "19º",
      "18º",
      "16º",
      "15º",
      "13º",
      "11º",
      "10º",
      "8º",
      "7º",
    ],
    invertido: true,
  },
] as const;

export function VistaAndares() {
  const [d, setD] = useState(0);
  const [ampliada, setAmpliada] = useState(false);
  const dir = DIRECOES[d];
  // posição na escala sempre de baixo (0) para cima (11)
  const [nivel, setNivel] = useState(4);
  const indice = "invertido" in dir && dir.invertido ? 11 - nivel : nivel;
  const andar = dir.andares[indice];
  const src = `/img/flow/vista/${dir.id}-${String(indice).padStart(2, "0")}.jpg`;
  const ordem =
    "invertido" in dir && dir.invertido
      ? [...dir.andares].reverse()
      : [...dir.andares];

  function registrar(nd: number, nn: number) {
    const x = DIRECOES[nd];
    const i = "invertido" in x && x.invertido ? 11 - nn : nn;
    rastrear("gallery_interact", {
      empreendimento: "flow-aptos",
      ambiente: `vista ${x.nome.toLowerCase()} ${x.andares[i]}`,
    });
  }

  return (
    <div className="fl-vista">
      <div className="fl-vista__tela">
        <Image
          key={src}
          src={src}
          alt={`Referência de drone ${dir.nome.toLowerCase()} na altura do ${andar === "Rooftop" ? "rooftop" : andar + " pavimento"} do Flow Aptos`}
          fill
          sizes="(max-width: 1000px) 100vw, 70vw"
        />
        <p className="fl-vista__andar" aria-live="polite">
          {andar === "Rooftop" ? "Rooftop" : andar}
          <small>
            {andar === "Rooftop" ? "The Roof · 24º andar" : "pavimento"}
          </small>
        </p>
      </div>
      <div className="fl-vista__painel">
        <div className="fl-abas" role="group" aria-label="Direção da vista">
          {DIRECOES.map((x, i) => (
            <button
              key={x.id}
              type="button"
              aria-pressed={i === d}
              className="fl-aba"
              onClick={() => {
                setD(i);
                registrar(i, nivel);
              }}
            >
              {x.nome}
              <small>{x.sub}</small>
            </button>
          ))}
        </div>
        <div className="fl-faixa">
          <label htmlFor="fl-andar" className="fl-nota">
            Arraste para subir ou descer
          </label>
          <input
            id="fl-andar"
            type="range"
            min={0}
            max={11}
            step={1}
            value={nivel}
            aria-valuetext={andar}
            onChange={(e) => setNivel(Number(e.target.value))}
            onPointerUp={() => registrar(d, nivel)}
            onKeyUp={() => registrar(d, nivel)}
          />
          <div className="fl-faixa__marcas" aria-hidden="true">
            <span>{ordem[0]}</span>
            <span>{ordem[11]}</span>
          </div>
        </div>
        <div className="fl-andares" aria-label="Escolher andar">
          {ordem.map((a, i) => (
            <button
              key={a + i}
              type="button"
              aria-pressed={i === nivel}
              onClick={() => {
                setNivel(i);
                registrar(d, i);
              }}
            >
              {a === "Rooftop" ? "RT" : a}
            </button>
          ))}
        </div>
        <button
          className="fl-bt fl-bt--linha"
          onClick={() => {
            setAmpliada(true);
            rastrear("gallery_interact", {
              empreendimento: "flow-aptos",
              ambiente: `ampliar drone ${dir.nome} ${andar}`,
            });
          }}
        >
          Ampliar referência de drone
        </button>
        <LinkWhatsApp
          className="fl-bt"
          empreendimento="flow-aptos"
          botao="flow_vista"
          mensagem={`Olá! Estou consultando uma referência de drone do Flow Aptos: direção ${dir.nome}, altura ${andar}. Quero conhecer opções nesta altura, sem presumir disponibilidade ou correspondência com a vista de uma unidade.`}
        >
          Quero conhecer opções nesta altura
        </LinkWhatsApp>
        <p className="fl-nota">
          Imagens reais de drone, como referência de altura e direção. Não
          representam uma janela específica nem garantem vista permanente. A
          vista depende da posição da unidade e do entorno.
        </p>
      </div>
      {ampliada && (
        <VisorFlow
          foto={{
            src,
            alt: `Referência de drone: ${dir.nome}, ${andar}`,
            titulo: `${dir.nome} · ${andar}`,
            legenda:
              "Referência de drone. A vista depende da posição da unidade e do entorno; sem garantia de vista permanente ou de disponibilidade.",
          }}
          fechar={() => setAmpliada(false)}
        />
      )}
    </div>
  );
}
