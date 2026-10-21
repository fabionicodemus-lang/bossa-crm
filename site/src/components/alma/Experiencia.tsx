"use client";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Empreendimento, Planta } from "@/content/empreendimentos";
import {
  avisoDuplex,
  avisoTipo,
  descricaoPlanta,
  mensagemPlanta,
  midiasAlma,
  midiasAprovadasAlma,
  plantaAlt,
  tituloPlanta,
} from "@/content/alma";
import { rastrear } from "@/lib/rastreio";
import type { Evento } from "@/lib/eventos";
import { LinkWhatsApp } from "../LinkWhatsApp";

/** Mede o conteúdo central, por um segundo contínuo, apenas com a aba ativa.
 * Quadros maiores que a tela usam a menor altura útil (sem exigir 50% do quadro enorme). */
export function useExposicao(
  evento: Evento,
  chave: string,
  detalhe: Record<string, string | number>,
  vistos?: Set<string>,
) {
  const ref = useRef<HTMLDivElement>(null);
  const locais = useRef(new Set<string>());
  const dados = useRef(detalhe);
  dados.current = detalhe;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const contados = vistos ?? locais.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancelar = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };
    const visivel = () => {
      const r = el.getBoundingClientRect();
      const alturaUtil = Math.max(0, innerHeight - 180);
      const h = Math.max(
        0,
        Math.min(r.bottom, innerHeight - 70) - Math.max(r.top, 110),
      );
      const w = Math.max(
        0,
        Math.min(r.right, innerWidth) - Math.max(r.left, 0),
      );
      return (
        document.visibilityState === "visible" &&
        r.height > 0 &&
        h >= Math.min(r.height, alturaUtil) / 2 &&
        w >= r.width / 2
      );
    };
    const conferir = () => {
      if (contados.has(chave) || !visivel()) {
        cancelar();
        return;
      }
      if (!timer)
        timer = setTimeout(() => {
          timer = undefined;
          if (visivel() && !contados.has(chave)) {
            contados.add(chave);
            rastrear(evento, dados.current);
          }
        }, 1000);
    };
    const ro = new ResizeObserver(conferir);
    ro.observe(el);
    addEventListener("scroll", conferir, { passive: true });
    addEventListener("resize", conferir);
    document.addEventListener("visibilitychange", conferir);
    conferir();
    return () => {
      cancelar();
      ro.disconnect();
      removeEventListener("scroll", conferir);
      removeEventListener("resize", conferir);
      document.removeEventListener("visibilitychange", conferir);
    };
  }, [evento, chave, vistos]);
  return ref;
}
export function Exposicao({
  evento,
  detalhe,
  children,
}: {
  evento: Evento;
  detalhe: Record<string, string | number>;
  children: ReactNode;
}) {
  const ref = useExposicao(evento, evento, detalhe);
  return <div ref={ref}>{children}</div>;
}

type Ampliacao = { src: string; alt: string; titulo: string; legenda: string };
export function VisorAlma({
  foto,
  fechar,
}: {
  foto: Ampliacao;
  fechar: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [escala, setEscala] = useState(1);
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const d = dialog.current!;
    d.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.dataset.almaModal = "true";
    return () => {
      d.close();
      document.body.style.overflow = overflow;
      delete document.body.dataset.almaModal;
      anterior?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="al-visor"
      onKeyDown={(ev) => {
        if (ev.key !== "Tab") return;
        const itens = Array.from(
          ev.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [tabindex="0"]',
          ),
        );
        const primeiro = itens[0],
          ultimo = itens[itens.length - 1];
        if (ev.shiftKey && document.activeElement === primeiro) {
          ev.preventDefault();
          ultimo?.focus();
        } else if (!ev.shiftKey && document.activeElement === ultimo) {
          ev.preventDefault();
          primeiro?.focus();
        }
      }}
      aria-labelledby="al-visor-titulo"
      aria-describedby="al-visor-legenda"
      onCancel={(ev) => {
        ev.preventDefault();
        fechar();
      }}
    >
      <div className="al-visor__topo">
        <h2 id="al-visor-titulo">{foto.titulo}</h2>
        <button autoFocus type="button" onClick={fechar}>
          Fechar ×
        </button>
      </div>
      <p id="al-visor-legenda">{foto.legenda}</p>
      <div className="al-visor__controles" aria-label="Controles de ampliação">
        <button
          type="button"
          disabled={escala <= 1}
          onClick={() => setEscala((s) => Math.max(1, s - 0.5))}
        >
          Reduzir −
        </button>
        <output aria-live="polite">{escala * 100}%</output>
        <button
          type="button"
          disabled={escala >= 4}
          onClick={() => setEscala((s) => Math.min(4, s + 0.5))}
        >
          Aproximar +
        </button>
        <button type="button" onClick={() => setEscala(1)}>
          Ajustar
        </button>
      </div>
      <div
        className="al-visor__imagem"
        tabIndex={0}
        aria-label="Imagem ampliada; use as setas para mover a área de leitura"
      >
        <div
          style={{
            width: `${escala * 100}%`,
            height: `${escala * 100}%`,
            minHeight: "100%",
            position: "relative",
          }}
        >
          <Image
            src={foto.src}
            alt={foto.alt}
            fill
            sizes={`${Math.min(escala * 100, 200)}vw`}
            style={{ objectFit: "contain" }}
          />
        </div>
      </div>
    </dialog>
  );
}
export function FotoAlma({
  src,
  alt,
  titulo,
  legenda = "Perspectiva ilustrativa do projeto.",
  inteira = false,
}: Ampliacao & { inteira?: boolean }) {
  const [aberta, setAberta] = useState(false);
  return (
    <figure className="al-figura">
      <button
        type="button"
        className={`al-foto al-suave al-imagem-botao ${inteira ? "al-inteira" : ""}`}
        onClick={() => setAberta(true)}
        aria-label={`Ampliar: ${titulo}`}
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 760px) 100vw, 50vw"
        />
      </button>
      <figcaption>
        <b>{titulo}</b>
        <span>{legenda}</span>
      </figcaption>
      {aberta && (
        <VisorAlma
          foto={{ src, alt, titulo, legenda }}
          fechar={() => setAberta(false)}
        />
      )}
    </figure>
  );
}
export function EspacoMidia({
  id,
  previa,
}: {
  id: keyof typeof midiasAlma;
  previa: boolean;
}) {
  const m = midiasAlma[id];
  const aprovada = midiasAprovadasAlma[id];
  if (aprovada?.tipo === "imagem")
    return (
      <FotoAlma
        src={aprovada.src}
        alt={aprovada.alt}
        titulo={aprovada.legenda}
        legenda={aprovada.legenda}
      />
    );
  if (aprovada?.tipo === "video")
    return (
      <figure className="al-figura">
        <video
          src={aprovada.src}
          poster={aprovada.poster}
          controls
          playsInline
          preload="none"
          onPlay={() =>
            rastrear("video_play", {
              empreendimento: "alma-seahouses",
              video: id.toLowerCase(),
            })
          }
        >
          <track
            default
            kind="captions"
            srcLang="pt-BR"
            label="Português"
            src={aprovada.legendas}
          />
        </video>
        <figcaption>{aprovada.legenda}</figcaption>
        <details>
          <summary>Transcrição do vídeo</summary>
          <p>{aprovada.transcricao}</p>
        </details>
      </figure>
    );

  if (!previa) return null;
  return (
    <div
      className="al-midia-prevista"
      style={{ aspectRatio: m.proporcao.replace(":", "/") }}
      data-midia={id}
    >
      <span>{id}</span>
      <p>{m.nome}</p>
      <small>{m.proporcao} · Material a produzir e aprovar</small>
    </div>
  );
}

export function PlantasAlma({
  e,
  p,
  selecionar,
  previa,
}: {
  e: Empreendimento;
  p: Planta;
  selecionar: (p: Planta) => void;
  previa: boolean;
}) {
  const [prancha, setPrancha] = useState(0);
  const [comparar, setComparar] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [retorno, setRetorno] = useState("");
  const [linkManual, setLinkManual] = useState("");
  const vistos = useRef(new Set<string>());
  const trocas = useRef(0);
  const ref = useExposicao(
    "view_floorplan",
    p.slug,
    {
      empreendimento: e.slug,
      planta: p.slug,
      metragem: p.areaNum,
      suites: p.suites!,
    },
    vistos.current,
  );
  const duplex = p.suites === 4;
  const im = p.imagens[duplex ? prancha : 0];
  const nota = duplex ? avisoDuplex : avisoTipo;
  function escolher(q: Planta) {
    if (q.slug !== p.slug) {
      rastrear("switch_floorplan", {
        empreendimento: e.slug,
        de: p.slug,
        para: q.slug,
        ordem: ++trocas.current,
      });
    }
    setPrancha(0);
    setRetorno("");
    setLinkManual("");
    selecionar(q);
  }
  async function compartilhar() {
    const url = `${location.origin}/empreendimentos/${e.slug}/plantas/${p.slug}#plantas`;
    setRetorno("");
    setLinkManual("");
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Alma Sea Houses · ${tituloPlanta(p)}`,
          url,
        });
        rastrear("gallery_interact", {
          empreendimento: e.slug,
          planta: p.slug,
          tema: "compartilhar_planta",
          botao: "compartilhar_nativo",
        });
      } else {
        await navigator.clipboard.writeText(url);
        setRetorno("Link copiado.");
        rastrear("gallery_interact", {
          empreendimento: e.slug,
          planta: p.slug,
          tema: "compartilhar_planta",
          botao: "copiar_link",
        });
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setRetorno(
          "Não foi possível compartilhar. Você pode copiar o link abaixo.",
        );
        setLinkManual(url);
      }
    }
  }
  return (
    <div className="al-consulta">
      <div className="al-opcoes" role="group" aria-label="Escolha uma planta">
        {e.plantas.map((q) => (
          <button
            key={q.slug}
            type="button"
            aria-pressed={q.slug === p.slug}
            onClick={() => escolher(q)}
          >
            <strong>{q.area}</strong>
            <span>{q.suites === 4 ? "Duplex · 4 suítes" : "3 suítes"}</span>
            <small>{q.nome}</small>
          </button>
        ))}
      </div>
      <div className="al-planta-painel">
        <div>
          {duplex && (
            <>
              <h3 className="al-h3">Plantas gerais do pavimento dos duplex</h3>
              <p className="al-aviso">{nota}</p>
              <div
                className="al-pranchas"
                role="group"
                aria-label="Pranchas do pavimento"
              >
                {[0, 1].map((n) => (
                  <button
                    type="button"
                    key={n}
                    aria-pressed={prancha === n}
                    onClick={() => setPrancha(n)}
                  >
                    Prancha {n + 1} — pavimento completo
                  </button>
                ))}
              </div>
            </>
          )}
          <div ref={ref} className="al-planta-quadro">
            <button
              type="button"
              onClick={() => {
                setZoom(true);
                rastrear("floorplan_zoom", {
                  empreendimento: e.slug,
                  planta: p.slug,
                });
              }}
              aria-label="Ampliar planta"
            >
              <Image
                src={im.src}
                alt={plantaAlt(p, prancha)}
                fill
                sizes="(max-width: 860px) 100vw, 60vw"
                style={{ objectFit: "contain" }}
              />
            </button>
          </div>
          {!duplex && <p className="al-aviso">{nota}</p>}
        </div>
        <div className="al-pilha">
          <p className="al-rot">{p.nome}</p>
          <h3 className="al-h3" aria-live="polite">
            {tituloPlanta(p)}
          </h3>
          <p className="al-p">{descricaoPlanta(p)}</p>
          <dl className="al-ficha">
            {[
              ["Área privativa", p.area],
              ["Suítes", p.suites],
              ["Vagas", p.vagas],
              ["Tipologia", p.nome],
            ].map(([a, b]) => (
              <div key={a}>
                <dt>{a}</dt>
                <dd>{b}</dd>
              </div>
            ))}
          </dl>
          <LinkWhatsApp
            className="al-bt"
            empreendimento={e.slug}
            planta={p.slug}
            botao="alma_planta"
            mensagem={mensagemPlanta(p)}
          >
            Conversar sobre {duplex ? "este duplex" : "esta planta"}
          </LinkWhatsApp>
          <div className="al-acoes">
            <button
              className="al-bt al-bt--linha"
              onClick={() => {
                setZoom(true);
                rastrear("floorplan_zoom", {
                  empreendimento: e.slug,
                  planta: p.slug,
                });
              }}
            >
              Ampliar planta
            </button>
            <button className="al-bt al-bt--linha" onClick={compartilhar}>
              Compartilhar planta
            </button>
          </div>
          <p role="status">{retorno}</p>
          {linkManual && (
            <label>
              Link da planta
              <input
                readOnly
                value={linkManual}
                onFocus={(ev) => ev.target.select()}
              />
            </label>
          )}
          <a href="#inicio">Conhecer o Alma</a>
        </div>
      </div>
      <button
        type="button"
        className="al-bt al-bt--linha"
        aria-expanded={comparar}
        aria-controls="al-comparacao"
        onClick={() => {
          if (!comparar)
            rastrear("gallery_interact", {
              empreendimento: e.slug,
              tema: "comparacao_plantas",
              botao: "abrir_comparacao",
            });
          setComparar(!comparar);
        }}
      >
        {comparar ? "Fechar comparação" : "Comparar as quatro opções"}
      </button>
      <div id="al-comparacao" hidden={!comparar}>
        <p className="al-p">
          Veja as informações de cada opção lado a lado. Para comparar medidas
          de ambientes e possibilidades de mobiliário, converse com a equipe
          sobre os desenhos técnicos disponíveis.
        </p>
        <div className="al-comparacao">
          {e.plantas.map((q) => (
            <article key={q.slug}>
              <h3 className="al-h3">{q.nome}</h3>
              <dl className="al-ficha">
                {[
                  ["Área privativa", q.area],
                  ["Suítes", q.suites],
                  ["Vagas", q.vagas],
                  ["Configuração", q.suites === 4 ? "Duplex" : "Apartamento"],
                  [
                    "Desenho apresentado",
                    q.suites === 4
                      ? "Pranchas gerais do pavimento"
                      : "Planta do apartamento",
                  ],
                ].map(([a, b]) => (
                  <div key={a}>
                    <dt>{a}</dt>
                    <dd>{b}</dd>
                  </div>
                ))}
              </dl>
              <button
                type="button"
                className="al-bt"
                onClick={() => {
                  escolher(q);
                  setComparar(false);
                  document
                    .querySelector<HTMLButtonElement>(
                      ".al-opcoes button[aria-pressed=true]",
                    )
                    ?.focus({ preventScroll: true });
                  document.getElementById("plantas")?.scrollIntoView();
                }}
              >
                Ver esta planta
              </button>
            </article>
          ))}
        </div>
      </div>
      {(previa || midiasAprovadasAlma.M05) && (
        <details className="al-expansao">
          <summary>Conheça as plantas de 103 e 114 m²</summary>
          <EspacoMidia id="M05" previa={previa} />
        </details>
      )}
      {zoom && (
        <VisorAlma
          foto={{
            src: im.src,
            alt: plantaAlt(p, prancha),
            titulo: `${p.nome} · ${tituloPlanta(p)}${duplex ? ` · Prancha ${prancha + 1} — pavimento completo` : ""}`,
            legenda: nota,
          }}
          fechar={() => setZoom(false)}
        />
      )}
    </div>
  );
}
