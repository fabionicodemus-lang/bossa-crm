"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Planta } from "@/content/empreendimentos";
import { rastrear } from "@/lib/rastreio";
import { LinkWhatsApp } from "./LinkWhatsApp";
import { Visor } from "./Visor";

type Props = { slug: string; nome: string; plantas: Planta[]; inicial?: string };

export function SeletorPlantas({ slug, nome, plantas, inicial }: Props) {
  const [i, setI] = useState(() => Math.max(0, plantas.findIndex((p) => p.slug === inicial)));
  const [zoom, setZoom] = useState<number | null>(null);
  const trocas = useRef(0);
  const p = plantas[i];
  const base = `/empreendimentos/${slug}`;

  useEffect(() => { rastrear("view_floorplan", { empreendimento: slug, planta: plantas[i].slug, metragem: plantas[i].areaNum }); }, [i, slug, plantas]);

  function escolher(j: number) {
    if (j === i) return;
    trocas.current += 1;
    rastrear("switch_floorplan", { empreendimento: slug, de: plantas[i].slug, para: plantas[j].slug, ordem: trocas.current });
    setI(j);
    history.replaceState(null, "", `${base}/plantas/${plantas[j].slug}`);
    const t = document.getElementById("whats-barra-titulo");
    if (t) t.textContent = `${nome} · ${plantas[j].nome} ${plantas[j].area}`;
  }
  function teclado(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") { e.preventDefault(); escolher((i + 1) % plantas.length); }
    if (e.key === "ArrowLeft") { e.preventDefault(); escolher((i - 1 + plantas.length) % plantas.length); }
  }

  return (
    <div>
      <div className="plantas__abas" role="tablist" aria-label={`Plantas do ${nome}`} onKeyDown={teclado}>
        {plantas.map((q, j) => (
          <a key={q.slug} role="tab" id={`aba-${q.slug}`} aria-selected={j === i} aria-controls="painel-planta" tabIndex={j === i ? 0 : -1}
             href={`${base}/plantas/${q.slug}`} className="plantas__aba"
             onClick={(e) => { e.preventDefault(); escolher(j); }}>
            {q.nome}<small>{q.area}</small>
          </a>
        ))}
      </div>
      <div className="plantas__painel" role="tabpanel" id="painel-planta" aria-labelledby={`aba-${p.slug}`}>
        <div className="plantas__desenho">
          {p.imagens.map((im, k) => (
            <button key={im.src + k} type="button" onClick={() => { setZoom(k); rastrear("floorplan_zoom", { empreendimento: slug, planta: p.slug }); }}
                    style={{ padding: 0, border: 0, background: "none" }} aria-label={`Ampliar: ${im.alt}`}>
              <Image src={im.src} alt={im.alt} width={1400} height={1050} sizes="(max-width: 860px) 100vw, 58vw" style={{ width: "100%", height: "auto" }} />
            </button>
          ))}
        </div>
        <div className="pilha">
          <div className="cota cota--crescer"><span className="cota__valor">{p.area}</span></div>
          <ul className="lista-dados">
            <li><span>Área privativa</span><span>{p.area}</span></li>
            {p.suites !== null && <li><span>Suítes</span><span>{p.suites}</span></li>}
            {p.vagas !== null && <li><span>Vagas</span><span>{p.vagas}</span></li>}
            <li><span>{p.descricao}</span><span /></li>
          </ul>
          <LinkWhatsApp className="botao botao--contorno" botao="planta" empreendimento={slug} planta={p.slug}
            mensagem={`Olá! Tenho interesse no ${p.nome} de ${p.area} do ${nome}.`}>Conversar sobre esta planta</LinkWhatsApp>
          <p className="nota">Plantas ilustrativas. As medidas podem variar conforme o projeto executivo.</p>
        </div>
      </div>
      {zoom !== null && <Visor fotos={p.imagens} inicio={zoom} aoFechar={() => setZoom(null)} />}
    </div>
  );
}
