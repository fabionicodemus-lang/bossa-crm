"use client";
import { useState } from "react";
import { FotoFlow } from "./Experiencia";
import { rastrear } from "@/lib/rastreio";
const ambientes = [
  ["fitness", "Fitness", "Cuidar de você"],
  ["coworking", "Coworking e sala de reuniões", "Trabalhar e se encontrar"],
  ["flow-store", "Flow Store", "Conveniência no edifício"],
  ["playground", "Playground e espaço zen", "Brincar e pausar"],
  ["cine-flow", "Cine Flow", "Aproveitar o tempo livre"],
];
export function GaleriaMove() {
  const [atual, setAtual] = useState(0);
  const [src, nome, uso] = ambientes[atual];
  return (
    <div className="fl-move-editorial">
      <FotoFlow
        key={src}
        sizes="(max-width:1000px) 100vw, 66vw"
        src={`/img/flow/${src}.jpg`}
        alt={`Perspectiva ilustrativa: ${nome}, Flow Move, 5º pavimento`}
        titulo={nome}
      />
      <div className="fl-pilha">
        <p className="fl-lead" aria-live="polite">
          {uso}
        </p>
        <div
          className="fl-move-escolhas"
          role="group"
          aria-label="Ambientes do Flow Move"
        >
          {ambientes.map(([s, n, u], i) => (
            <button
              key={s}
              aria-pressed={i === atual}
              onClick={() => {
                setAtual(i);
                rastrear("gallery_interact", {
                  empreendimento: "flow-aptos",
                  ambiente: n,
                });
              }}
            >
              <span>{n}</span>
              <small>{u}</small>
              <span aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
