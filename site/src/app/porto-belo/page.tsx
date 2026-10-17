import Image from "next/image";
import Link from "next/link";
import { meta } from "@/lib/seo";
import { AoVer } from "@/components/AoVer";

export const metadata = meta({ titulo: "Morar e investir no Perequê, Porto Belo e Itapema", descricao: "Praias, marinas, distâncias e dados de mercado da região onde a Bossa constrói, no litoral norte de Santa Catarina.", caminho: "/porto-belo" });

const praias = [["Perequê", "300 m"], ["Centro de Porto Belo", "1 km"], ["Praia das Vieiras", "3 km"], ["Araçá", "4 km"], ["Estaleiro", "5 km"], ["Zimbros", "9 km"], ["Bombinhas", "10 km"], ["Quatro Ilhas", "12 km"], ["Mariscal", "13 km"]];
const mar = [["Ilha de Porto Belo", "1,5 km"], ["Marina Porto das Águas", "2 km"], ["Marina Pier 33", "3 km"], ["Porto Marina Atlântica", "4 km"]];
const aeroportos = [["Costa Esmeralda", "5 km"], ["Navegantes", "57 km"], ["Florianópolis", "67 km"]];
const Lista = ({ t, itens }: { t: string; itens: string[][] }) => (
  <div className="pilha-p"><p className="rotulo">{t}</p><ul className="lista-dados">{itens.map(([a, b]) => <li key={a}><span>{a}</span><span>{b}</span></li>)}</ul></div>
);

export default function PortoBelo() {
  return (
    <AoVer evento="view_location" detalhe={{ tipo_pagina: "porto-belo" }}>
      <section className="sec">
        <div className="wrap pilha" style={{ gap: 32 }}>
          <p className="rotulo">A região</p>
          <h1 className="h1" style={{ maxWidth: 1100 }}>Porto Belo e Itapema. Duas cidades, uma ponte, a mesma avenida.</h1>
          <p className="lead">O Balneário Perequê, em Porto Belo, fica do outro lado do Rio Perequê em relação à Meia Praia, em Itapema. Os dois entregues da Bossa ficam em Itapema; as duas obras de hoje, no Perequê, a cerca de 5 km pela mesma avenida.</p>
        </div>
      </section>
      <div className="abertura-foto" style={{ height: "min(60vh, 560px)" }}><Image src="/img/flow-rooftop.jpg" alt="Vista do Balneário Perequê a partir do rooftop do Flow Aptos (render)" fill sizes="100vw" /></div>
      <section className="sec">
        <div className="wrap dupla" style={{ alignItems: "start" }}>
          <div className="pilha"><p className="rotulo">Para morar</p><h2 className="h2">Praia o ano inteiro, cidade por perto.</h2><p className="p">O Perequê é o principal bairro de Porto Belo, com praia, mercados, escolas, farmácias e uma via gastronômica. Itapema fica a 3 minutos de carro, Balneário Camboriú a 15 e Florianópolis a 40.</p></div>
          <div className="pilha"><Lista t="Praias, a partir do Alma" itens={praias} /><Lista t="Pelo mar" itens={mar} /><Lista t="Aeroportos" itens={aeroportos} /></div>
        </div>
      </section>
      <section className="sec sec--elev">
        <div className="wrap dupla" style={{ alignItems: "start" }}>
          <div className="pilha"><p className="rotulo">Para investir</p><h2 className="h2">Uma região que está se transformando.</h2></div>
          <div className="pilha">
            <p className="p">Porto Belo foi a cidade que mais vendeu imóveis novos no Brasil em 2025, segundo a inteligência de mercado da DWV (<a href="https://www.bemparana.com.br/noticias/economia/cidade-do-litoral-dispara-na-frente-e-se-torna-a-campea-nacional-de-vendas-de-imoveis-em-2025/amp/" target="_blank" rel="noopener">fonte</a>). A cidade está cercada por Itapema, Balneário Camboriú, Itajaí e Florianópolis, e tem um Master Plan de revitalização da cidade e da orla.</p>
            <p className="nota">Dados de mercado têm caráter informativo e não representam promessa de valorização ou rentabilidade.</p>
            <div className="linha-acoes"><Link className="botao botao--texto" href="/empreendimentos/alma-seahouses">Conhecer o Alma</Link><Link className="botao botao--texto" href="/empreendimentos/flow-aptos">Conhecer o Flow</Link></div>
          </div>
        </div>
      </section>
    </AoVer>
  );
}
