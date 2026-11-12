"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { rastrear } from "@/lib/rastreio";

const PASSEIO_URL =
  "https://alma-passeio-virtual.fabio-nicodemus.chatgpt.site/";

/** Os modelos 3D só são carregados quando o visitante inicia o passeio. */
export function PasseioVirtualAlma() {
  const [aberto, setAberto] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!aberto) return;
    const overflowAnterior = document.body.style.overflow;
    if (!dialog.current?.open) dialog.current?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflowAnterior;
      focoAnterior.current?.focus({ preventScroll: true });
    };
  }, [aberto]);

  function registrar(origem: string) {
    try {
      rastrear("gallery_interact", {
        empreendimento: "alma-seahouses",
        ambiente: `Passeio virtual 3D · ${origem}`,
      });
    } catch {
      // Uma falha no rastreio não deve impedir o acesso ao passeio.
    }
  }

  function fechar() {
    // Notifica também o observador que oculta a barra fixa da página.
    dialog.current?.close();
    setAberto(false);
  }

  return (
    <section
      id="passeio-virtual-alma"
      className="al-vr"
      aria-labelledby="al-vr-titulo"
    >
      <div className="al-vr-capa">
        <Image
          src="/img/alma/piscina.jpg"
          alt="Perspectiva ilustrativa da piscina e dos jardins do Alma Seahouses"
          fill
          sizes="(max-width: 860px) 100vw, 48vw"
        />
        <span className="al-vr-etiqueta">DOIS PAVIMENTOS · PASSEIO 3D</span>
      </div>

      <div className="al-vr-conteudo">
        <p className="al-rot">CONHEÇA O ALMA POR DENTRO</p>
        <h3 id="al-vr-titulo">Entre no Alma. Explore no seu ritmo.</h3>
        <p>
          Conheça a piscina, a academia, a casa de banho, a sauna e os jardins.
          Pelo elevador virtual, visite também o rooftop, com salão de festas,
          pub, brinquedoteca e espaços de convivência. Você escolhe o caminho
          pelos dois pavimentos.
        </p>
        <div className="al-vr-acoes">
          <button
            type="button"
            className="al-bt al-vr-no-site"
            aria-haspopup="dialog"
            aria-controls={aberto ? "al-vr-dialog" : undefined}
            onClick={(evento) => {
              focoAnterior.current = evento.currentTarget;
              registrar("na página");
              setAberto(true);
            }}
          >
            Iniciar passeio virtual <span aria-hidden="true">↗</span>
          </button>
          <a
            className="al-bt al-vr-no-celular"
            href={PASSEIO_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => registrar("celular")}
          >
            Iniciar passeio virtual <span aria-hidden="true">↗</span>
            <span className="sr-only"> (abre em outra aba)</span>
          </a>
          <a
            className="al-vr-link-direto"
            href={PASSEIO_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => registrar("nova aba")}
          >
            Abrir em outra aba ↗
          </a>
        </div>
        <p className="al-vr-instrucao">
          No celular, use os direcionais na tela. Para acessar em tela cheia ou
          usar o modo VR, abra o passeio em outra aba.
        </p>
        <p className="al-vr-aviso">
          Passeio digital ilustrativo, em evolução. Materiais, mobiliário,
          entorno e vistas são representações e podem variar em relação ao
          projeto executivo, ao memorial descritivo e à vista real.
        </p>
      </div>

      {aberto && (
        <dialog
          id="al-vr-dialog"
          ref={dialog}
          className="al-vr-dialog"
          aria-labelledby="al-vr-dialog-titulo"
          aria-describedby="al-vr-dialog-ajuda"
          onCancel={(evento) => {
            evento.preventDefault();
            fechar();
          }}
          onClose={() => setAberto(false)}
        >
          <div className="al-vr-dialog-topo">
            <div>
              <span>ALMA SEAHOUSES · PASSEIO VIRTUAL</span>
              <h2 id="al-vr-dialog-titulo">Explore os dois pavimentos em 3D</h2>
            </div>
            <div className="al-vr-dialog-acoes">
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
                onClick={fechar}
                aria-label="Fechar o passeio virtual"
              >
                Fechar ×
              </button>
            </div>
          </div>
          <p id="al-vr-dialog-ajuda" className="al-vr-dialog-ajuda">
            Use o elevador dentro do passeio para trocar de pavimento. Se não
            carregar aqui, abra em outra aba.
          </p>
          <iframe
            className="al-vr-iframe"
            title="Passeio virtual interativo pelos dois pavimentos de lazer do Alma Seahouses"
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
