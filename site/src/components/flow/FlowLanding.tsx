import Image from "next/image";
import Link from "next/link";
import "@/styles/flow.css";
import type { Empreendimento } from "@/content/empreendimentos";
import { acabamentosFlow, distanciasFlow, notaLegal, perguntas } from "@/content/site";
import { empreendimentoLd, migalhasLd, perguntasLd } from "@/lib/seo";
import { Andamento, JsonLd } from "../Blocos";
import { AoVer } from "../AoVer";
import { SeletorPlantas } from "../SeletorPlantas";
import { FormLead } from "../FormLead";
import { Perguntas } from "../Perguntas";
import { LinkWhatsApp } from "../LinkWhatsApp";
import { LinkRastreado } from "../LinkRastreado";
import { VerEmpreendimento } from "../VerEmpreendimento";
import { MesesAteEntrega, Surgir, VideoAbertura, VideoVertical } from "./Clientes";
import { VistaAndares } from "./VistaAndares";

const IMG = "/img/flow";
const VID = "/video/flow";

const DIA = [
  { hora: "07:00", titulo: "Espaço Fitness", texto: "O treino começa antes do expediente, sem trânsito até a academia. Ela fica no 5º andar, a um elevador de casa.", foto: "fitness", alt: "Espaço fitness do Flow Move com esteira, bicicleta e parede de escalada", chips: ["Espaço fitness"] },
  { hora: "09:00", titulo: "Coworking e lavanderia", texto: "Você desce para trabalhar e, no caminho, deixa a roupa na lavanderia. Quando a reunião termina, ela está pronta.", foto: "coworking", alt: "Coworking do Flow Move com mesas de trabalho e sala de reuniões", chips: ["Coworking", "Sala de reuniões", "Lavanderia"] },
  { hora: "12:30", titulo: "Flow Store", texto: "Faltou alguma coisa para o almoço? A conveniência fica no mesmo andar do coworking.", foto: "flow-store", alt: "Flow Store, a loja de conveniência do Flow Move", chips: ["Flow Store"] },
  { hora: "18:00", titulo: "Playground e Espaço Zen", texto: "As crianças brincam no playground enquanto você descomprime no espaço zen, a poucos passos.", foto: "playground", alt: "Playground ao ar livre do Flow Move entre jardins", chips: ["Playground", "Espaço zen"] },
  { hora: "21:00", titulo: "Cine Flow", texto: "O dia termina ao ar livre, com um filme no telão e o fogo aceso no lounge.", foto: "cine-flow", alt: "Cine Flow, lounge externo com telão e mesa de fogo", chips: ["Cine Flow"] },
];

const CONDOMINIO = [
  "Os 12 ambientes de lazer entregues mobiliados, decorados, equipados e com enxoval",
  "Hall social mobiliado, decorado e sonorizado",
  "Dois elevadores de alta velocidade",
  "Duas entradas: Rua São José e Rua Santa Terezinha",
  "Piscina com infraestrutura para aquecimento",
  "Automação do condomínio e câmeras de segurança",
  "Áreas comuns sonorizadas, iluminadas e climatizadas",
  "Gerador para emergências",
  "Medição individual de energia, gás e água",
];
const APARTAMENTO = [
  ...acabamentosFlow,
  "Portas de 4,2 cm de espessura",
  "Janelas amplas, com luz e ventilação natural; suítes principais com janelas panorâmicas",
];
const ENGENHARIA = [
  { valor: "72 h", titulo: "O box por dentro", texto: "Ralo linear em vez de ralo central: o piso do box vira um plano só. O nicho é feito junto com a parede e entregue revestido. Nenhuma peça é assentada antes do teste de estanqueidade de 72 horas." },
  { valor: "24º", titulo: "Churrasqueira sem fumaça de volta", texto: "Cada churrasqueira tem coifa e damper. Uma prumada leva a fumaça até acima do rooftop, onde um exaustor puxa o ar." },
  { valor: "2 mm", titulo: "Porcelanato que não solta", texto: "Juntas de 2 mm, dupla colagem com argamassa AC-III e ensaio de arrancamento antes da entrega." },
];

function Beat() {
  return (
    <svg className="fl-beat" viewBox="0 0 600 56" preserveAspectRatio="none" aria-hidden="true">
      {[0, 7, 14, 21, 28].map((y) => <path key={y} d={`M0 ${14 + y} C 120 ${14 + y}, 160 ${2 + y}, 260 ${2 + y} S 420 ${22 + y}, 600 ${14 + y}`} />)}
    </svg>
  );
}

export function FlowLanding({ e, plantaInicial }: { e: Empreendimento; plantaInicial?: string }) {
  const ed = e.edicoes[0];
  const faq = [...perguntas.filter((q) => q.grupo === "flow"), perguntas.find((q) => q.p.startsWith("A Bossa já entregou"))!, perguntas.find((q) => q.grupo === "compra")!];
  const migalhas = [{ nome: "Início", href: "/" }, { nome: "Empreendimentos", href: "/empreendimentos" }, { nome: e.nome, href: `/empreendimentos/${e.slug}` }];
  const mesesBuild = (() => { const [a, m] = e.entregaIso.split("-").map(Number); const h = new Date(); return Math.max(0, (a - h.getFullYear()) * 12 + (m - 1 - h.getMonth())); })();

  return (
    <div className="fl">
      <Surgir />
      <VerEmpreendimento slug={e.slug} estagio={e.status} />
      <JsonLd dados={empreendimentoLd(e)} />
      <JsonLd dados={perguntasLd(faq)} />
      <JsonLd dados={migalhasLd(migalhas)} />

      {/* 1 · Abertura */}
      <section className="fl-abertura" aria-labelledby="fl-titulo">
        <VideoAbertura src={`${VID}/abertura.mp4`} poster={`${IMG}/abertura-poster.jpg`} />
        <div className="fl-wrap fl-abertura__conteudo">
          <Image src={`${IMG}/logo-claro.png`} alt="Flow Aptos" width={1100} height={197} priority className="fl-abertura__logo" />
          <h1 id="fl-titulo" className="fl-h1">Perto do mar.<br />No ritmo da cidade.</h1>
          <p className="fl-lead">57 apartamentos de 2 suítes e duplex com pé-direito de 4,90 m, a 800 metros da Praia do Perequê, em Porto Belo.</p>
          <div className="fl-selos">
            <span className="fl-selo fl-selo--br">Chaves em <b>novembro de 2027</b></span>
            <span className="fl-selo">Obra em <b>{ed.percentual.toLocaleString("pt-BR")}%</b></span>
          </div>
          <div className="fl-acoes">
            <LinkWhatsApp className="fl-bt" botao="abertura" empreendimento={e.slug} mensagem="Olá! Vi o Flow Aptos no site e quero saber mais.">Conversar sobre o Flow</LinkWhatsApp>
            <a className="fl-bt fl-bt--linha" href="#plantas">Ver as plantas</a>
          </div>
        </div>
      </section>

      {/* 2 · Para quem é */}
      <section className="fl-sec fl-clr">
        <div className="fl-wrap fl-quem">
          <div className="fl-pilha fl-pilha--g fl-surge">
            <p className="fl-rot">No ritmo da nossa vida</p>
            <h2 className="fl-h2">Para quem não quer escolher entre a praia e a cidade.</h2>
            <p className="fl-p">Você trabalha, encontra os amigos, tem a semana cheia. O Flow fica a 800 metros da Praia do Perequê e a três minutos de Itapema: o mar no fim da tarde, a cidade funcionando ao redor. E um prédio que resolve o dia a dia sem você precisar sair dele.</p>
          </div>
          <dl className="fl-tres fl-surge">
            <div><dt>Para morar</dt><dd>Apartamento prático, que funciona sozinho, e dois andares de lazer que fazem o papel do resto da casa.</dd></div>
            <div><dt>Para alugar</dt><dd>Duas suítes, perto do mar e da cidade, num prédio completo: o que quem aluga procura.</dd></div>
            <div><dt>Para os dois</dt><dd>Morar parte do ano e alugar no resto. O mesmo apartamento atende às duas vidas.</dd></div>
          </dl>
        </div>
      </section>

      {/* 3 · Um dia no Flow Move */}
      <section className="fl-sec fl-esc fl-pontos" aria-labelledby="fl-move">
        <div className="fl-wrap">
          <div className="fl-cab fl-surge">
            <div className="fl-pilha">
              <p className="fl-rot">Flow Move · 5º andar</p>
              <h2 id="fl-move" className="fl-h2">Um dia inteiro sem sair do prédio.</h2>
            </div>
            <p className="fl-p">O primeiro dos dois andares de lazer foi pensado para a rotina: trabalhar, treinar, cuidar da casa e descansar, tudo a um elevador de distância.</p>
          </div>
          <div className="fl-dia">
            {DIA.map((m, i) => (
              <article key={m.hora} className="fl-momento fl-surge">
                <div className="fl-momento__foto"><Image src={`${IMG}/${m.foto}.jpg`} alt={m.alt} fill sizes="(max-width: 900px) 100vw, 58vw" /></div>
                <div className="fl-momento__texto">
                  <div className="fl-momento__linha"><p className="fl-hora">{m.hora}</p></div>
                  <h3 className="fl-h3">{m.titulo}</h3>
                  <p className="fl-p">{m.texto}</p>
                  <ul className="fl-chips">{m.chips.map((c) => <li key={c}>{c}</li>)}</ul>
                  {i === DIA.length - 1 && <p className="fl-nota">Imagens ilustrativas.</p>}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 4 · The Roof */}
      <section aria-labelledby="fl-roof">
        <div className="fl-full">
          <Image src={`${IMG}/piscina.jpg`} alt="Piscina do The Roof, no 24º andar do Flow Aptos, com o espaço gourmet ao fundo" fill sizes="100vw" />
          <div className="fl-wrap fl-full__conteudo fl-surge">
            <p className="fl-rot">The Roof · 24º andar</p>
            <h2 id="fl-roof" className="fl-h1" style={{ fontSize: "clamp(44px, 6.4vw, 96px)" }}>O fim de semana<br />mora no último andar.</h2>
          </div>
        </div>
        <div className="fl-sec fl-esc" style={{ paddingTop: "clamp(48px, 6vw, 80px)" }}>
          <div className="fl-wrap">
            <div className="fl-cab fl-surge">
              <p className="fl-lead" style={{ color: "var(--nev)" }}>A piscina pega sol o dia inteiro. Ao lado, o espaço gourmet com churrasqueira. Em volta, 360° de mar e morros.</p>
              <ul className="fl-chips"><li>Piscina com infraestrutura para aquecimento</li><li>Espaço gourmet</li><li>Churrasqueira</li><li>Vista 360°</li></ul>
            </div>
            <div className="fl-dupla-fotos">
              <div className="fl-foto fl-r-16-9 fl-surge"><Image src={`${IMG}/rooftop-aereo.jpg`} alt="Vista aérea do The Roof com a piscina e o mar ao fundo" fill sizes="(max-width: 860px) 100vw, 58vw" /><span className="fl-legenda">The Roof visto de cima</span></div>
              <div className="fl-foto fl-r-16-9 fl-surge"><Image src={`${IMG}/piscina-2.jpg`} alt="Borda da piscina do The Roof com a cidade e os morros ao fundo" fill sizes="(max-width: 860px) 100vw, 40vw" /><span className="fl-legenda">Piscina</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* Escolha seu andar */}
      <AoVer as="section" evento="view_location" detalhe={{ empreendimento: e.slug, tipo_pagina: "vista-andares" }} className="fl-sec fl-noite">
        <div className="fl-wrap">
          <div className="fl-cab fl-surge">
            <div className="fl-pilha">
              <p className="fl-rot">Vista dos andares</p>
              <h2 className="fl-h2">Escolha seu andar. Veja a vista de verdade.</h2>
            </div>
            <p className="fl-p">Subimos um drone, andar por andar, no terreno do Flow. Escolha a direção e arraste: é exatamente isso que se vê da janela.</p>
          </div>
          <VistaAndares />
        </div>
      </AoVer>

      {/* 5 · Receber bem */}
      <section className="fl-sec fl-clr-2">
        <div className="fl-wrap">
          <div className="fl-cab fl-surge">
            <div className="fl-pilha">
              <p className="fl-rot">The Roof · para receber</p>
              <h2 className="fl-h2">A família e os amigos cabem. E voltam.</h2>
            </div>
            <p className="fl-p">Salão de festas, pub e brinquedoteca no último andar, com pé-direito duplo e vista. O aniversário, o jogo, o fim de ano: tudo acontece no prédio, sem apertar o apartamento.</p>
          </div>
          <div className="fl-mosaico">
            <div className="fl-foto fl-r-4-5 fl-surge" style={{ aspectRatio: "auto", minHeight: 360 }}><Image src={`${IMG}/salao-festas.jpg`} alt="Salão de festas do Flow com pé-direito duplo, bancada e vista" fill sizes="(max-width: 860px) 100vw, 55vw" /><span className="fl-legenda">Salão de festas</span></div>
            <div className="fl-foto fl-r-16-9 fl-surge"><Image src={`${IMG}/pub.jpg`} alt="Pub do Flow com bancos altos e painel colorido" fill sizes="(max-width: 860px) 100vw, 45vw" style={{ objectPosition: "center 60%" }} /><span className="fl-legenda">Pub</span></div>
            <div className="fl-foto fl-r-16-9 fl-surge"><Image src={`${IMG}/brinquedoteca.jpg`} alt="Brinquedoteca do Flow com foguete escorregador e janelas para a cidade" fill sizes="(max-width: 860px) 100vw, 45vw" /><span className="fl-legenda">Brinquedoteca</span></div>
          </div>
          <p className="fl-nota" style={{ marginTop: 16 }}>Imagens ilustrativas. Todos os ambientes são entregues mobiliados, decorados, equipados e com enxoval.</p>
        </div>
      </section>

      {/* 6 · Apartamentos */}
      <section id="plantas" className="fl-sec fl-clr" style={{ scrollMarginTop: 72 }}>
        <div className="fl-wrap">
          <div className="fl-tam">
            <div className="fl-pilha fl-pilha--g fl-surge">
              <p className="fl-rot">Os apartamentos</p>
              <h2 className="fl-h2">Compactos por escolha. Completos por projeto.</h2>
              <p className="fl-p">São 62 e 73 m² com duas suítes, e cada metro tem função. O apartamento não precisa de academia, escritório nem salão de festas, porque o prédio tem. Você paga pelo espaço que usa todos os dias, e usa o resto quando quiser.</p>
            </div>
            <div className="fl-equacao fl-surge">
              <div><b>2</b><span>suítes em todos os apartamentos</span></div>
              <div><b>+600</b><span>m² de lazer, em dois andares, que funcionam como extensão da casa</span></div>
              <div><b>12</b><span>ambientes entregues prontos para usar</span></div>
              <div><b>1</b><span>viagem de elevador entre você e tudo isso</span></div>
            </div>
          </div>
          <div className="fl-foto fl-r-16-9 fl-surge" style={{ marginTop: 64 }}><Image src={`${IMG}/apto-living.jpg`} alt="Living integrado de um apartamento do Flow, com sofá, cozinha e janela ampla" fill sizes="100vw" /><span className="fl-legenda">Living · imagem ilustrativa</span></div>
          <div className="fl-plantas">
            <SeletorPlantas slug={e.slug} nome={e.nome} plantas={e.plantas} inicial={plantaInicial} />
          </div>
        </div>
      </section>

      {/* Duplex */}
      <section className="fl-sec fl-esc" aria-labelledby="fl-duplex">
        <div className="fl-wrap fl-duplex">
          <div className="fl-pilha fl-pilha--g">
            <p className="fl-rot fl-surge">Duplex · 93 e 117,7 m² · 3 suítes</p>
            <div className="fl-pd fl-surge">
              <span className="fl-pd__regua" aria-hidden="true" />
              <div className="fl-pilha">
                <p className="fl-num">4,90<small>m</small></p>
                <h2 id="fl-duplex" className="fl-h2">de pé-direito no living. Todo em vidro.</h2>
              </div>
            </div>
            <p className="fl-p fl-surge">Os duplex são os apartamentos mais diferentes do Flow. O living sobe dois andares, com uma parede inteira de vidro voltada para a cidade, e a suíte fica no piso de cima, reservada. Não existem muitos iguais, e é essa a ideia.</p>
            <div className="fl-dupla-fotos" style={{ marginTop: 16 }}>
              <div className="fl-foto fl-r-16-9 fl-surge"><Image src={`${IMG}/duplex-490.jpg`} alt="Living de duplex do Flow com pé-direito de 4,90 m, estante até o teto e janela de vidro" fill sizes="(max-width: 1000px) 100vw, 45vw" /><span className="fl-legenda">Pé-direito de 4,90 m</span></div>
              <div className="fl-foto fl-r-16-9 fl-surge"><Image src={`${IMG}/suite-duplex.jpg`} alt="Suíte no piso superior de um duplex do Flow" fill sizes="(max-width: 1000px) 100vw, 30vw" /><span className="fl-legenda">Suíte do piso superior</span></div>
            </div>
            <div className="fl-acoes fl-surge">
              <Link className="fl-bt" href={`/empreendimentos/${e.slug}/plantas/duplex-tipo-1#plantas`}>Ver planta do duplex</Link>
              <LinkWhatsApp className="fl-bt fl-bt--linha" botao="duplex" empreendimento={e.slug} mensagem="Olá! Quero saber quais duplex do Flow Aptos ainda estão disponíveis.">Duplex disponíveis</LinkWhatsApp>
            </div>
          </div>
          <div className="fl-surge" style={{ maxWidth: 380, width: "100%", justifySelf: "center" }}>
            <VideoVertical src={`${VID}/unidade-1601.mp4`} poster={`${IMG}/poster-unidade-1601.jpg`} nome="Unidade 1601, o exclusivo" legenda="Pé-direito duplo, por dentro da obra · 1min49" video="unidade-1601" />
          </div>
        </div>
      </section>

      {/* 7 · O que está incluído */}
      <AoVer as="section" evento="view_engineering" detalhe={{ empreendimento: e.slug }} className="fl-sec fl-clr">
        <div className="fl-wrap">
          <div className="fl-cab fl-surge">
            <div className="fl-pilha">
              <p className="fl-rot">O que vem junto</p>
              <h2 className="fl-h2">O preço do metro quadrado conta só parte da história.</h2>
            </div>
            <p className="fl-p">Comparar o Flow pelo valor do metro é comparar apartamento com apartamento. O que está incluído aqui não aparece nessa conta: lazer pronto, decorado e equipado, e decisões de engenharia que você só percebe morando.</p>
          </div>
          <div className="fl-listas">
            <div className="fl-pilha fl-surge"><h3 className="fl-h3">No condomínio</h3><ul className="fl-lista">{CONDOMINIO.map((x) => <li key={x}>{x}</li>)}</ul></div>
            <div className="fl-pilha fl-surge"><h3 className="fl-h3">No apartamento</h3><ul className="fl-lista">{APARTAMENTO.map((x) => <li key={x}>{x}</li>)}</ul></div>
          </div>
          <ol className="fl-eng">
            {ENGENHARIA.map((x) => (
              <li key={x.titulo} className="fl-surge"><b>{x.valor}</b><h3 className="fl-h3">{x.titulo}</h3><p className="fl-p" style={{ fontSize: 16 }}>{x.texto}</p></li>
            ))}
          </ol>
          <div className="fl-aluguel fl-esc fl-pontos fl-surge">
            <div className="fl-pilha">
              <p className="fl-rot">Para quem compra para alugar</p>
              <h3 className="fl-h2" style={{ fontSize: "clamp(28px, 3vw, 40px)" }}>Duas suítes, mar perto, prédio completo.</h3>
            </div>
            <div className="fl-pilha">
              <p className="fl-p">É a combinação que quem procura aluguel na praia valoriza: espaço para uma família pequena ou dois casais, lazer que dispensa sair do prédio e a praia a três minutos. Nosso time conversa com você sobre o perfil da região.</p>
              <p className="fl-nota">Informações de caráter geral, sem promessa de rentabilidade.</p>
            </div>
          </div>
        </div>
      </AoVer>

      {/* 8 · Quem já comprou */}
      <section className="fl-sec fl-esc">
        <div className="fl-wrap">
          <div className="fl-pilha fl-surge" style={{ maxWidth: 760 }}>
            <p className="fl-rot">Quem já comprou</p>
            <h2 className="fl-h2">A melhor indicação vem de quem já é vizinho.</h2>
          </div>
          <div className="fl-depo">
            <div className="fl-surge"><VideoVertical src={`${VID}/augusto.mp4`} poster={`${IMG}/poster-augusto.jpg`} nome="Augusto" legenda="Cliente Flow · 1min30" video="depoimento-augusto" /></div>
            <div className="fl-surge"><VideoVertical src={`${VID}/natalia.mp4`} poster={`${IMG}/poster-natalia.jpg`} nome="Natália" legenda="Cliente Flow · 59s" video="depoimento-natalia" /></div>
            <div className="fl-depo__texto fl-surge">
              <p className="fl-lead" style={{ color: "var(--nev)" }}>O Augusto conheceu o Flow por um amigo que já tinha comprado. Através desse amigo, vários outros do grupo também compraram.</p>
              <p className="fl-p">Ele conta o que chamou a atenção no projeto e como foi atendido. A Natália mostra a visita que fez à obra.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 9 · A obra de perto */}
      <AoVer as="section" evento="view_construction" detalhe={{ empreendimento: e.slug, edicao: ed.numero, percentual: ed.percentual }} className="fl-sec fl-clr-2">
        <div className="fl-wrap fl-obra">
          <div className="fl-pilha fl-pilha--g">
            <div className="fl-pilha fl-surge">
              <p className="fl-rot">A obra · edição nº {ed.numero}</p>
              <div className="fl-contagem">
                <p className="fl-num">
                  <MesesAteEntrega entregaIso={e.entregaIso} inicial={mesesBuild} /><small>meses</small>
                </p>
              </div>
              <h2 className="fl-h2" style={{ fontSize: "clamp(28px, 3.4vw, 48px)" }}>para as chaves. A torre já está fechada de baixo a cima.</h2>
            </div>
            <div className="fl-surge"><Andamento ed={ed} nome="Flow Aptos" cor="var(--g)" /></div>
            <p className="fl-p fl-surge">{ed.resumo}</p>
            <div className="fl-acoes fl-surge">
              <Link href={`/obras/${e.slug}/${ed.mes}`} className="fl-bt">Ler a edição de {ed.mesExtenso.split(" ")[0]}</Link>
              <Link href="/obras" className="fl-bt fl-bt--linha">Todas as edições</Link>
            </div>
          </div>
          <div className="fl-pilha fl-surge" style={{ maxWidth: 380, width: "100%", justifySelf: "center" }}>
            <VideoVertical src={`${VID}/obra.mp4`} poster={`${IMG}/poster-obra.jpg`} nome="Fábio, diretor de incorporações" legenda="Na obra do Flow · 1min22" video="obra-flow" />
            <p className="fl-nota">A Bossa entregou o Jazz um ano e oito meses antes do prazo e o Soul no prazo, mesmo com a pandemia no meio da obra.</p>
          </div>
        </div>
      </AoVer>

      {/* 10 · Localização */}
      <AoVer as="section" evento="view_location" detalhe={{ empreendimento: e.slug }} className="fl-sec fl-esc">
        <div className="fl-wrap fl-local">
          <div className="fl-foto fl-r-16-9 fl-surge"><Image src={`${IMG}/localizacao-aereo.jpg`} alt="Vista aérea do Balneário Perequê com o terreno do Flow marcado, o mar e a Baía de Porto Belo ao fundo" fill sizes="(max-width: 960px) 100vw, 56vw" /></div>
          <div className="fl-pilha fl-pilha--g fl-surge">
            <div className="fl-pilha">
              <p className="fl-rot">Localização</p>
              <h2 className="fl-h2">Rua São José, 163. Balneário Perequê.</h2>
              <p className="fl-p">Duas entradas, pela Rua São José e pela Rua Santa Terezinha. Mercado, escola, farmácia e a via gastronômica por perto, e o acesso à BR-101 a poucos minutos.</p>
            </div>
            <ul className="fl-dados">
              <li><span>Praia do Perequê</span><span>800 m</span></li>
              {distanciasFlow.slice(1).map(([a, b]) => <li key={a}><span>{a}</span><span>{b}</span></li>)}
            </ul>
            <LinkRastreado externo className="fl-bt fl-bt--linha" evento="click_route" detalhe={{ empreendimento: e.slug }} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.endereco}, ${e.bairro}, ${e.cidade} - SC`)}`}>Abrir rota no mapa</LinkRastreado>
          </div>
        </div>
      </AoVer>

      {/* 11 · Fechamento */}
      <section id="visita" className="fl-sec fl-noite fl-pontos" style={{ scrollMarginTop: 72 }}>
        <div className="fl-wrap">
          <Beat />
          <div className="fl-fecho" style={{ marginTop: 48 }}>
            <div className="fl-pilha fl-pilha--g">
              <Image src={`${IMG}/logo-claro.png`} alt="" width={1100} height={197} style={{ width: 220, height: "auto" }} />
              <h2 className="fl-h1" style={{ fontSize: "clamp(40px, 5.4vw, 80px)" }}>Venha sentir o ritmo de perto.</h2>
              <p className="fl-p">Visite o decorado ou a obra, receba o book com plantas e acabamentos, ou fale agora com a gente pelo WhatsApp.</p>
              <div className="fl-acoes">
                <LinkWhatsApp className="fl-bt" botao="fechamento" empreendimento={e.slug} mensagem="Olá! Estou vendo o Flow Aptos no site e gostaria de mais informações.">Conversar pelo WhatsApp</LinkWhatsApp>
                <LinkWhatsApp className="fl-bt fl-bt--linha" botao="condicoes" empreendimento={e.slug} mensagem="Olá! Gostaria de receber a tabela e as condições do Flow Aptos.">Receber a tabela</LinkWhatsApp>
              </div>
            </div>
            <div className="fl-pilha">
              <AoVer evento="view_price" detalhe={{ empreendimento: e.slug, faixa: "crm" }}>
                <div className="fl-form">
                  <p className="fl-rot" style={{ marginBottom: 20 }}>Agendar visita</p>
                  <FormLead formulario="visita" empreendimento={e.slug} data botao="Pedir visita" sucesso="Pedido recebido. Vamos confirmar data e horário pelo WhatsApp." />
                </div>
              </AoVer>
              <div className="fl-form">
                <p className="fl-rot" style={{ marginBottom: 20 }}>Receber o book</p>
                <FormLead formulario="book" empreendimento={e.slug} interesse botao="Receber o book" sucesso="Pronto. O book do Flow chega no seu WhatsApp em instantes." />
              </div>
            </div>
          </div>
          <div className="fl-faq">
            <div className="fl-pilha"><p className="fl-rot">Perguntas</p><h2 className="fl-h2" style={{ fontSize: "clamp(28px, 3vw, 40px)" }}>O que mais nos perguntam sobre o Flow.</h2></div>
            <Perguntas itens={faq} />
          </div>
          <p className="fl-nota" style={{ marginTop: 48 }}>{notaLegal} Andamento da obra: {ed.percentual.toLocaleString("pt-BR")}% em {ed.mesExtenso}.</p>
        </div>
      </section>
    </div>
  );
}
