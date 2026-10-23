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
  fotosEngenhariaFlow,
} from "@/content/flow";
import { notaLegal, SITE_URL } from "@/content/site";
import { empreendimentoLd, perguntasLd, migalhasLd } from "@/lib/seo";
import { rastrear } from "@/lib/rastreio";
import { JsonLd } from "../Blocos";
import { FormLead } from "../FormLead";
import { LinkWhatsApp } from "../LinkWhatsApp";
import { LinkRastreado } from "../LinkRastreado";
import { VerEmpreendimento } from "../VerEmpreendimento";
import { FotoFlow, ExposicaoFlow } from "./Experiencia";
import { PlantasFlow } from "./PlantasFlow";
import { VistaAndares } from "./VistaAndares";
import { VideoAbertura } from "./Clientes";
import { NavegacaoFlow } from "./NavegacaoFlow";
import { GaleriaMove } from "./GaleriaMove";
import { VideoFlowModal } from "./VideoFlowModal";
import { AlvenariaFlow } from "./AlvenariaFlow";
import { MantaAcusticaFlow } from "./MantaAcusticaFlow";
const I = "/img/flow",
  V = "/video/flow";
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
    [barra, setBarra] = useState(false),
    [vista, setVista] = useState(""),
    [duplexVitrine, setDuplexVitrine] = useState(0);
  const p = e.plantas[indice],
    ed = e.edicoes[0],
    trocas = useRef(0),
    inicial = useRef(plantaInicial),
    msg = `${mensagemFlow(contexto ? p : undefined)}${vista ? " " + vista : ""}`;
  useEffect(() => {
    const m = contexto ? flowMetaPlanta(p) : flowMeta;
    const url = `${SITE_URL}/empreendimentos/${e.slug}${contexto ? "/plantas/" + p.slug : ""}`;
    document.title = m.titulo;
    for (const [seletor, valor] of [
      ["meta[name=description]", m.descricao],
      ["meta[property='og:title']", m.titulo],
      ["meta[property='og:description']", m.descricao],
      ["meta[property='og:url']", url],
      ["meta[name='twitter:title']", m.titulo],
      ["meta[name='twitter:description']", m.descricao],
    ])
      document.querySelector(seletor)?.setAttribute("content", valor);
    document.querySelector("link[rel=canonical]")?.setAttribute("href", url);
  }, [contexto, p, e.slug]);
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
          !document.querySelector(".fl-nav[data-aberto=true]") &&
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
    for (const ev of [
      "scroll",
      "resize",
      "focusin",
      "focusout",
      "flow:modal",
      "flow:menu",
    ])
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
        "flow:menu",
      ])
        removeEventListener(ev, atualizar);
    };
  }, []);
  const wa = (texte: string, botao: string, visita = false, linha = false) => (
    <LinkWhatsApp
      className={`fl-bt ${linha ? "fl-bt--linha" : ""}`}
      mensagem={
        visita
          ? `${mensagemFlow(contexto ? p : undefined, true)}${vista ? " " + vista : ""}`
          : msg
      }
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
      <JsonLd
        dados={migalhasLd([
          { nome: "Início", href: "/" },
          { nome: "Empreendimentos", href: "/empreendimentos" },
          { nome: "Flow Aptos", href: "/empreendimentos/flow-aptos" },
          ...(contexto
            ? [
                {
                  nome: p.nome,
                  href: `/empreendimentos/flow-aptos/plantas/${p.slug}`,
                },
              ]
            : []),
        ])}
      />
      <JsonLd dados={perguntasLd(faqFlow)} />
      <div id="fl-consentimento" />
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
            Apartamentos de 62 e 73 m² com duas suítes. Duplex com três suítes.
            Flow Move no 5º pavimento e The Roof no 24º para ampliar as
            possibilidades de cada dia, no Balneário Perequê, em Porto Belo.
          </p>
          <ul className="fl-fatos">
            <li>57 apartamentos</li>
            <li>Lazer em dois pavimentos</li>
            <li>Entrega prevista: novembro de 2027</li>
          </ul>
          <div className="fl-acoes fl-abertura-acoes">
            <a className="fl-bt" href="#opcoes-flow">
              Explorar as plantas
            </a>
            <a className="fl-bt fl-bt--linha" href="#visita">
              Agendar visita
            </a>
          </div>
          <p className="fl-nota">Perspectiva ilustrativa em movimento.</p>
        </div>
      </section>
      <NavegacaoFlow />
      <section id="plantas" className="fl-sec fl-clr">
        <div className="fl-wrap">
          <Cab
            rotulo="OS APARTAMENTOS"
            titulo="O espaço certo para o seu jeito de viver."
          >
            Nos apartamentos tipo, são duas suítes e configurações que
            acompanham rotinas diferentes. Compare as plantas, a orientação
            solar informada no projeto e escolha o desenho que mais combina com
            você.
          </Cab>
          <PlantasFlow
            e={e}
            indice={indice}
            escolher={escolher}
            contextoVista={vista}
          />
        </div>
      </section>
      <div id="lazer" className="fl-distancia">
        <div className="fl-wrap">
          <p>
            Balneário Perequê, Porto Belo <span>·</span> Aproximadamente 800 m
            da Praia do Perequê, conforme distância divulgada <span>·</span>{" "}
            Entrega prevista para novembro de 2027.
          </p>
          <a href="#localizacao-flow">Ver localização ↗</a>
        </div>
      </div>
      <section id="duplex" className="fl-sec fl-clr">
        <div className="fl-wrap">
          <Cab
            rotulo="DUPLEX · TRÊS SUÍTES"
            titulo="Dois níveis. Outra forma de morar."
          >
            Os duplex do Flow reúnem três suítes, living com pé-direito duplo e
            uma organização em dois níveis. Conheça as opções de 93 e 117,7 m².
          </Cab>
          <div className="fl-duplex-resumo">
            <FotoFlow
              sizes="(max-width:860px) 100vw, 60vw"
              src={`${I}/duplex-490.jpg`}
              alt="Perspectiva ilustrativa de living duplex do acervo do Flow"
              titulo="Living duplex · perspectiva ilustrativa"
              legenda="Imagem do acervo do Flow. Consulte a configuração de cada planta com a equipe."
            />
            <div>
              <div
                className="fl-duplex-escolhas"
                role="group"
                aria-label="Visualizar opções de duplex"
              >
                {e.plantas.slice(3).map((q, j) => (
                  <button
                    key={q.slug}
                    aria-pressed={j === duplexVitrine}
                    onClick={() => setDuplexVitrine(j)}
                  >
                    {q.area}
                  </button>
                ))}
              </div>
              <div className="fl-duplex-editorial">
                {e.plantas.slice(3).map((q, j) => (
                  <article key={q.slug} data-ativo={j === duplexVitrine}>
                    <h3 className="fl-h3">{q.area} · 3 suítes</h3>
                    <p>
                      {j === 0
                        ? "Living de pé-direito duplo."
                        : "Living com 4,90 m de pé-direito no Tipo 1."}
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
                      Ver a planta de {q.area}
                    </button>
                    <LinkWhatsApp
                      className="fl-book-link"
                      empreendimento={e.slug}
                      planta={q.slug}
                      botao="flow_duplex"
                      mensagem={`Olá! Quero conversar sobre o ${q.nome}, ${q.area}, ${q.suites} suítes, do Flow Aptos. ${vista}`}
                    >
                      Conversar sobre este duplex
                    </LinkWhatsApp>
                  </article>
                ))}
              </div>
            </div>
          </div>
          <div className="fl-video-destaque">
            <VideoFlowModal
              src={`${V}/unidade-1601.mp4`}
              poster={`${I}/poster-unidade-1601.jpg`}
              nome="Registro da unidade 1601"
              legenda="Registro real na obra"
              video="unidade-1601"
            />
            <p className="fl-nota">
              Registro da unidade 1601, sem indicação de disponibilidade. As
              configurações variam conforme a planta.
            </p>
          </div>
        </div>
      </section>
      <section id="the-roof" className="fl-sec fl-fundo">
        <div className="fl-wrap">
          <Cab
            rotulo="THE ROOF · 24º PAVIMENTO"
            titulo="Lá em cima, o dia ganha outro ritmo."
          >
            Piscina com infraestrutura para aquecimento, salão de festas, pub,
            brinquedoteca e espaço gourmet formam um pavimento para encontros,
            descanso e bons momentos.
          </Cab>
          <div className="fl-roof-editorial">
            <FotoFlow
              sizes="(max-width:1440px) 100vw, 1320px"
              src={`${I}/piscina.jpg`}
              alt="Perspectiva ilustrativa da piscina do The Roof, 24º pavimento"
              titulo="Piscina · The Roof"
            />
            <div className="fl-roof-apoio">
              {[
                ["salao-festas", "Salão de festas"],
                ["pub", "Pub"],
                ["brinquedoteca", "Brinquedoteca"],
                ["rooftop-aereo", "The Roof — vista geral"],
              ].map(([src, nome]) => (
                <FotoFlow
                  key={src}
                  src={`${I}/${src}.jpg`}
                  alt={`Perspectiva ilustrativa: ${nome}, 24º pavimento`}
                  titulo={nome}
                />
              ))}
            </div>
          </div>
          <details className="fl-distribuicao">
            <summary>Ver distribuição do 24º pavimento</summary>
            <FotoFlow
              inteira
              src={`${I}/planta-the-roof.jpg`}
              alt="Planta ilustrativa dos ambientes do The Roof, 24º pavimento"
              titulo="Planta ilustrativa do 24º pavimento"
              legenda="Áreas comuns do The Roof. Amplie para consultar a distribuição."
            />
          </details>
          <a className="fl-bt" href="#visita">
            Quero conhecer o The Roof
          </a>
        </div>
      </section>
      <section id="flow-move" className="fl-sec fl-clr-2">
        <div className="fl-wrap">
          <Cab
            rotulo="FLOW MOVE · 5º PAVIMENTO"
            titulo="Mais espaço para o dia acontecer."
          >
            Coworking, fitness, Flow Store, lavanderia, Cine Flow e ambientes
            para brincar e pausar ampliam as possibilidades da rotina, dentro do
            próprio edifício.
          </Cab>
          <GaleriaMove />
          <details className="fl-distribuicao">
            <summary>Ver planta do Flow Move</summary>
            <FotoFlow
              inteira
              src={`${I}/planta-flow-move.jpg`}
              alt="Planta ilustrativa dos ambientes do Flow Move, 5º pavimento"
              titulo="Planta ilustrativa do 5º pavimento"
              legenda="Áreas comuns do Flow Move. Amplie para consultar a distribuição."
            />
          </details>
          <p className="fl-nota">
            Os espaços de conveniência não representam promessa de serviços ou
            horários de operação.
          </p>
          <a className="fl-bt" href="#visita">
            Quero visitar o Flow
          </a>
        </div>
      </section>
      <section id="vistas" className="fl-sec fl-noite">
        <div className="fl-wrap">
          <Cab
            rotulo="REFERÊNCIAS REAIS DE DRONE"
            titulo="Cada altura revela uma perspectiva."
          >
            Explore referências reais de drone em diferentes direções e alturas.
            Compare o que se vê em cada posição e escolha as perspectivas sobre
            as quais deseja conversar com a Bossa.
          </Cab>
          <VistaAndares onContexto={setVista} />
        </div>
      </section>
      <section id="engenharia" className="fl-sec fl-clr-2">
        <div className="fl-wrap">
          <ExposicaoFlow evento="view_engineering">
            <Cab
              rotulo="ENGENHARIA · JEITO BOSSA"
              titulo="O conforto começa antes dos acabamentos."
            >
              Do material das paredes aos cuidados de execução, conheça as
              escolhas da Bossa para o conforto do Flow — e veja registros
              reais da alvenaria e do isolamento sob o contrapiso.
            </Cab>
            <AlvenariaFlow />
            <MantaAcusticaFlow />
            <div className="fl-engenharia">
              {engenhariaFlow.map(([t, b, r]) => {
                const foto = fotosEngenhariaFlow[t];
                return (
                  <article key={t}>
                    {foto && (
                      <FotoFlow
                        src={foto.src}
                        alt={foto.alt}
                        titulo={t}
                        legenda={`Registro real · ${foto.mesAno} · ${foto.pavimento}. ${foto.atividade}`}
                      />
                    )}
                    <h3 className="fl-h3">{t}</h3>
                    <p className="fl-p">{b}</p>
                    <p className="fl-nota">{r}</p>
                    {t.startsWith("Áreas") || t.startsWith("Esquadrias") ? (
                      <Link href="/obras/flow-aptos/2026-09">
                        Ver etapa no boletim ↗
                      </Link>
                    ) : (
                      <a href="#visita">Conhecer o detalhamento ↗</a>
                    )}
                  </article>
                );
              })}
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
              titulo="A obra avança. Você acompanha cada etapa."
            >
              O Flow tem entrega prevista para novembro de 2027. A Bossa publica
              boletins para acompanhar o andamento dos serviços e mostrar como o
              empreendimento está sendo executado.
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
                <p className="fl-nota">
                  Entregas anteriores são fatos do histórico da Bossa e não
                  garantem antecipação do Flow.
                </p>
              </div>
              <div>
                <VideoFlowModal
                  src={`${V}/obra.mp4`}
                  poster={`${I}/poster-obra.jpg`}
                  nome="Fábio apresenta a obra do Flow"
                  legenda="Registro real da obra do Flow"
                  video="obra-flow"
                />
              </div>
            </div>
          </ExposicaoFlow>
          <div className="fl-entregues">
            <h3 className="fl-h3">Bossa já entregou.</h3>{" "}
            <div className="fl-dois">
              <article>
                <FotoFlow
                  src="/img/jazz-1.jpg"
                  alt="Fotografia do Jazz Residence entregue"
                  titulo="Jazz Residence"
                  legenda="Empreendimento entregue · registro real"
                />
                <h3 className="fl-h3">Jazz</h3>
                <p>Entregue em setembro de 2019.</p>
                <Link href="/empreendimentos/jazz-residence">
                  Conhecer o Jazz
                </Link>
              </article>
              <article>
                <FotoFlow
                  src="/img/soul-3.jpg"
                  alt="Fotografia do Soul Residence entregue"
                  titulo="Soul Residence"
                  legenda="Empreendimento entregue · registro real"
                />
                <h3 className="fl-h3">Soul</h3>
                <p>Entregue em dezembro de 2023.</p>
                <Link href="/empreendimentos/soul-residence">
                  Conhecer o Soul
                </Link>
              </article>
            </div>
          </div>
          <div className="fl-clientes">
            <h3 className="fl-h3">Quem já conheceu o Flow</h3>
            <p>Augusto e Natália compartilham suas experiências com o Flow.</p>
            <div className="fl-dois">
              <VideoFlowModal
                src={`${V}/augusto.mp4`}
                poster={`${I}/poster-augusto.jpg`}
                nome="Augusto"
                legenda="Cliente Flow"
                video="depoimento-augusto"
              />
              <VideoFlowModal
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
            titulo="Balneário Perequê. O endereço do Flow."
          >
            Na Rua São José, 163, em Porto Belo, o Flow está a aproximadamente
            800 metros da Praia do Perequê, conforme distância divulgada. O
            percurso efetivo depende do acesso utilizado.
          </Cab>
          <ExposicaoFlow evento="view_location">
            <p className="fl-local-contexto fl-p">
              Conheça o endereço, os ambientes do edifício e a posição do
              apartamento para decidir o que faz mais sentido para a sua rotina.
            </p>
            <FotoFlow
              src={`${I}/localizacao-aereo.jpg`}
              alt="Imagem aérea do entorno do Flow Aptos no Balneário Perequê"
              titulo="Balneário Perequê · Porto Belo"
              legenda="Imagem aérea do entorno · acervo de localização do Flow."
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
            rotulo="CONHEÇA DE PERTO"
            titulo="Vamos conhecer o Flow de perto?"
          >
            Escolha a planta que mais chamou sua atenção e converse com a equipe
            Bossa. Vamos combinar uma visita e esclarecer as condições atuais
            para as opções de seu interesse.
          </Cab>
          <div className="fl-conversao">
            <div className="fl-pilha fl-conversao-foto">
              <FotoFlow
                src={`${I}/hall.jpg`}
                alt="Perspectiva ilustrativa do hall do Flow Aptos"
                titulo="Seu próximo passo começa aqui."
              />
              <p>
                O escritório da Bossa fica no térreo do Flow, na Rua São José,
                163. A equipe confirma data, horário e condições de acesso à
                obra.
              </p>
            </div>
            <div className="fl-form-comercial">
              <div hidden={modo !== "visita"}>
                <h3 className="fl-h3">Solicitar visita</h3>
                <p>
                  Deixe seu contato. Nossa equipe retorna para combinar data e
                  horário.
                </p>
                <FormLead
                  formulario="visita"
                  empreendimento={e.slug}
                  solicitacao
                  botao="Enviar pedido de visita"
                  sucesso="Recebemos seu pedido. Nossa equipe entrará em contato para combinar a visita."
                />
              </div>
              <div hidden={modo !== "book"}>
                <h3 className="fl-h3">Solicitar apresentação do Flow</h3>
                <p>Peça a apresentação à equipe Bossa.</p>
                <FormLead
                  formulario="book"
                  empreendimento={e.slug}
                  solicitacao
                  botao="Solicitar apresentação do Flow"
                  sucesso="Recebemos seu pedido. Nossa equipe entrará em contato para compartilhar a apresentação do Flow."
                />
              </div>
              {wa("Conversar pelo WhatsApp", "flow_form_alternativa", true)}
              <button
                className="fl-book-link"
                onClick={() => setModo(modo === "book" ? "visita" : "book")}
                aria-expanded={modo === "book"}
              >
                {modo === "book"
                  ? "Voltar ao pedido de visita"
                  : "Prefiro solicitar a apresentação do Flow"}
              </button>
              <p className="fl-nota">
                A solicitação não confirma agendamento. A equipe combina data e
                horário.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section id="duvidas-flow" className="fl-sec fl-clr-2">
        <div className="fl-wrap">
          <Cab rotulo="DÚVIDAS" titulo="O que vale saber antes de visitar.">
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
          <a className="fl-bt" href="#visita">
            Solicitar visita
          </a>
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
