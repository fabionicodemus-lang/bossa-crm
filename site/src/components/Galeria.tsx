"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import type { Foto } from "@/content/empreendimentos";
import { rastrear } from "@/lib/rastreio";
import { Visor } from "./Visor";

export function Galeria({ fotos, empreendimento, limite = 7 }: { fotos: Foto[]; empreendimento: string; limite?: number }) {
  const [aberta, setAberta] = useState<number | null>(null);
  const vistas = useRef(new Set<number>());
  function marcar(i: number) {
    vistas.current.add(i);
    rastrear("gallery_interact", { empreendimento, ambiente: fotos[i].legenda ?? "", quantidade: vistas.current.size });
  }
  return (
    <>
      <div className="galeria">
        {fotos.slice(0, limite).map((f, i) => (
          <button key={f.src} type="button" onClick={() => { setAberta(i); marcar(i); }} aria-label={`Ampliar: ${f.legenda ?? f.alt}`}>
            <Image src={f.src} alt={f.alt} fill sizes={i === 0 ? "(max-width: 860px) 100vw, 66vw" : "(max-width: 860px) 50vw, 33vw"} />
          </button>
        ))}
      </div>
      {fotos.length > limite && (
        <button className="botao botao--texto" style={{ marginTop: 16 }} onClick={() => { setAberta(limite); marcar(limite); }}>Ver todas as {fotos.length} imagens</button>
      )}
      {aberta !== null && <Visor fotos={fotos} inicio={aberta} aoFechar={() => setAberta(null)} aoTrocar={marcar} />}
    </>
  );
}
