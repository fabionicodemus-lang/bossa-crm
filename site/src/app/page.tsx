import Image from "next/image";
import Link from "next/link";
import { alma, flow, soul, jazz } from "@/content/empreendimentos";
import { distanciasHome, pilares } from "@/content/site";
import { meta } from "@/lib/seo";
import { Andamento, CartaoEmpreendimento, Cota, Pct, pct } from "@/components/Blocos";
import { AoVer } from "@/components/AoVer";
import { LinkWhatsApp } from "@/components/LinkWhatsApp";

export const metadata = meta({
  titulo: "Bossa Empreendimentos · Incorporadora em Porto Belo e Itapema",
  descricao: "Incorporadora fundada em 2017. Poucas obras por vez, acompanhadas de perto: Alma Seahouses e Flow Aptos em obra, Jazz e Soul entregues.",
  caminho: "/",
});

export default function Home() {
  const edFlow = flow.edicoes[0];
  return (
    <>
      {/* Abertura */}
      <section className="sec" style={{ paddingBottom: 0 }}>
        <div className="wrap dupla" style={{ alignItems: "end" }}>
          <div className="pilha">
            <p className="rotulo">Incorporadora · Porto Belo e Itapema · desde 2017</p>
            <h1 className="h1">Construímos pouco. Para entregar tudo.</h1>
          </div>
          <div className="pilha" style={{ paddingBottom: 8 }}>
            <p className="lead">Dois empreendimentos em obra, acompanhados de perto toda semana. Dois entregues, um deles um ano e oito meses antes do prazo.</p>
            <Link href="#empreendimentos" className="botao botao--texto">Conheça os empreendimentos</Link>
          </div>
        </div>
        <div className="abertura-foto" style={{ marginTop: 48 }}>
          <Image src="/img/alma-piscina.jpg" alt="Piscina aquecida do Alma Seahouses com prainha, entre jardins, e o gourmet ao fundo" fill priority sizes="100vw" />
        </div>
        <div className="wrap" style={{ paddingTop: 12 }}><p className="nota">Alma Seahouses · piscina aquecida com prainha · imagem ilustrativa</p></div>
      </section>

      {/* Manifesto */}
      <AoVer as="section" evento="view_bossa_way" detalhe={{ tipo_pagina: "home" }} className="sec">
        <div className="wrap dupla" style={{ alignItems: "start" }}>
          <div className="pilha">
            <p className="rotulo">Por que poucos</p>
            <div className="ficha" style={{ maxWidth: 440 }}>
              <div className="ficha__item"><p className="ficha__numero">2<small>obras</small></p><p className="ficha__legenda">em execução hoje</p></div>
              <div className="ficha__item"><p className="ficha__numero">2<small>entregues</small></p><p className="ficha__legenda">Jazz e Soul</p></div>
            </div>
          </div>
          <div className="pilha">
            <h2 className="h2">Escolhemos onde colocar nossa atenção.</h2>
            <p className="p">A Bossa mantém poucos empreendimentos ao mesmo tempo. Assim, a engenharia, a direção e os recursos estão em cada obra, toda semana, e não só no dia do lançamento. É assim desde o Jazz, em 2017.</p>
            <Link href="/jeito-bossa" className="botao botao--texto">Conheça o Jeito Bossa</Link>
          </div>
        </div>
      </AoVer>

      {/* Alma */}
      <section id="empreendimentos" className="sec u-alma">
        <div className="wrap produto">
          <div className="pilha">
            <p className="rotulo">{alma.rotulo}</p>
            <h2 className="h1" style={{ fontSize: "clamp(44px, 5.4vw, 72px)" }}>Alma Seahouses</h2>
            <p className="p">Dois apartamentos por andar, 850 m² de lazer entre jardins e a Praia do Perequê a 300 metros.</p>
            <div className="ficha" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <div className="ficha__item"><p className="ficha__numero">300<small>m</small></p><p className="ficha__legenda">até o mar</p></div>
              <div className="ficha__item"><p className="ficha__numero">3 e 4<small>suítes</small></p><p className="ficha__legenda">de 103 a 168 m²</p></div>
              <div className="ficha__item"><p className="ficha__numero">30<small>pav.</small></p><p className="ficha__legenda">112 m de altura</p></div>
              <div className="ficha__item"><p className="ficha__numero">07<small>/2030</small></p><p className="ficha__legenda">entrega prevista</p></div>
            </div>
            <Link href="/empreendimentos/alma-seahouses" className="botao botao--texto">Conhecer o Alma</Link>
          </div>
          <div className="produto__foto revelar"><Image src="/img/alma-lazer.jpg" alt="Pavimento de lazer do Alma Seahouses com piscina, jardins e espreguiçadeiras" fill sizes="(max-width: 860px) 100vw, 58vw" /></div>
        </div>
      </section>

      {/* Flow */}
      <section className="sec u-flow">
        <div className="wrap produto produto--inverso">
          <div className="produto__foto revelar"><Image src="/img/flow-fachada-noite.jpg" alt="Fachada iluminada do Flow Aptos ao entardecer" fill sizes="(max-width: 860px) 100vw, 58vw" style={{ objectFit: "cover", objectPosition: "center 30%" }} /></div>
          <div className="pilha">
            <p className="rotulo">Em obra · Balneário Perequê</p>
            <h2 className="h1" style={{ fontSize: "clamp(44px, 5.4vw, 72px)" }}>Flow Aptos</h2>
            <p className="p">57 apartamentos de 2 suítes e duplex de 3 suítes, com mais de 600 m² de lazer em dois andares e o mar a 800 metros.</p>
            <AoVer evento="view_construction" detalhe={{ empreendimento: "flow-aptos", edicao: edFlow.numero, percentual: edFlow.percentual }}>
              <div className="pilha-p">
                <p className="obra-pct" style={{ margin: 0 }}><Pct n={edFlow.percentual} /></p>
                <div className="obra-barra" style={{ color: "var(--flow-nevoa)", background: "rgba(255,255,255,.2)" }} role="img" aria-label={`Obra ${pct(edFlow.percentual)}% concluída`}><span style={{ width: `${edFlow.percentual}%` }} /></div>
                <p className="nota">concluído em {edFlow.mesExtenso}</p>
              </div>
            </AoVer>
            <p className="nota">2 suítes de 62 e 73 m² · duplex de 93 e 117,7 m² · entrega em novembro de 2027</p>
            <Link href="/empreendimentos/flow-aptos" className="botao botao--texto">Conhecer o Flow</Link>
          </div>
        </div>
      </section>

      {/* Entregues */}
      <AoVer as="section" evento="view_history" detalhe={{ tipo_pagina: "home" }} className="sec">
        <div className="wrap pilha" style={{ gap: 48 }}>
          <div className="pilha" style={{ maxWidth: 760 }}>
            <p className="rotulo">Entregues</p>
            <h2 className="h2">O que prometemos já está de pé.</h2>
          </div>
          <div className="dupla">
            <CartaoEmpreendimento e={soul} />
            <CartaoEmpreendimento e={jazz} />
          </div>
        </div>
      </AoVer>

      {/* Obra de perto */}
      <section className="sec sec--elev">
        <div className="wrap pilha" style={{ gap: 48 }}>
          <div className="dupla" style={{ alignItems: "end" }}>
            <div className="pilha"><p className="rotulo">A obra de perto</p><h2 className="h2">O cuidado não aparece só no render. Aparece na obra.</h2></div>
            <div className="pilha">
              <p className="p">Todo mês publicamos o andamento de cada obra, pavimento a pavimento, com uma reportagem técnica. Em setembro, por exemplo, mostramos por que o box dos banheiros do Flow tem ralo linear.</p>
              <Link href="/obras" className="botao botao--texto">Acompanhar as obras</Link>
            </div>
          </div>
          <div className="dupla">
            <Andamento ed={flow.edicoes[0]} nome="Flow Aptos" compacto />
            <Andamento ed={alma.edicoes[0]} nome="Alma Seahouses" compacto />
          </div>
        </div>
      </section>

      {/* Jeito Bossa */}
      <section className="sec">
        <div className="wrap pilha" style={{ gap: 48 }}>
          <div className="pilha"><p className="rotulo">Jeito Bossa</p><h2 className="h2">Quatro escolhas que repetimos em cada obra.</h2></div>
          <ol className="quatro" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {[pilares[0], pilares[1], pilares[2], pilares[7]].map((p, i) => (
              <li key={p.n} className="pilha-p" style={{ borderTop: "1px solid var(--tinta)", paddingTop: 24 }}>
                <span className="cota__valor">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="h3" style={{ fontSize: 24 }}>{p.titulo}</h3>
                <p className="nota" style={{ fontSize: 15, lineHeight: "22px" }}>{["Para que a direção esteja na obra, não só no lançamento.", "O projeto bonito precisa funcionar na obra e no dia a dia.", "Prumo, nível, ensaio de arrancamento, teste de estanqueidade.", "A promessa só termina quando o apartamento está pronto."][i]}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Região */}
      <AoVer as="section" evento="view_location" detalhe={{ tipo_pagina: "home" }} className="sec sec--elev">
        <div className="wrap dupla" style={{ alignItems: "start" }}>
          <div className="pilha">
            <p className="rotulo">Porto Belo e Itapema</p>
            <h2 className="h2">Duas cidades, uma ponte, a mesma avenida.</h2>
            <p className="p">Os entregues ficam em Itapema. As obras de hoje ficam no Balneário Perequê, em Porto Belo, a cerca de 5 km pela mesma avenida.</p>
            <Link href="/porto-belo" className="botao botao--texto">Conhecer a região</Link>
          </div>
          <div className="pilha">
            <Cota valor="300 m até o mar, a partir do Alma" />
            <ul className="lista-dados">{distanciasHome.map(([a, b]) => <li key={a}><span>{a}</span><span>{b}</span></li>)}</ul>
          </div>
        </div>
      </AoVer>

      {/* Fechamento */}
      <section className="sec">
        <div className="wrap pilha" style={{ alignItems: "flex-start" }}>
          <h2 className="h1" style={{ fontSize: "clamp(40px, 5vw, 72px)", maxWidth: 900 }}>Quer conhecer um Bossa de perto?</h2>
          <p className="lead">Visite o decorado, a obra, ou converse com a gente pelo WhatsApp.</p>
          <div className="linha-acoes">
            <LinkWhatsApp className="botao" botao="fechamento_home" mensagem="Olá! Estou no site da Bossa e gostaria de conversar.">Conversar com a Bossa</LinkWhatsApp>
            <Link href="/contato#visita" className="botao botao--contorno">Agendar uma visita</Link>
          </div>
        </div>
      </section>
    </>
  );
}
