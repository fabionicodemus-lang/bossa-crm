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

export function VistaAndares({
  onContexto,
}: {
  onContexto?: (s: string) => void;
}) {
  const [d, setD] = useState(0),
    [altura, setAltura] = useState(13),
    [aviso, setAviso] = useState("");
  const [ampliada, setAmpliada] = useState(false),
    [comparar, setComparar] = useState(false),
    [segunda, setSegunda] = useState(7);
  const dir = DIRECOES[d];
  const numero = (a: string) => (a === "Rooftop" ? 24 : parseInt(a));
  const ordem = [...dir.andares].map(numero).sort((a, b) => a - b);
  const nome = (n: number) => (n === 24 ? "24º · Rooftop" : `${n}º`);
  const fonte = (n: number) =>
    `/img/flow/vista/${dir.id}-${String(dir.andares.findIndex((a) => numero(a) === n)).padStart(2, "0")}.jpg`;
  const src = fonte(altura),
    andar = nome(altura),
    nivel = ordem.indexOf(altura);
  const proximo = (andares: readonly string[], n: number) =>
    andares
      .map(numero)
      .sort((a, b) => Math.abs(a - n) - Math.abs(b - n) || a - b)[0];
  function registrar(nd: number, n: number) {
    const direcao = DIRECOES[nd];
    onContexto?.(
      `Estou consultando uma referência real de drone ${direcao.nome.toLowerCase()}, na altura do ${nome(n)} pavimento.`,
    );
    rastrear("gallery_interact", {
      empreendimento: "flow-aptos",
      ambiente: `vista ${direcao.nome.toLowerCase()} ${nome(n)}`,
    });
  }
  function selecionar(n: number) {
    setAltura(n);
    setAviso("");
    registrar(d, n);
  }
  return (
    <div className="fl-vistas-editorial">
      <div className="fl-vista">
        <div className="fl-vista__tela">
          <Image
            src={src}
            alt={`Referência real de drone ${dir.nome.toLowerCase()}, ${andar} pavimento do Flow Aptos`}
            fill
            sizes="(max-width:1000px) 100vw, 70vw"
          />
          <p className="fl-vista__andar" aria-live="polite">
            {andar}
            <small>Referência real de drone</small>
          </p>
        </div>
        <div className="fl-vista__painel">
          <div className="fl-abas" role="group" aria-label="Direção da vista">
            {DIRECOES.map((x, i) => (
              <button
                key={x.id}
                className="fl-aba"
                aria-pressed={i === d}
                onClick={() => {
                  const n = proximo(x.andares, altura);
                  setD(i);
                  setAltura(n);
                  setSegunda(proximo(x.andares, segunda));
                  setAviso(
                    n === altura
                      ? ""
                      : `Não há foto do ${altura}º ${x.nome.toLowerCase()}. Exibindo o ${n}º.`,
                  );
                  registrar(i, n);
                }}
              >
                {x.nome}
                <small>{x.sub}</small>
              </button>
            ))}
          </div>
          <p role="status" className="fl-vista-aviso">
            {aviso}
          </p>
          <div className="fl-faixa">
            <label htmlFor="fl-andar">Escolher altura · {andar}</label>
            <input
              id="fl-andar"
              type="range"
              min={0}
              max={ordem.length - 1}
              step={1}
              value={nivel}
              aria-valuetext={andar}
              onChange={(e) => selecionar(ordem[Number(e.target.value)])}
            />
          </div>
          <div className="fl-andares" role="group" aria-label="Escolher andar">
            {ordem.map((n) => (
              <button
                key={n}
                aria-pressed={n === altura}
                onClick={() => selecionar(n)}
              >
                {n === 24 ? "RT" : `${n}º`}
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
          <button
            className="fl-bt fl-bt--linha"
            aria-expanded={comparar}
            aria-controls="fl-comparar-alturas"
            onClick={() => setComparar(!comparar)}
          >
            Comparar duas alturas
          </button>
        </div>
      </div>
      {comparar && (
        <div id="fl-comparar-alturas" className="fl-comparar-alturas">
          <label>
            Comparar {andar} com{" "}
            <select
              value={segunda}
              onChange={(e) => setSegunda(Number(e.target.value))}
            >
              {ordem.map((n) => (
                <option key={n} value={n}>
                  {nome(n)}
                </option>
              ))}
            </select>
          </label>
          <div>
            {[altura, segunda].map((n, i) => (
              <figure key={i}>
                <div className="fl-comparar-foto">
                  <Image
                    src={fonte(n)}
                    alt={`Comparação: referência real de drone ${dir.nome.toLowerCase()}, ${nome(n)} pavimento`}
                    fill
                    sizes="(max-width:860px) 100vw, 50vw"
                  />
                </div>
                <figcaption>
                  {dir.nome} · {nome(n)} pavimento
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
      <div className="fl-vista-rodape">
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
            alt: `Referência real de drone: ${dir.nome}, ${andar}`,
            titulo: `${dir.nome} · ${andar}`,
            legenda:
              "Referência real de drone. A vista depende da posição da unidade e do entorno; sem garantia de vista permanente ou de disponibilidade.",
          }}
          fechar={() => setAmpliada(false)}
        />
      )}
    </div>
  );
}
