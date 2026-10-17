"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type Foto = { src: string; alt: string; legenda?: string };

/** Visualizador em tela cheia, com teclado (setas, Esc) e foco preso. */
export function Visor({ fotos, inicio, aoFechar, aoTrocar }: { fotos: Foto[]; inicio: number; aoFechar: () => void; aoTrocar?: (i: number) => void }) {
  const [i, setI] = useState(inicio);
  const fechar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    fechar.current?.focus();
    document.body.style.overflow = "hidden";
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
      if (e.key === "ArrowRight") ir(1);
      if (e.key === "ArrowLeft") ir(-1);
    };
    addEventListener("keydown", k);
    return () => { removeEventListener("keydown", k); document.body.style.overflow = ""; anterior?.focus(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function ir(d: number) { setI((x) => { const n = (x + d + fotos.length) % fotos.length; aoTrocar?.(n); return n; }); }
  const f = fotos[i];
  return (
    <div className="visor" role="dialog" aria-modal="true" aria-label="Imagens ampliadas">
      <div className="visor__topo"><span className="mono" style={{ fontSize: 13 }}>{i + 1} / {fotos.length}</span><button ref={fechar} onClick={aoFechar}>Fechar</button></div>
      <div className="visor__img"><Image src={f.src} alt={f.alt} fill sizes="100vw" style={{ objectFit: "contain" }} /></div>
      <div className="visor__base">
        <span style={{ fontSize: 14 }}>{f.legenda ?? f.alt}</span>
        {fotos.length > 1 && <span className="linha-acoes"><button onClick={() => ir(-1)} aria-label="Anterior">←</button><button onClick={() => ir(1)} aria-label="Próxima">→</button></span>}
      </div>
    </div>
  );
}
