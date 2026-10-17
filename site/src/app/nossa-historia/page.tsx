import Image from "next/image";
import Link from "next/link";
import { empresa, linhaDoTempo } from "@/content/site";
import { meta } from "@/lib/seo";
import { AoVer } from "@/components/AoVer";
import { Cota } from "@/components/Blocos";

export const metadata = meta({ titulo: "Nossa História · Bossa Empreendimentos desde 2017", descricao: "De Jazz a Alma: como a Bossa cresceu em Itapema e Porto Belo, um empreendimento de cada vez, de 2017 até hoje.", caminho: "/nossa-historia" });

export default function NossaHistoria() {
  return (
    <AoVer evento="view_history" detalhe={{ tipo_pagina: "nossa-historia" }}>
      <section className="sec">
        <div className="wrap pilha" style={{ gap: 32 }}>
          <p className="rotulo">Nossa História · 2017 a hoje</p>
          <h1 className="h1">Bossa, Jazz, Soul, Flow, Alma.</h1>
          <div className="dupla"><p className="lead">{empresa.definicao}</p><p className="p">Cada empreendimento leva o nome de um ritmo. E cada um foi um passo maior que o anterior.</p></div>
        </div>
      </section>
      <section style={{ paddingBottom: 96 }}>
        <div className="wrap">
          {linhaDoTempo.map((c) => (
            <article className="capitulo" key={c.ano}>
              <span className="capitulo__ano">{c.ano}</span>
              <div className="pilha">
                <h2 className="h2" style={{ fontSize: 40 }}>{c.titulo}</h2>
                <p className="p">{c.texto}</p>
                {c.periodo && <div style={{ maxWidth: 420 }}><Cota valor={c.periodo} /></div>}
                {c.href && <Link className="botao botao--texto" href={c.href}>Ver o {c.titulo.split(" ")[0]}</Link>}
              </div>
              {c.img ? <div className="ratio-4-3 revelar" style={{ position: "relative" }}><Image src={c.img} alt={c.titulo} fill sizes="(max-width: 860px) 100vw, 33vw" /></div> : <div />}
            </article>
          ))}
        </div>
      </section>
      <section className="sec sec--elev">
        <div className="wrap pilha" style={{ maxWidth: 1000 }}>
          <p className="rotulo">Hoje</p>
          <h2 className="h2">Poucas obras ao mesmo tempo, acompanhadas de perto. E a ambição de continuar crescendo nesse ritmo.</h2>
          <Link className="botao botao--texto" href="/jeito-bossa">Conheça o Jeito Bossa</Link>
        </div>
      </section>
    </AoVer>
  );
}
