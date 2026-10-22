"use client";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Evento } from "@/lib/eventos";
import { rastrear } from "@/lib/rastreio";
export type FotoFlow = {
  src: string;
  alt: string;
  titulo: string;
  legenda?: string;
};
/** Um segundo de exposição real; painéis altos usam a altura útil da tela. */
export function useExposicaoFlow(
  evento: Evento,
  chave: string,
  detalhe: Record<string, string | number>,
  vistos?: Set<string>,
) {
  const ref = useRef<HTMLDivElement>(null),
    locais = useRef(new Set<string>()),
    dados = useRef(detalhe);
  dados.current = detalhe;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const contados = vistos || locais.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancelar = () => {
      clearTimeout(timer);
      timer = undefined;
    };
    const conferir = () => {
      const r = el.getBoundingClientRect(),
        nav = document.querySelector(".fl-nav")?.getBoundingClientRect(),
        barra = document.querySelector(".fl-barra")?.getBoundingClientRect();
      const topo = Math.max(73, nav?.bottom || 0),
        fim = Math.min(
          innerHeight,
          barra && barra.height > 0 ? barra.top : innerHeight,
        );
      const visivel =
        !document.hidden &&
        !document.querySelector("dialog[open]") &&
        r.width > 0 &&
        Math.min(r.bottom, fim) - Math.max(r.top, topo) >=
          Math.min(r.height, fim - topo) * 0.5 &&
        Math.min(r.right, innerWidth) - Math.max(r.left, 0) >= r.width * 0.5;
      if (!visivel || contados.has(chave)) {
        cancelar();
        return;
      }
      if (!timer)
        timer = setTimeout(() => {
          if (
            document.querySelector(
              "dialog[open], .fl-nav[data-aberto=true], .cabecalho__abrir[aria-expanded=true]",
            ) ||
            document.hidden
          ) {
            cancelar();
            return;
          }
          contados.add(chave);
          rastrear(evento, dados.current);
        }, 1000);
    };
    const ro = new ResizeObserver(conferir);
    ro.observe(el);
    addEventListener("scroll", conferir, { passive: true });
    addEventListener("resize", conferir);
    document.addEventListener("visibilitychange", conferir);
    addEventListener("flow:modal", conferir);
    addEventListener("flow:menu", conferir);
    conferir();
    return () => {
      cancelar();
      ro.disconnect();
      removeEventListener("scroll", conferir);
      removeEventListener("resize", conferir);
      document.removeEventListener("visibilitychange", conferir);
      removeEventListener("flow:modal", conferir);
      removeEventListener("flow:menu", conferir);
    };
  }, [evento, chave, vistos]);
  return ref;
}
export function ExposicaoFlow({
  evento,
  children,
}: {
  evento: Evento;
  children: ReactNode;
}) {
  const ref = useExposicaoFlow(evento, evento, {
    empreendimento: "flow-aptos",
  });
  return <div ref={ref}>{children}</div>;
}
export function VisorFlow({
  foto,
  fechar,
}: {
  foto: FotoFlow;
  fechar: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    viewport = useRef<HTMLDivElement>(null),
    [zoom, setZoom] = useState(1),
    pontos = useRef(new Map<number, { x: number; y: number }>()),
    gesto = useRef({ distancia: 0, zoom: 1, x: 0, y: 0, left: 0, top: 0 });
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow;
    dialog.current?.showModal();
    document.body.style.overflow = "hidden";
    window.dispatchEvent(new Event("flow:modal"));
    return () => {
      document.body.style.overflow = overflow;
      anterior?.focus();
      window.dispatchEvent(new Event("flow:modal"));
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="fl-visor"
      aria-labelledby="fl-visor-titulo"
      aria-describedby="fl-visor-legenda"
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const itens = dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),[tabindex="0"]',
        );
        if (!itens?.length) return;
        const primeiro = itens[0],
          ultimo = itens[itens.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primeiro.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        fechar();
      }}
    >
      <div className="fl-visor-topo">
        <h2 id="fl-visor-titulo">{foto.titulo}</h2>
        <button autoFocus onClick={fechar}>
          Fechar ×
        </button>
      </div>
      <p id="fl-visor-legenda">
        {foto.legenda || "Perspectiva ilustrativa do projeto."}
      </p>
      <div className="fl-visor-controles">
        <button
          disabled={zoom <= 1}
          onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
        >
          Reduzir −
        </button>
        <output aria-live="polite">{Math.round(zoom * 100)}%</output>
        <button
          disabled={zoom >= 4}
          onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
        >
          Aproximar +
        </button>
        <button onClick={() => setZoom(1)}>Ajustar</button>
      </div>
      <p className="fl-visor-ajuda">
        Use os controles ou dois dedos para ampliar. Arraste a imagem para ler;
        no teclado, use as setas.
      </p>
      <div
        ref={viewport}
        className="fl-visor-imagem"
        tabIndex={0}
        aria-label="Imagem ampliada; arraste ou use as setas para mover"
        onDoubleClick={() => setZoom((z) => (z === 1 ? 2 : 1))}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pontos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const ps = [...pontos.current.values()];
          gesto.current = {
            distancia:
              ps.length === 2
                ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y)
                : 0,
            zoom,
            x: e.clientX,
            y: e.clientY,
            left: e.currentTarget.scrollLeft,
            top: e.currentTarget.scrollTop,
          };
        }}
        onPointerMove={(e) => {
          if (!pontos.current.has(e.pointerId)) return;
          pontos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const ps = [...pontos.current.values()];
          if (ps.length === 2 && gesto.current.distancia) {
            const dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
            setZoom(
              Math.min(
                4,
                Math.max(
                  1,
                  (gesto.current.zoom * dist) / gesto.current.distancia,
                ),
              ),
            );
          } else if (ps.length === 1) {
            e.currentTarget.scrollLeft =
              gesto.current.left + gesto.current.x - e.clientX;
            e.currentTarget.scrollTop =
              gesto.current.top + gesto.current.y - e.clientY;
          }
        }}
        onPointerUp={(e) => {
          pontos.current.delete(e.pointerId);
          const restante = [...pontos.current.values()][0];
          if (restante)
            gesto.current = {
              distancia: 0,
              zoom,
              x: restante.x,
              y: restante.y,
              left: e.currentTarget.scrollLeft,
              top: e.currentTarget.scrollTop,
            };
        }}
        onPointerCancel={() => pontos.current.clear()}
      >
        <div
          style={{
            width: `${zoom * 100}%`,
            height: `${zoom * 100}%`,
            minHeight: "100%",
            position: "relative",
          }}
        >
          <Image
            src={foto.src}
            alt={foto.alt}
            fill
            sizes={`${Math.min(zoom * 100, 200)}vw`}
            style={{ objectFit: "contain", pointerEvents: "none" }}
            draggable={false}
          />
        </div>
      </div>
    </dialog>
  );
}
export function FotoFlow(
  props: FotoFlow & { inteira?: boolean; sizes?: string },
) {
  const [aberta, setAberta] = useState(false);
  return (
    <figure className="fl-figura">
      <button
        type="button"
        className={`fl-foto fl-imagem ${props.inteira ? "fl-imagem-inteira" : ""}`}
        aria-label={`Ampliar: ${props.titulo}`}
        onClick={() => {
          setAberta(true);
          rastrear("gallery_interact", {
            empreendimento: "flow-aptos",
            ambiente: props.titulo,
          });
        }}
      >
        <Image
          src={props.src}
          alt={props.alt}
          fill
          sizes={props.sizes || "(max-width:760px) 100vw, 50vw"}
        />
      </button>
      <figcaption>
        <b>{props.titulo}</b>
        <span>{props.legenda || "Perspectiva ilustrativa."}</span>
      </figcaption>
      {aberta && <VisorFlow foto={props} fechar={() => setAberta(false)} />}
    </figure>
  );
}
