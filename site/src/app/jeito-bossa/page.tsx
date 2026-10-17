import Image from "next/image";
import Link from "next/link";
import { equipe, pilares } from "@/content/site";
import { meta } from "@/lib/seo";
import { AoVer } from "@/components/AoVer";

export const metadata = meta({ titulo: "Jeito Bossa · Construímos pouco. Para entregar tudo.", descricao: "Oito escolhas que a Bossa repete em cada obra, cada uma com uma prova: engenharia na decisão, obra que se mede e entrega no prazo.", caminho: "/jeito-bossa" });

export default function JeitoBossa() {
  return (
    <AoVer evento="view_bossa_way" detalhe={{ tipo_pagina: "jeito-bossa" }}>
      <section className="sec">
        <div className="wrap pilha" style={{ gap: 32 }}>
          <p className="rotulo">Jeito Bossa</p>
          <h1 className="h1" style={{ maxWidth: 1100 }}>Construímos pouco. Para entregar tudo.</h1>
          <div className="dupla" style={{ maxWidth: 1100 }}>
            <p className="lead">Não acreditamos que construir mais significa construir melhor.</p>
            <div className="pilha">
              <p className="p">Preferimos escolher onde colocar nossa energia, nossa engenharia e nossa atenção. Cada empreendimento da Bossa passa por decisões que vão da arquitetura ao detalhe de execução, do planejamento financeiro ao acabamento que você toca todos os dias.</p>
              <p className="p">Por isso fazemos poucos projetos por vez. Para continuar perto da obra, perto das escolhas e perto da entrega.</p>
            </div>
          </div>
        </div>
      </section>
      <div className="abertura-foto" style={{ height: "min(60vh, 560px)" }}><Image src="/img/flow-fachada-dia.jpg" alt="Torre do Flow Aptos em execução, vista de baixo" fill sizes="100vw" style={{ objectPosition: "center 20%" }} /></div>
      <section className="sec">
        <div className="wrap pilha" style={{ gap: 32 }}>
          <h2 className="h2">Oito escolhas, cada uma com uma prova.</h2>
          <ol className="pilares" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {pilares.map((p) => (
              <li className="pilar" key={p.n}>
                <span className="cota__valor">{p.n}</span>
                <div><h3 className="h3" style={{ marginBottom: 12 }}>{p.titulo}</h3><p className="p">{p.texto}</p>{p.prova && <span className="pilar__prova">{p.prova}</span>}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="sec sec--elev">
        <div className="wrap pilha" style={{ gap: 32 }}>
          <div className="pilha"><p className="rotulo">Quem decide está perto da obra</p><h2 className="h2">As pessoas por trás de cada entrega.</h2></div>
          <ul className="tres" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {equipe.map((p) => <li key={p.nome} className="pilha-p" style={{ borderTop: "1px solid var(--tinta)", paddingTop: 16 }}><strong style={{ fontWeight: 500 }}>{p.nome}</strong><span className="nota">{p.cargo}</span></li>)}
          </ul>
        </div>
      </section>
      <section className="sec">
        <div className="wrap linha-acoes" style={{ justifyContent: "space-between" }}>
          <h2 className="h2" style={{ maxWidth: 760 }}>Veja o Jeito Bossa em obra.</h2>
          <div className="linha-acoes"><Link className="botao" href="/obras">Acompanhar as obras</Link><Link className="botao botao--contorno" href="/empreendimentos">Conhecer os empreendimentos</Link></div>
        </div>
      </section>
    </AoVer>
  );
}
