"use client";
import { useEffect, useRef, useState } from "react";
import { VideoVertical } from "./Clientes";
const duracoes: Record<string, string> = {
  "fabio-bloco-celular": "2:07",
  "demonstracao-acustica-celucon": "0:35",
  "celucon-na-obra": "0:58",
  "fabio-manta-acustica": "0:41",
  "unidade-1601": "1:49",
  "obra-flow": "1:22",
  "depoimento-augusto": "1:30",
  "depoimento-natalia": "0:58",
};
export function VideoFlowModal(props: Parameters<typeof VideoVertical>[0]) {
  const [aberto, setAberto] = useState(false),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!aberto) return;
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
  }, [aberto]);
  return (
    <>
      <button
        className="fl-video-cartao"
        onClick={() => setAberto(true)}
        aria-label={`Abrir vídeo: ${props.nome}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={props.poster}
          alt=""
          loading="lazy"
          width="540"
          height="960"
        />
        <span>
          <b>{props.nome}</b>
          <small>{props.legenda}</small>
          <span>Assistir ao vídeo · {duracoes[props.video]} ↗</span>
        </span>
      </button>
      {aberto && (
        <dialog
          ref={dialog}
          className="fl-video-modal"
          aria-label={props.nome}
          onCancel={(e) => {
            e.preventDefault();
            setAberto(false);
          }}
        >
          <button
            className="fl-video-fechar"
            autoFocus
            onClick={() => setAberto(false)}
          >
            Fechar ×
          </button>
          <VideoVertical {...props} iniciar />
        </dialog>
      )}
    </>
  );
}
