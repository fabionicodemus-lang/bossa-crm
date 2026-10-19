"use client";
import { useEffect, useRef, useState } from "react";
import { rastrear } from "@/lib/rastreio";

/** Vídeo de abertura em loop, sem som. Para quem prefere menos movimento, fica parado no primeiro quadro. */
export function VideoAbertura({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [tocando, setTocando] = useState(true);
  useEffect(() => {
    const v = ref.current; if (!v) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { v.pause(); setTocando(false); return; }
    v.play().catch(() => setTocando(false));
  }, []);
  function alternar() {
    const v = ref.current; if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setTocando(true); } else { v.pause(); setTocando(false); }
  }
  return (
    <>
      <div className="fl-abertura__midia" aria-hidden="true">
        <video ref={ref} src={src} poster={poster} muted loop playsInline preload="auto" />
      </div>
      <button type="button" className="fl-pausa" onClick={alternar} aria-label={tocando ? "Pausar vídeo de fundo" : "Tocar vídeo de fundo"}>
        {tocando ? <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="1" width="3" height="12" fill="currentColor" /><rect x="9" y="1" width="3" height="12" fill="currentColor" /></svg>
          : <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1l10 6-10 6z" fill="currentColor" /></svg>}
      </button>
    </>
  );
}

/** Vídeo vertical (depoimentos, unidade 1001, obra): só carrega quando a pessoa toca. */
export function VideoVertical({ src, poster, nome, legenda, video }: { src: string; poster: string; nome: string; legenda: string; video: string }) {
  const [ativo, setAtivo] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ativo) ref.current?.play().catch(() => {}); }, [ativo]);
  return (
    <div className="fl-vv">
      {ativo ? (
        <video ref={ref} src={src} poster={poster} controls playsInline preload="auto" onPlay={() => rastrear("video_play", { video, empreendimento: "flow-aptos" })} />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={poster} alt="" loading="lazy" />
          <button type="button" className="fl-vv__play" onClick={() => setAtivo(true)} aria-label={`Assistir: ${nome}, ${legenda}`}>
            <span className="fl-vv__icone"><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3l11 7-11 7z" fill="currentColor" /></svg></span>
            <span className="fl-vv__nome"><b>{nome}</b><small>{legenda}</small></span>
          </button>
        </>
      )}
    </div>
  );
}

/** Meses até a entrega das chaves, calculado no aparelho de quem visita (a página é estática). */
export function MesesAteEntrega({ entregaIso, inicial }: { entregaIso: string; inicial: number }) {
  const [m, setM] = useState(inicial);
  useEffect(() => {
    const [a, mes] = entregaIso.split("-").map(Number);
    const h = new Date();
    setM(Math.max(0, (a - h.getFullYear()) * 12 + (mes - 1 - h.getMonth())));
  }, [entregaIso]);
  return <>{m}</>;
}

/** Liga a animação de "surgir ao rolar" só quando há JavaScript. */
export function Surgir() {
  useEffect(() => {
    const raiz = document.querySelector(".fl"); if (!raiz) return;
    raiz.classList.add("fl-js");
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("fl-visto"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -10% 0px" });
    raiz.querySelectorAll(".fl-surge").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
