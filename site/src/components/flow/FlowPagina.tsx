"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Empreendimento } from "@/content/empreendimentos";
import {
  faqFlow,
  flowMeta,
  flowMetaPlanta,
  mensagemFlow,
  engenhariaFlow,
} from "@/content/flow";
import { notaLegal } from "@/content/site";
import { empreendimentoLd, perguntasLd } from "@/lib/seo";
import { rastrear } from "@/lib/rastreio";
import { JsonLd } from "../Blocos";
import { FormLead } from "../FormLead";
import { LinkWhatsApp } from "../LinkWhatsApp";
import { LinkRastreado } from "../LinkRastreado";
import { VerEmpreendimento } from "../VerEmpreendimento";
import { FotoFlow, ExposicaoFlow } from "./Experiencia";
import { PlantasFlow } from "./PlantasFlow";
import { VistaAndares } from "./VistaAndares";
import { VideoAbertura, VideoVertical } from "./Clientes";
const I = "/img/flow",
  V = "/video/flow";
const move = [
  ["fitness", "Fitness", "Cuidar de você"],
  ["coworking", "Coworking e sala de reuniões", "Trabalhar e se encontrar"],
  ["flow-store", "Flow Store", "Conveniência no próprio edifício"],
  ["playground", "Playground e espaço zen", "Brincar e pausar"],
  ["cine-flow", "Cine Flow", "Aproveitar o tempo livre"],
];
const roof = [
  ["piscina", "Piscina com infraestrutura para aquecimento"],
  ["rooftop-aereo", "The Roof — vista geral"],
  ["salao-festas", "Salão de festas"],
  ["pub", "Pub"],
  ["brinquedoteca", "Brinquedoteca"],
];
function Cab({
  rotulo,
  titulo,
  children,
}: {
  rotulo: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fl-cab-comercial">
      <p className="fl-rot">{rotulo}</p>
      <h2 className="fl-h2">{titulo}</h2>
      <p className="fl-p">{children}</p>
    </div>
  );
}
export function FlowPagina({
  e,
  plantaInicial,
}: {
  e: Empreendimento;
  plantaInicial?: string;
}) {
  const [indice, setIndice] = useState(() =>
      Math.max(
        0,
        e.plantas.findIndex((p) => p.slug === plantaInicial),
      ),
    ),
    [contexto, setContexto] = useState(Boolean(plantaInicial)),
    [modo, setModo] = useState<"visita" | "book">("visita"),
    [barra, setBarra] = useState(false);
  const p = e.plantas[indice],
    ed = e.edicoes[0],
    trocas = useRef(0),
    inicial = useRef(plantaInicial),
    msg = mensagemFlow(contexto ? p : undefined);
  useEffect(() => {
    document.title = contexto ? flowMetaPlanta(p).titulo : flowMeta.titulo;
  }, [contexto, p]);
  useEffect(() => {
    const voltar = () => {
      const slug = location.pathname.split("/plantas/")[1];
      const n = e.plantas.findIndex((x) => x.slug === slug);
      setIndice(Math.max(n, 0));
      setContexto(n >= 0);
    };
    addEventListener("popstate", voltar);
    if (inicial.current) {
      document.fonts.ready.then(() =>
        requestAnimationFrame(() =>
          document
            .getElementById("opcoes-flow")
            ?.scrollIntoView({ block: "start", behavior: "instant" }),
        ),
      );
    }
    return () => removeEventListener("popstate", voltar);
  }, [e.plantas]);
  function escolher(n: number) {
    if (n !== indice) {
      rastrear("switch_floorplan", {
        empreendimento: e.slug,
        de: p.slug,
        para: e.plantas[n].slug,
        ordem: ++trocas.current,
      });
    }
    setIndice(n);
    setContexto(true);
    History.prototype.replaceState.call(
      history,
      history.state,
      "",
      `/empreendimentos/${e.slug}/plantas/${e.plantas[n].slug}${location.search}${location.hash}`,
    );
  }
  useEffect(() => {
    const conferir = () => {
      const abertura = document
          .querySelector(".fl-abertura-acoes")
          ?.getBoundingClientRect(),
        fim = document.getElementById("visita")?.getBoundingClientRect();
      const campo = document.activeElement?.matches("input,select,textarea");
      setBarra(
        Boolean(
          abertura &&
          abertura.bottom < 74 &&
          fim &&
          fim.top >= innerHeight &&
          !campo &&
          !document.querySelector("dialog[open]") &&
          !document.querySelector(".cabecalho__abrir[aria-expanded=true]"),
        ),
      );
    };
    const atualizar = () => requestAnimationFrame(conferir);
    const obs = new MutationObserver(atualizar);
    obs.observe(document.querySelector(".cabecalho")!, {
      attributes: true,
      subtree: true,
      attributeFilter: ["aria-expanded"],
    });
    for (const ev of ["scroll", "resize", "focusin", "focusout", "flow:modal"])
      addEventListener(ev, atualizar);
    const ro = new ResizeObserver(conferir);
    ro.observe(document.body);
    conferir();
    return () => {
      obs.disconnect();
      ro.disconnect();
      for (const ev of [
        "scroll",
        "resize",
        "focusin",
        "focusout",
        "flow:modal",
      ])
        removeEventListener(ev, atualizar);
    };
  }, []);
  const wa = (texte: string, botao: string, visita = false, linha = false) => (
    <LinkWhatsApp
      className={`fl-bt ${linha ? "fl-bt--linha" : ""}`}
      mensagem={visita ? mensagemFlow(contexto ? p : undefined, true) : msg}
      empreendimento={e.slug}
      planta={contexto ? p.slug : undefined}
      botao={botao}
    >
      {texte}
    </LinkWhatsApp>
  );
  return (
    <div className="fl fl-comercial">
      <VerEmpreendimento slug={e.slug} estagio="obra" />
      <JsonLd dados={empreendimentoLd(e)} />
      <JsonLd dados={perguntasLd(faqFlow)} />
      <section id="inicio-flow" className="fl-abertura">
        <VideoAbertura
          src={`${V}/abertura.mp4`}
          poster={`${I}/abertura-poster.jpg`}
        />
        <div className="fl-wrap fl-abertura__conteudo">
          <Image
            className="fl-abertura__logo"
            src={`${I}/logo-claro.png`}
            alt="Flow Aptos"
            width={1100}
            height={197}
            priority
            sizes="(max-width:760px) 180px, 300px"
          />
          <p className="fl-rot">FLOW APTOS · NO RITMO DA NOSSA VIDA.</p>
          <h1 className="fl-h1">Seu apartamento é só o começo.</h1>
          <p className="fl-p">
            Apartamentos de 62 e 73 m² com duas suítes e unidades duplex com
            três suítes. Dois pavimentos de lazer e conveniências para
            aproveitar mais cada momento, no Balneário Perequê, em Porto Belo.
          </p>
          <ul className="fl-fatos">
            <li>57 apartamentos</li>
            <li>Flow Move + The Roof</li>
            <li>Entrega prevista: novembro de 2027</li>
          </ul>
          <div className="fl-acoes fl-abertura-acoes">
            <a className="fl-bt" href="#opcoes-flow">
              Conhecer as plantas
            </a>
            <a className="fl-bt fl-bt--linha" href="#construcao">
              Ver a obra
            </a>
          </div>
          <p className="fl-nota">
            Perspectiva ilustrativa em movimento. No ritmo da nossa vida.
          </p>
        </div>
      </section>
      <nav className="fl-nav" aria-label="Navegação do Flow">
        <a href="#opcoes-flow">Plantas</a>
        <a href="#lazer">Lazer</a>
        <a href="#vistas">Vistas</a>
        <a href="#construcao">Construção</a>
        <a className="fl-nav-visita" href="#visita">
          Agendar visita
        </a>
      </nav>
      <section id="plantas" className="fl-sec fl-clr">
        <div className="fl-wrap">
          <Cab
            rotulo="OS APARTAMENTOS"
            titulo="O espaço certo para o seu jeito de viver."
          >
            Duas suítes nas plantas tipo. Ambientes integrados e configurações
            diferentes para você escolher a que combina com sua rotina.
          </Cab>
          <PlantasFlow e={e} indice={indice} escolher={escolher} />
        </div>
      </section>
      <section id="lazer" className="fl-sec fl-esc">
        <div className="fl-wrap">
          <Cab
            rotulo="Dois pavimentos"
            titulo="A vida acontece dentro e fora do apartamento."
          >
            No Flow, os espaços privativos foram planejados para morar bem. E os
            dois pavimentos de lazer e conveniência oferecem opções para
            trabalhar, encontrar pessoas, cuidar de você e aproveitar o tempo
            livre.
          </Cab>
          <p className="fl-lead">
            Mais de 600 m² declarados de lazer e conveniências, em áreas comuns.
          </p>
          <div className="fl-dois">
            <article>
              <FotoFlow
                src={`${I}/coworking.jpg`}
                alt="Perspectiva do coworking do Flow Move"
                titulo="FLOW MOVE · 5º PAVIMENTO"
              />
              <p>Trabalho, conveniência e pausas no próprio edifício.</p>
              <a className="fl-bt fl-bt--linha" href="#flow-move">
                Conhecer o Flow Move
              </a>
            </article>
            <article>
              <FotoFlow
                src={`${I}/rooftop-aereo.jpg`}
                alt="Perspectiva ilustrativa do The Roof"
                titulo="THE ROOF · 24º PAVIMENTO"
              />
              <p>Encontros e descanso nas áreas comuns do rooftop.</p>
              <a className="fl-bt fl-bt--linha" href="#the-roof">
                Conhecer o The Roof
              </a>
            </article>
          </div>
        </div>
      </section>
      <section id="flow-move" className="fl-sec fl-clr-2">
        <div className="fl-wrap">
          <Cab
            rotulo="FLOW MOVE · 5º PAVIMENTO"
            titulo="Mais praticidade para a vida acontecer."
          >
            Coworking, fitness, Flow Store, lavanderia e espaços para brincar,
            pausar e encontrar os amigos, tudo no próprio edifício.
          </Cab>
          <a href="#ambientes-flow-move" className="fl-bt">
            Ver os ambientes do Flow Move
          </a>
          <div id="ambientes-flow-move" className="fl-galeria">
            <div className="fl-grade-midias">
              {move.map(([src, nome, uso]) => (
                <article key={src}>
                  <FotoFlow
                    src={`${I}/${src}.jpg`}
                    alt={`Perspectiva ilustrativa: ${nome}, Flow Move, 5º pavimento`}
                    titulo={nome}
                  />
                  <p>{uso}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="fl-planta-pavimento">
            <FotoFlow
              inteira
              src={`${I}/planta-flow-move.jpg`}
              alt="Planta ilustrativa dos ambientes do Flow Move, 5º pavimento"
              titulo="Planta ilustrativa do 5º pavimento"
              legenda="Áreas comuns do Flow Move. Amplie para consultar a distribuição."
            />
          </div>
          <p className="fl-nota">
            Os espaços de conveniência não representam promessa de serviços ou
            horários de operação.
          </p>
        </div>
      </section>
      <section id="the-roof" className="fl-sec fl-fundo">
        <div className="fl-wrap">
          <Cab
            rotulo="THE ROOF · 24º PAVIMENTO"
            titulo="Seu tempo livre ganha outra perspectiva."
          >
            No 24º pavimento, piscina com infraestrutura para aquecimento,
            gourmet, pub, brinquedoteca e salão de festas formam os espaços
            pensados para os encontros e o descanso.
          </Cab>
          <div className="fl-grade-midias">
            {roof.map(([src, nome]) => (
              <FotoFlow
                key={src}
                src={`${I}/${src}.jpg`}
                alt={`Perspectiva ilustrativa: ${nome}, The Roof, 24º pavimento`}
                titulo={nome}
              />
            ))}
          </div>
          <div className="fl-planta-pavimento">
            <FotoFlow
              inteira
              src={`${I}/planta-the-roof.jpg`}
              alt="Planta ilustrativa dos ambientes do The Roof, 24º pavimento"
              titulo="Planta ilustrativa do 24º pavimento"
              legenda="Áreas comuns do The Roof. Amplie para consultar a distribuição."
            />
          </div>
        </div>
      </section>
      <section id="vistas" className="fl-sec fl-noite">
        <div className="fl-wrap">
          <Cab
            rotulo="REFERÊNCIAS REAIS DE DRONE"
            titulo="Cada altura, uma perspectiva."
          >
            Explore as imagens realizadas por drone em diferentes alturas e
            direções. A vista de cada apartamento depende de sua localização na
            torre e do entorno.
          </Cab>
          <VistaAndares />
        </div>
      </section>
      <section id="duplex" className="fl-sec fl-clr">
        <div className="fl-wrap">
          <Cab
            rotulo="DUPLEX · TRÊS SUÍTES"
            titulo="Dois níveis. Uma nova dimensão para morar."
          >
            As unidades duplex combinam três suítes com living de pé-direito
            duplo e grandes superfícies envidraçadas. Uma proposta arquitetônica
            diferente das plantas tipo.
          </Cab>
          <div className="fl-dois">
            {e.plantas.slice(3).map((q, j) => (
              <article key={q.slug}>
                <FotoFlow
                  src={`${I}/${j === 0 ? "duplex-tipo23-living" : "duplex-490"}.jpg`}
                  alt={`Perspectiva ilustrativa de living duplex do acervo do Flow`}
                  titulo={`${q.nome} · ${q.area}`}
                />
                <h3 className="fl-h3">{q.area} · 3 suítes</h3>
                <p>
                  {j === 0
                    ? "Living de pé-direito duplo."
                    : "Living com 4,90 m de pé-direito na configuração aprovada."}
                </p>
                <button
                  className="fl-bt"
                  onClick={() => {
                    escolher(j + 3);
                    document
                      .getElementById("opcoes-flow")
                      ?.scrollIntoView({ block: "start" });
                  }}
                >
                  Ver planta de {q.area}
                </button>
              </article>
            ))}
          </div>
          <div className="fl-video-destaque">
            <VideoVertical
              src={`${V}/unidade-1601.mp4`}
              poster={`${I}/poster-unidade-1601.jpg`}
              nome="Registro da unidade 1601"
              legenda="Registro real na obra"
              video="unidade-1601"
            />
            <p className="fl-nota">
              O vídeo mostra a unidade 1601. Não indica disponibilidade nem
              representa necessariamente todas as configurações de duplex.
            </p>
          </div>
        </div>
      </section>
      <section id="engenharia" className="fl-sec fl-clr-2">
        <div className="fl-wrap">
          <ExposicaoFlow evento="view_engineering">
            <Cab
              rotulo="ENGENHARIA · JEITO BOSSA"
              titulo="O cuidado está nos detalhes. Inclusive nos que não aparecem."
            >
              Além dos acabamentos apresentados, a Bossa prevê soluções para
              conforto acústico e térmico, esquadrias normatizadas e detalhes de
              execução que merecem ser vistos de perto.
            </Cab>
            <div className="fl-engenharia">
              {engenhariaFlow.map(([t, b, r]) => (
                <article key={t}>
                  <h3 className="fl-h3">{t}</h3>
                  <p className="fl-p">{b}</p>
                  <p className="fl-nota">{r}</p>
                </article>
              ))}
            </div>
            <a href="#visita" className="fl-bt">
              Conhecer a obra e os acabamentos
            </a>
          </ExposicaoFlow>
        </div>
      </section>
      <section id="construcao" className="fl-sec fl-esc">
        <div className="fl-wrap">
          <ExposicaoFlow evento="view_construction">
            <Cab
              rotulo="ACOMPANHE A OBRA"
              titulo="O projeto está no papel. E a obra está acontecendo."
            >
              O Flow tem entrega prevista para novembro de 2027. Acompanhe a
              execução em fotos, vídeos e edições periódicas divulgadas pela
              Bossa.
            </Cab>
            <div className="fl-obra-comercial">
              <div className="fl-pilha">
                <p className="fl-medicao">
                  {ed.percentual.toLocaleString("pt-BR")}%{" "}
                  <span>· edição {ed.mesExtenso}</span>
                </p>
                <p>
                  Boletim nº {ed.numero} · referência histórica, sem nova
                  medição nesta página.
                </p>
                <p className="fl-p">
                  Estrutura concluída no boletim; alvenaria em 94,55% e
                  esquadrias metálicas em 18%, em setembro de 2026. Os serviços
                  seguem em etapas diferentes.
                </p>
                <Link className="fl-bt" href={`/obras/${e.slug}/${ed.mes}`}>
                  Ler boletim de {ed.mesExtenso}
                </Link>
                <a className="fl-bt fl-bt--linha" href="#visita">
                  Agendar uma visita para conhecer a obra
                </a>
                <div className="fl-dois">
                  <article>
                    <h3 className="fl-h3">Jazz</h3>
                    <p>Entregue em setembro de 2019.</p>
                    <Link href="/empreendimentos/jazz-residence">
                      Conhecer o Jazz
                    </Link>
                  </article>
                  <article>
                    <h3 className="fl-h3">Soul</h3>
                    <p>Entregue em dezembro de 2023.</p>
                    <Link href="/empreendimentos/soul-residence">
                      Conhecer o Soul
                    </Link>
                  </article>
                </div>
                <p className="fl-nota">
                  Entregas anteriores são fatos do histórico da Bossa e não
                  garantem antecipação do Flow.
                </p>
              </div>
              <div>
                <VideoVertical
                  src={`${V}/obra.mp4`}
                  poster={`${I}/poster-obra.jpg`}
                  nome="Fábio apresenta a obra do Flow"
                  legenda="Registro real da obra; data de captura a confirmar"
                  video="obra-flow"
                />
              </div>
            </div>
          </ExposicaoFlow>
          <div className="fl-clientes">
            <h3 className="fl-h3">Quem já conheceu o Flow</h3>
            <p>
              Depoimentos de clientes, com uso autorizado registrado no projeto.
            </p>
            <div className="fl-dois">
              <VideoVertical
                src={`${V}/augusto.mp4`}
                poster={`${I}/poster-augusto.jpg`}
                nome="Augusto"
                legenda="Cliente Flow"
                video="depoimento-augusto"
              />
              <VideoVertical
                src={`${V}/natalia.mp4`}
                poster={`${I}/poster-natalia.jpg`}
                nome="Natália"
                legenda="Cliente Flow"
                video="depoimento-natalia"
              />
            </div>
          </div>
        </div>
      </section>
      <section id="localizacao-flow" className="fl-sec fl-clr">
        <div className="fl-wrap">
          <Cab
            rotulo="LOCALIZAÇÃO"
            titulo="Balneário Perequê. O endereço para a sua rotina."
          >
            Rua São José, 163, em Porto Belo, com acessos previstos pela Rua São
            José e pela Rua Santa Terezinha. A distância divulgada até a Praia
            do Perequê é de aproximadamente 800 metros; o percurso efetivo
            depende do acesso utilizado.
          </Cab>
          <ExposicaoFlow evento="view_location">
            <FotoFlow
              src={`${I}/localizacao-aereo.jpg`}
              alt="Imagem aérea do entorno do Flow Aptos no Balneário Perequê"
              titulo="Balneário Perequê · Porto Belo"
              legenda="Imagem do acervo de localização do Flow. Não corresponde a rota pedonal aferida."
            />
            <LinkRastreado
              externo
              className="fl-bt"
              evento="click_route"
              detalhe={{ empreendimento: e.slug }}
              href="https://www.google.com/maps/search/?api=1&query=Rua%20S%C3%A3o%20Jos%C3%A9%2C%20163%2C%20Porto%20Belo%20SC"
            >
              Ver endereço no mapa
            </LinkRastreado>
          </ExposicaoFlow>
        </div>
      </section>
      <section id="visita" className="fl-sec fl-noite">
        <div className="fl-wrap">
          <Cab
            rotulo="NO RITMO DA NOSSA VIDA."
            titulo="Conheça o Flow de perto."
          >
            Veja as plantas, escolha a unidade que mais combina com você e
            converse com a equipe sobre visita e condições atuais.
          </Cab>
          <div className="fl-conversao">
            <div className="fl-pilha">
              <p>
                O escritório da Bossa fica no térreo do Flow, na Rua São José,
                163. A equipe confirma data, horário e condições de acesso à
                obra.
              </p>
              {wa("Agendar visita", "flow_visita", true)}
              {wa("Conversar pelo WhatsApp", "flow_contato", false, true)}
              <p className="fl-nota">
                A solicitação não confirma um agendamento. A planta consultada
                segue na mensagem de WhatsApp; o formulário registra o pedido
                geral.
              </p>
            </div>
            <div className="fl-form-comercial">
              <div className="fl-form-escolhas">
                <button
                  aria-pressed={modo === "visita"}
                  onClick={() => setModo("visita")}
                >
                  Solicitar visita
                </button>
                <button
                  aria-pressed={modo === "book"}
                  onClick={() => setModo("book")}
                >
                  Solicitar apresentação do Flow
                </button>
              </div>
              <div hidden={modo !== "visita"}>
                <h3 className="fl-h3">Solicitar visita</h3>
                <p>
                  Deixe seu contato. Data e horário serão combinados pela
                  equipe.
                </p>
                <FormLead
                  formulario="visita"
                  empreendimento={e.slug}
                  solicitacao
                  botao="Enviar pedido de visita"
                  sucesso="Pedido recebido. Nossa equipe entrará em contato para combinar data e horário. A visita ainda não está confirmada."
                />
              </div>
              <div hidden={modo !== "book"}>
                <h3 className="fl-h3">Solicitar apresentação do Flow</h3>
                <p>
                  Peça o material à equipe. Não há download automático nesta
                  etapa.
                </p>
                <FormLead
                  formulario="book"
                  empreendimento={e.slug}
                  solicitacao
                  botao="Solicitar apresentação do Flow"
                  sucesso="Recebemos seu pedido. Nossa equipe entrará em contato para compartilhar o material."
                />
              </div>
              {wa("Conversar com a equipe", "flow_form_alternativa")}
            </div>
          </div>
        </div>
      </section>
      <section id="duvidas-flow" className="fl-sec fl-clr-2">
        <div className="fl-wrap">
          <Cab rotulo="DÚVIDAS" titulo="O que você quer saber sobre o Flow?">
            Informações para conhecer o projeto e conversar com a equipe.
          </Cab>
          <div className="fl-faq-comercial">
            {faqFlow.map((q, i) => (
              <details
                key={q.p}
                onToggle={(ev) => {
                  if (ev.currentTarget.open)
                    rastrear("faq_open", {
                      empreendimento: e.slug,
                      pergunta: q.p,
                      ordem: i + 1,
                    });
                }}
              >
                <summary>{q.p}</summary>
                <p className="fl-p">{q.r}</p>
              </details>
            ))}
          </div>
          <p className="fl-nota">
            {notaLegal} Perspectivas ilustrativas do projeto. Andamento
            histórico: {ed.percentual.toLocaleString("pt-BR")}% em{" "}
            {ed.mesExtenso}.
          </p>
        </div>
      </section>
      {barra && (
        <div className="fl-barra" aria-label="Acesso rápido ao Flow">
          <a className="fl-bt" href="#opcoes-flow">
            Plantas
          </a>
          <a className="fl-bt" href="#visita">
            Agendar visita
          </a>
        </div>
      )}
    </div>
  );
}
