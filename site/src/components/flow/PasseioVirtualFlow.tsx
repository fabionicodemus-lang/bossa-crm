"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { rastrear } from "@/lib/rastreio";

const PASSEIO_URL =
  "https://flow-coworking-bossa-piloto.fabio-nicodemus.chatgpt.site/";

/** A página continua leve: os modelos 3D só são carregados ao abrir o modal. */
export function PasseioVirtualFlow() {
  const [aberto, setAberto] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const focoAnterior = document.activeElement as HTMLElement | null;
    const overflowAnterior = document.body.style.overflow;
    dialog.current?.showModal();
    document.body.style.overflow = "hidden";
    window.dispatchEvent(new Event("flow:modal"));
    return () => {
      document.body.style.overflow = overflowAnterior;
      focoAnterior?.focus();
      window.dispatchEvent(new Event("flow:modal"));
    };
  }, [aberto]);

  function registrar(origem: string) {
    rastrear("gallery_interact", {
      empreendimento: "flow-aptos",
      ambiente: `Passeio virtual 3D · ${origem}`,
    });
  }

  return (
    <section
      id="passeio-virtual-flow"
      className="fl-vr"
      aria-labelledby="fl-vr-titulo"
    >
      <div className="fl-vr-capa">
        <Image
          src="/img/flow/playground.jpg"
          alt="Perspectiva ilustrativa do playground e espaço zen do Flow Move"
          fill
          sizes="(max-width: 860px) 100vw, 48vw"
        />
        <span className="fl-vr-etiqueta">VISITA INTERATIVA · 3D</span>
      </div>

      <div className="fl-vr-conteudo">
        <p className="fl-rot">CONHEÇA O FLOW POR DENTRO</p>
        <h3 id="fl-vr-titulo">Entre. Explore. Imagine seu dia aqui.</h3>
        <p>
          Caminhe pelo coworking, sala de reunião, academia, Flow Store,
          lavanderia, playground, espaço zen e Cine Flow. Você escolhe o caminho,
          muda o olhar e descobre como os ambientes se conectam.
        </p>
        <div className="fl-vr-acoes">
          <button
            type="button"
            className="fl-bt fl-vr-no-site"
            onClick={() => {
              registrar("na página");
              setAberto(true);
            }}
          >
            Iniciar passeio virtual <span aria-hidden="true">↗</span>
          </button>
          <a
            className="fl-bt fl-vr-no-celular"
            href={PASSEIO_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => registrar("celular")}
          >
            Iniciar passeio virtual <span aria-hidden="true">↗</span>
          </a>
          <a
            className="fl-vr-link-direto"
            href={PASSEIO_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => registrar("nova aba")}
          >
            Abrir em outra aba ↗
          </a>
        </div>
        <p className="fl-vr-instrucao">
          No celular, use os dois direcionais na tela. Para usar óculos VR e
          manete Bluetooth, abra o passeio diretamente no telefone.
        </p>
        <p className="fl-vr-aviso">
          Passeio digital ilustrativo, em evolução. Materiais, mobiliário e
          vistas podem variar em relação ao projeto executivo e ao memorial
          descritivo.
        </p>
      </div>

      {aberto && (
        <dialog
          ref={dialog}
          className="fl-vr-dialog"
          aria-labelledby="fl-vr-dialog-titulo"
          aria-describedby="fl-vr-dialog-ajuda"
          onCancel={(evento) => {
            evento.preventDefault();
            setAberto(false);
          }}
        >
          <div className="fl-vr-dialog-topo">
            <div>
              <span>FLOW MOVE · PASSEIO VIRTUAL</span>
              <h2 id="fl-vr-dialog-titulo">Explore o Flow em 3D</h2>
            </div>
            <div className="fl-vr-dialog-acoes">
              <a
                href={PASSEIO_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => registrar("nova aba pelo modal")}
              >
                Abrir em outra aba ↗
              </a>
              <button
                type="button"
                autoFocus
                onClick={() => setAberto(false)}
                aria-label="Fechar o passeio virtual"
              >
                Fechar ×
              </button>
            </div>
          </div>
          <p id="fl-vr-dialog-ajuda" className="fl-vr-dialog-ajuda">
            Para tela cheia ou óculos VR, use o menu dentro do passeio. Se não
            carregar aqui, abra em outra aba.
          </p>
          <iframe
            className="fl-vr-iframe"
            title="Passeio virtual interativo pelas áreas comuns do Flow"
            src={PASSEIO_URL}
            allow="accelerometer; gyroscope; magnetometer; gamepad; fullscreen; xr-spatial-tracking"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </dialog>
      )}
    </section>
  );
}
