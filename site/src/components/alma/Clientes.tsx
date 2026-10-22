"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { rastrear } from "@/lib/rastreio";

export function VideoAbertura({
  src,
  poster,
}: {
  src: string;
  poster: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [tocando, setTocando] = useState(true);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      v.pause();
      setTocando(false);
      return;
    }
    v.play().catch(() => setTocando(false));
  }, []);
  function alternar() {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => setTocando(false));
    } else {
      v.pause();
      setTocando(false);
    }
  }
  return (
    <>
      <div className="al-abertura__midia" aria-hidden="true">
        <video
          ref={ref}
          src={src}
          poster={poster}
          muted
          loop
          playsInline
          preload="none"
          onPlay={() => setTocando(true)}
          onPause={() => setTocando(false)}
          onError={() => setTocando(false)}
        />
      </div>
      <button
        type="button"
        className="al-pausa"
        onClick={alternar}
        aria-label={tocando ? "Pausar animação" : "Reproduzir animação"}
      >
        {tocando ? (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <rect x="2" y="1" width="3" height="12" fill="currentColor" />
            <rect x="9" y="1" width="3" height="12" fill="currentColor" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 1l10 6-10 6z" fill="currentColor" />
          </svg>
        )}
      </button>
    </>
  );
}

/** Vídeo curto em loop, sem som, que só toca quando aparece na tela. */
export function VideoLoop({
  src,
  poster,
  rotulo,
}: {
  src: string;
  poster: string;
  rotulo: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.3 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      aria-label={rotulo}
    />
  );
}

export function VideoVertical({
  src,
  poster,
  nome,
  legenda,
  video,
}: {
  src: string;
  poster: string;
  nome: string;
  legenda: string;
  video: string;
}) {
  const [ativo, setAtivo] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ativo) ref.current?.play().catch(() => {});
  }, [ativo]);
  return (
    <div className="al-vv">
      {ativo ? (
        <video
          ref={ref}
          src={src}
          poster={poster}
          controls
          playsInline
          preload="auto"
          onPlay={() =>
            rastrear("video_play", { video, empreendimento: "alma-seahouses" })
          }
        />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={poster} alt="" loading="lazy" />
          <button
            type="button"
            className="al-vv__play"
            onClick={() => setAtivo(true)}
            aria-label={`Assistir: ${nome}, ${legenda}`}
          >
            <span className="al-vv__icone">
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path d="M6 3l11 7-11 7z" fill="currentColor" />
              </svg>
            </span>
            <span className="al-vv__nome">
              <b>{nome}</b>
              <small>{legenda}</small>
            </span>
          </button>
        </>
      )}
    </div>
  );
}

export function Surgir() {
  useEffect(() => {
    const raiz = document.querySelector(".al");
    if (!raiz) return;
    raiz.classList.add("al-js");
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("al-visto");
            io.unobserve(e.target);
          }
        }),
      { rootMargin: "0px 0px -10% 0px" },
    );
    raiz.querySelectorAll(".al-surge").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}

// Quadros do vídeo "Vistas do Alma" (drone no terreno), ampliados.
const ALTURAS: [string, string][] = [
  ["Lazer", "12,6"],
  ["6º", "17,6"],
  ["7º", "20,9"],
  ["8º", "24,1"],
  ["10º", "30,6"],
  ["11º", "33,8"],
  ["12º", "37,1"],
  ["14º", "43,6"],
  ["15º", "46,8"],
  ["16º", "50,0"],
  ["18º", "56,5"],
  ["19º", "59,8"],
  ["20º", "63,0"],
  ["21º", "66,2"],
  ["23º", "72,7"],
  ["24º", "76,0"],
  ["25º", "79,2"],
  ["27º", "85,7"],
  ["28º", "88,9"],
  ["29º", "94,3"],
  ["Rooftop", "102,0"],
];

export function VistaAlma() {
  const [i, setI] = useState(13);
  const [andar, metros] = ALTURAS[i];
  const src = `/img/alma/vista/v-${String(i).padStart(2, "0")}.jpg`;
  const registrar = (n: number) =>
    rastrear("gallery_interact", {
      empreendimento: "alma-seahouses",
      ambiente: `vista ${ALTURAS[n][0]}`,
    });
  return (
    <div className="al-vista">
      <div className="al-vista__tela">
        <Image
          key={src}
          src={src}
          alt={`Registro de drone do entorno do Alma associado à referência ${andar} e ${metros} m no projeto.`}
          fill
          sizes="(max-width: 1000px) 100vw, 75vw"
        />
      </div>
      <div className="al-vista__painel">
        <div className="al-altura" aria-live="polite">
          <b>{metros} m</b>
          <span>
            Referência do projeto: {andar} · {metros} m
          </span>
        </div>
        <div className="al-regua">
          <input
            type="range"
            min={0}
            max={ALTURAS.length - 1}
            value={i}
            aria-label="Referência de altura"
            aria-valuetext={`${metros} metros, ${andar}`}
            onChange={(e) => setI(Number(e.target.value))}
            onPointerUp={() => registrar(i)}
            onKeyUp={() => registrar(i)}
          />
          <div className="al-acoes">
            <button
              type="button"
              onClick={() => {
                setI(Math.max(0, i - 1));
                registrar(Math.max(0, i - 1));
              }}
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => {
                setI(Math.min(20, i + 1));
                registrar(Math.min(20, i + 1));
              }}
            >
              Próximo
            </button>
          </div>
          <div className="al-regua__marcas" aria-hidden="true">
            <span>Rooftop</span>
            <span>Lazer</span>
          </div>
        </div>
        <p className="al-nota">
          Registros de drone. A posição de captura pode diferir da posição do
          apartamento. As imagens não garantem vista permanente nem vista
          idêntica em todas as unidades.
        </p>
      </div>
    </div>
  );
}
