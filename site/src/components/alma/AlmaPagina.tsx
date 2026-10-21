"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Empreendimento, Planta } from "@/content/empreendimentos";
import { ALMA_ESTADO, notaAlmaPreRegistro, notaLegal } from "@/content/site";
import {
  almaFaq,
  confortoAlma,
  especificacoesAlma,
  mensagemAlma,
  midiasAprovadasAlma,
  mensagemApresentacao,
  mensagemPlanta,
} from "@/content/alma";
import { empreendimentoLd, perguntasLd } from "@/lib/seo";
import { rastrear } from "@/lib/rastreio";
import { JsonLd } from "../Blocos";
import { FormLead } from "../FormLead";
import { LinkWhatsApp } from "../LinkWhatsApp";
import { LinkRastreado } from "../LinkRastreado";
import { VideoAbertura, VideoVertical, VistaAlma } from "./Clientes";
import { EspacoMidia, Exposicao, FotoAlma, PlantasAlma } from "./Experiencia";

const grupos = [
  {
    nome: "Estar junto",
    titulo: "A água, o jardim e um tempo juntos.",
    texto:
      "Piscina aquecida com prainha e hidromassagem, cercada pelos jardins. Um convite para fazer uma pausa e aproveitar a companhia de quem está com você.",
    ambientes: "Piscina · Prainha · Hidromassagem · Jardins e solarium",
    pavimento: "Lazer e bem-estar",
    fotos: [
      ["piscina", "Piscina e jardins · lazer e bem-estar"],
      ["gourmet-piscina", "Prainha e apoio gourmet · lazer e bem-estar"],
    ],
  },
  {
    nome: "Brincar",
    titulo: "O brincar também tem seu lugar.",
    texto:
      "O playground Casa da Árvore fica no pavimento de lazer. No rooftop, a brinquedoteca Floresta Encantada oferece outro ambiente para as brincadeiras.",
    ambientes:
      "Casa da Árvore — lazer e bem-estar · Floresta Encantada — rooftop",
    pavimento: "Lazer e rooftop",
    fotos: [
      ["playground", "Casa da Árvore · lazer e bem-estar"],
      ["brinquedoteca", "Floresta Encantada · rooftop"],
    ],
  },
  {
    nome: "Receber",
    titulo: "Deixe a conversa se estender.",
    texto:
      "Um almoço junto à piscina, uma comemoração no salão ou um encontro no Jantar Jardim. O Alma reúne ambientes para receber e compartilhar esses momentos.",
    ambientes:
      "Gourmet junto à piscina — lazer e bem-estar · Salão de festas · Jantar Jardim · Pub View · Wine Bar · Fire Place — rooftop",
    pavimento: "Lazer e rooftop",
    fotos: [
      ["gourmet-piscina-noite", "Gourmet junto à piscina · lazer e bem-estar"],
      ["gourmet", "Salão de festas · rooftop"],
      ["jantar-jardim", "Jantar Jardim · rooftop"],
      ["pub", "Pub View · rooftop"],
      ["fireplace", "Terraço com Fire Place · rooftop"],
    ],
  },
  {
    nome: "Cuidar de si",
    titulo: "Cuidar de você também faz parte.",
    texto:
      "Academia, Espaço Vitalidade, casa de banho e sauna seca compõem os ambientes de bem-estar. Espaços para movimento e descanso, no ritmo que fizer sentido para você.",
    ambientes: "Academia · Espaço Vitalidade · Casa de banho · Sauna seca",
    pavimento: "Lazer e bem-estar",
    fotos: [
      ["academia", "Academia · lazer e bem-estar"],
      ["yoga", "Espaço Vitalidade · lazer e bem-estar"],
      ["casa-de-banho", "Casa de banho · lazer e bem-estar"],
      ["sauna", "Sauna seca · lazer e bem-estar"],
    ],
  },
];
const nav = [
  ["apartamentos", "Apartamentos"],
  ["plantas", "Plantas"],
  ["lazer", "Lazer"],
  ["localizacao", "Localização"],
  ["obra", "Obra"],
];
function CabecalhoSecao({
  n,
  titulo,
  sub,
  children,
}: {
  n: string;
  titulo: string;
  sub: string;
  children?: ReactNode;
}) {
  return (
    <div className="al-secao-cab">
      <p className="al-rot">{n} · Alma Sea Houses</p>
      <h2 className="al-h2">{titulo}</h2>
      <p className="al-lead">{sub}</p>
      {children && <p className="al-p">{children}</p>}
    </div>
  );
}

export function AlmaPagina({
  e,
  plantaInicial,
  previa,
}: {
  e: Empreendimento;
  plantaInicial?: string;
  previa: boolean;
}) {
  const [p, setP] = useState(
    () => e.plantas.find((q) => q.slug === plantaInicial) ?? e.plantas[0],
  );
  const [contexto, setContexto] = useState(!!plantaInicial);
  const [ativa, setAtiva] = useState("");
  const [barra, setBarra] = useState(false);
  const [mapa, setMapa] = useState(false);
  const [pavimento, setPavimento] = useState(0);
  const [duplexVideo, setDuplexVideo] = useState(false);
  const [formulario, setFormulario] = useState(false);
  const contato = useRef<HTMLDivElement>(null);
  const ed = e.edicoes[0];
  const percentual = ed.percentual.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
  });
  const faq = almaFaq.map((q) =>
    q.id === "8"
      ? {
          ...q,
          r: `Consulte os boletins de obra disponíveis no site. A edição de ${ed.mesExtenso} informa avanço geral de ${percentual}% naquele período. Para informações mais recentes, converse com a equipe Bossa.`,
        }
      : q,
  );
  function selecionar(q: Planta) {
    setP(q);
    setContexto(true);
    // API nativa sem notificar o roteador: preserva formulário, scroll e contagem de entrada.
    // Conserva o estado interno do Next para navegação Voltar/Avançar.
    History.prototype.replaceState.call(
      window.history,
      window.history.state,
      "",
      `/empreendimentos/${e.slug}/plantas/${q.slug}${location.search}${location.hash}`,
    );
  }
  useEffect(() => {
    const restaurar = () => {
      const slug = location.pathname.split("/plantas/")[1];
      const q = e.plantas.find((x) => x.slug === slug);
      setP(q ?? e.plantas[0]);
      setContexto(!!q);
    };
    addEventListener("popstate", restaurar);
    return () => removeEventListener("popstate", restaurar);
  }, [e.plantas]);
  useEffect(() => {
    const conferir = () => {
      const botoes = document
        .getElementById("al-abertura-acoes")
        ?.getBoundingClientRect();
      const final = contato.current?.getBoundingClientRect();
      const menu = document.querySelector(
        '.cabecalho__abrir[aria-expanded="true"]',
      );
      const modal = document.querySelector("dialog[open]");
      const teclado = ["INPUT", "SELECT", "TEXTAREA"].includes(
        document.activeElement?.tagName ?? "",
      );
      setBarra(
        !!botoes &&
          botoes.bottom < 100 &&
          !!final &&
          final.top > innerHeight &&
          !menu &&
          !modal &&
          !teclado,
      );
      let atual = "";
      for (const [id] of nav) {
        const r = document.getElementById(id)?.getBoundingClientRect();
        if (r && r.top < innerHeight * 0.45) atual = id;
      }
      setAtiva(atual);
    };
    const mo = new MutationObserver(conferir);
    mo.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["open", "aria-expanded"],
    });
    addEventListener("scroll", conferir, { passive: true });
    addEventListener("resize", conferir);
    addEventListener("focusin", conferir);
    addEventListener("focusout", conferir);
    conferir();
    return () => {
      mo.disconnect();
      removeEventListener("scroll", conferir);
      removeEventListener("resize", conferir);
      removeEventListener("focusin", conferir);
      removeEventListener("focusout", conferir);
    };
  }, []);
  useEffect(() => {
    if (formulario)
      document.getElementById("interesse-nome")?.focus({ preventScroll: true });
  }, [formulario]);
  const linksFaq: Record<string, [string, string]> = {
    "1": ["#plantas", "Ver plantas"],
    "5": ["#localizacao", "Ver o trajeto"],
    "6": ["#lazer", "Ver os ambientes"],
    "8": [`/obras/${e.slug}/${ed.mes}`, "Ver boletim"],
  };
  const msg = contexto ? mensagemPlanta(p) : mensagemAlma;
  const wa = (
    botao: string,
    filhos: ReactNode,
    classe = "al-bt",
    apresentacao = false,
  ) => (
    <LinkWhatsApp
      className={classe}
      empreendimento={e.slug}
      planta={contexto ? p.slug : undefined}
      mensagem={
        apresentacao ? mensagemApresentacao(contexto ? p : undefined) : msg
      }
      botao={botao}
    >
      {filhos}
    </LinkWhatsApp>
  );
  return (
    <div className="al al-fase3">
      <JsonLd dados={empreendimentoLd(e)} />
      <JsonLd dados={perguntasLd(faq)} />
      <section id="inicio" className="al-abertura">
        <VideoAbertura
          src="/video/alma/piscina.mp4"
          poster="/img/alma/poster-piscina.jpg"
        />
        <div className="al-wrap al-abertura__conteudo">
          <Exposicao
            evento="view_project"
            detalhe={{ empreendimento: e.slug, estagio: ALMA_ESTADO }}
          >
            <div className="al-pilha">
              <Image
                src="/img/alma/logo-claro.png"
                alt="Alma Sea Houses"
                width={1319}
                height={481}
                priority
                className="al-abertura__logo"
              />
              <p className="al-rot">ALMA SEA HOUSES · PEREQUÊ, PORTO BELO</p>
              <h1 className="al-h1">
                Sua casa na praia.
                <br />
                <span className="al-mao">feita para sua alma.</span>
              </h1>
            </div>
          </Exposicao>
          <p className="al-p">
            Em Perequê, apartamentos de 3 suítes e duplex de 4 suítes, com duas
            vagas e dois apartamentos por andar. Conheça os espaços para a vida
            em família, os encontros e os dias perto da praia.
          </p>
          <p className="al-faixa-dados">
            103 a 168 m² privativos · 2 vagas · Entrega prevista para julho de
            2030
          </p>
          <div id="al-abertura-acoes" className="al-acoes">
            <a href="#plantas" className="al-bt">
              Explorar plantas
            </a>
            {wa(
              "alma_abertura",
              "Conversar sobre o Alma",
              "al-bt al-bt--linha",
            )}
          </div>
          <p>Conheça o projeto e registre seu interesse.</p>
          <p className="al-nota">
            Perspectiva ilustrativa da piscina do projeto.
          </p>
        </div>
      </section>
      <nav className="al-nav" aria-label="Nesta página do Alma">
        {nav.map(([id, nome]) => (
          <a
            key={id}
            href={`#${id}`}
            aria-current={ativa === id ? "location" : undefined}
          >
            {nome}
          </a>
        ))}
      </nav>

      <section id="apartamentos" className="al-sec al-cla">
        <div className="al-wrap">
          <CabecalhoSecao
            n="02"
            titulo="Tempo juntos. Espaço para cada um."
            sub="A casa acompanha tanto os encontros quanto as pausas do dia."
          >
            Living integrado à cozinha, lavabo e opções com três ou quatro
            suítes. Conheça a organização dos ambientes e imagine como a sua
            rotina pode acontecer aqui.
          </CabecalhoSecao>
          <div className="al-interiores">
            <article>
              <FotoAlma
                src={
                  midiasAprovadasAlma.M01?.tipo === "imagem"
                    ? midiasAprovadasAlma.M01.src
                    : "/img/alma/living.jpg"
                }
                alt={
                  midiasAprovadasAlma.M01?.tipo === "imagem"
                    ? midiasAprovadasAlma.M01.alt
                    : "Perspectiva de living integrado à cozinha no projeto do Alma."
                }
                titulo="O encontro acontece aqui."
                legenda={
                  midiasAprovadasAlma.M01?.tipo === "imagem"
                    ? midiasAprovadasAlma.M01.legenda
                    : "Perspectiva ilustrativa de ambiente do projeto."
                }
              />
              {previa && (
                <p className="al-midia-etiqueta" data-midia="M01">
                  M01 · Família no living do Alma — espaço para nova imagem ·
                  16:9
                </p>
              )}
              <p className="al-p">
                Cozinhar e conversar podem fazer parte do mesmo momento. O
                living integrado aproxima a cozinha da vida da casa.
              </p>
            </article>
            <div className="al-interiores-apoio">
              <article>
                <FotoAlma
                  src="/img/alma/suite-master.jpg"
                  alt="Perspectiva de uma suíte do projeto do Alma."
                  titulo="Cada um no seu ritmo."
                  legenda="Perspectiva ilustrativa de ambiente do projeto."
                />
                <p className="al-p">
                  Três ou quatro suítes para acomodar a família e receber
                  pessoas próximas, conforme a planta escolhida.
                </p>
              </article>
              <article>
                <FotoAlma
                  src="/img/alma/duplex.jpg"
                  alt="Perspectiva de living duplex com pé-direito duplo no projeto do Alma."
                  titulo="Uma outra forma de viver a casa."
                  legenda="Perspectiva ilustrativa de ambiente do projeto."
                />
                <p className="al-p">
                  Quatro suítes e pé-direito duplo em opções de 145 e 168 m².
                  Veja as pranchas e converse com a equipe sobre a organização
                  de cada planta.
                </p>
                <details
                  className="al-expansao"
                  onToggle={(ev) => setDuplexVideo(ev.currentTarget.open)}
                >
                  <summary>Ver o living duplex em movimento</summary>
                  {duplexVideo && (
                    <video
                      src="/video/alma/duplex.mp4"
                      poster="/img/alma/poster-duplex.jpg"
                      controls
                      playsInline
                      muted
                      preload="none"
                      onPlay={() =>
                        rastrear("video_play", {
                          empreendimento: e.slug,
                          video: "duplex",
                        })
                      }
                    />
                  )}
                  <p className="al-nota">
                    Animação ilustrativa de um living duplex do projeto.
                  </p>
                </details>
              </article>
            </div>
          </div>
          <a className="al-bt" href="#plantas">
            Explorar as plantas
          </a>
        </div>
      </section>

      <section id="plantas" className="al-sec al-cla-2 al-relevo">
        <div className="al-wrap">
          <CabecalhoSecao
            n="03"
            titulo="Encontre a planta que faz sentido para você."
            sub="Quatro opções para começar a imaginar a sua vida no Alma."
          >
            Compare as áreas privativas, o número de suítes e a configuração de
            cada opção. Amplie as plantas e converse com a equipe sobre o que é
            importante para a sua rotina.
          </CabecalhoSecao>
          <PlantasAlma e={e} p={p} selecionar={selecionar} previa={previa} />
        </div>
      </section>

      <section id="posicao" className="al-sec al-cla">
        <div className="al-wrap">
          <CabecalhoSecao
            n="04"
            titulo="Dois apartamentos por andar. Conheça o conjunto."
            sub="A configuração do edifício também participa da sua escolha."
          >
            O Alma reúne 48 apartamentos, com duas unidades por andar. Conheça
            as plantas e explore os registros do entorno para conversar com a
            equipe sobre as características de cada opção.
          </CabecalhoSecao>
          <div className="al-grade-dupla">
            <FotoAlma
              src="/img/alma/fachada.jpg"
              alt="Perspectiva ilustrativa da fachada do Alma Sea Houses."
              titulo="Dois apartamentos por andar · 48 apartamentos"
              legenda="Perspectiva ilustrativa da fachada do Alma Sea Houses."
            />
            <EspacoMidia id="M06" previa={previa} />
          </div>
          <details className="al-expansao">
            <summary>Explorar as vistas</summary>
            <div className="al-pilha">
              <h3 className="al-h3">Perequê, de outros pontos de vista.</h3>
              <p className="al-p">
                Explore os registros de drone associados a diferentes alturas no
                material do projeto. Eles ajudam a conhecer o entorno; a vista
                de cada apartamento depende da posição e do pavimento.
              </p>
              <p>Vistas de referência do entorno.</p>
              <VistaAlma />
              <details className="al-expansao">
                <summary>Explorar o giro do rooftop</summary>
                <Giro />
              </details>
              <a href="#plantas">Voltar às plantas</a>
            </div>
          </details>
        </div>
      </section>

      <section id="lazer" className="al-sec al-nev al-relevo">
        <div className="al-wrap">
          <CabecalhoSecao
            n="05"
            titulo="Espaços para os dias que vocês querem viver."
            sub="850 m² de lazer distribuídos em dois pavimentos."
          >
            Do banho de piscina ao encontro com os amigos, o Alma reúne
            ambientes para diferentes momentos da vida em família. Conheça os
            espaços do pavimento de lazer e do rooftop.
          </CabecalhoSecao>
          <div className="al-grupos">
            {grupos.map((g) => (
              <article key={g.nome}>
                <p className="al-rot">{g.nome}</p>
                <FotoAlma
                  src={`/img/alma/${g.fotos[0][0]}.jpg`}
                  alt={`Perspectiva de ${g.fotos[0][1]} no projeto do Alma.`}
                  titulo={g.fotos[0][1]}
                  legenda="Perspectiva ilustrativa do projeto."
                />
                <h3 className="al-h3">{g.titulo}</h3>
                <p className="al-p">{g.texto}</p>
                <p className="al-pavimento">{g.pavimento}</p>
                <p>{g.ambientes}</p>
                <details className="al-expansao">
                  <summary>
                    <span className="al-recolhido">Conhecer os ambientes</span>
                    <span className="al-expandido">Recolher ambientes</span>
                  </summary>
                  {g.fotos.slice(1).map(([src, nome]) => (
                    <FotoAlma
                      key={src}
                      src={`/img/alma/${src}.jpg`}
                      alt={`Perspectiva de ${nome} no projeto do Alma.`}
                      titulo={nome}
                      legenda="Perspectiva ilustrativa do projeto."
                    />
                  ))}
                </details>
              </article>
            ))}
          </div>
          <div className="al-sabado-breve">
            <h3 className="al-h3">Um sábado no Alma</h3>
            <p className="al-lead">
              Imagine um dia com tempo para estar junto.
            </p>
            <div className="al-tres">
              {[
                [
                  "De manhã",
                  "Um banho de piscina e uma pausa perto do jardim.",
                ],
                [
                  "À tarde",
                  "Tempo de brincar na Casa da Árvore ou na Floresta Encantada.",
                ],
                [
                  "Ao anoitecer",
                  "Uma refeição no Jantar Jardim e uma conversa que pode durar mais.",
                ],
              ].map(([t, r]) => (
                <div key={t}>
                  <h4>{t}</h4>
                  <p>{r}</p>
                </div>
              ))}
            </div>
          </div>
          <details className="al-expansao">
            <summary>Ver os dois pavimentos</summary>
            <p>Veja em qual pavimento fica cada ambiente.</p>
            <div
              className="al-pranchas"
              role="group"
              aria-label="Pavimentos de lazer"
            >
              {["Lazer e bem-estar", "Rooftop"].map((t, i) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={pavimento === i}
                  onClick={() => setPavimento(i)}
                >
                  {t}
                </button>
              ))}
            </div>
            <FotoAlma
              inteira
              src={`/img/alma/planta-${pavimento === 0 ? "lazer" : "rooftop"}.jpg`}
              alt={
                pavimento === 0
                  ? "Planta humanizada do pavimento de lazer, incluindo garagem e áreas de apoio."
                  : "Planta humanizada do rooftop do Alma."
              }
              titulo={`Ampliar planta do pavimento · ${pavimento === 0 ? "Lazer e bem-estar" : "Rooftop"}`}
              legenda={`Planta humanizada ilustrativa do pavimento.${pavimento === 0 ? " A prancha mostra o pavimento completo, incluindo áreas de apoio e garagem." : ""}`}
            />
            <h3 className="al-h3">
              {pavimento === 0 ? "Lazer e bem-estar" : "Rooftop"}
            </h3>
            <p className="al-p">
              {pavimento === 0
                ? "Piscina aquecida, prainha, hidromassagem, jardins e solarium, gourmet junto à piscina, playground Casa da Árvore, pet place, academia, Espaço Vitalidade, casa de banho e sauna seca."
                : "Salão de festas, Jantar Jardim, Pub View, Wine Bar, Fire Place, brinquedoteca Floresta Encantada e Lounge das Pedras."}
            </p>
          </details>
        </div>
      </section>

      <section id="localizacao" className="al-sec al-sal">
        <div className="al-wrap">
          <CabecalhoSecao
            n="06"
            titulo="A praia faz parte do caminho."
            sub="Perequê, Porto Belo."
          />
          <Exposicao
            evento="view_location"
            detalhe={{ empreendimento: e.slug }}
          >
            <div className="al-local-trajeto">
              <div className="al-pilha">
                <p className="al-p">
                  O Alma fica na Rua Wilson Belber, 316, em Perequê, a
                  aproximadamente 300 m da praia. Veja o percurso real e conheça
                  a relação do endereço com a orla.
                </p>
                <p className="al-lead">
                  Rua Wilson Belber, 316 · Balneário Perequê · Porto Belo, SC
                </p>
                <p>Distância de referência informada para o empreendimento.</p>
                <p className="al-p">
                  Para planejar sua rotina, comece pelo que importa para você: a
                  praia, os deslocamentos e os caminhos que pretende fazer no
                  dia a dia.
                </p>
                <p className="al-p">
                  O percurso apresentado parte da rua do empreendimento, passa
                  pela travessia da avenida e chega à Praia do Perequê.
                </p>
                <LinkRastreado
                  externo
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.endereco}, ${e.bairro}, ${e.cidade} - SC`)}`}
                  evento="click_route"
                  detalhe={{ empreendimento: e.slug, botao: "alma_endereco" }}
                  className="al-bt"
                >
                  Abrir endereço no mapa
                  <span className="sr-only"> (nova aba)</span>
                </LinkRastreado>
                <button
                  type="button"
                  className="al-bt al-bt--linha"
                  aria-expanded={mapa}
                  onClick={() => setMapa(!mapa)}
                >
                  Consultar mapa
                </button>
                {mapa && (
                  <iframe
                    className="al-mapa-consulta"
                    title="Mapa do endereço do Alma"
                    src="https://maps.google.com/maps?q=Rua%20Wilson%20Belber%2C%20316%2C%20Balneario%20Pereque%2C%20Porto%20Belo%20SC&z=16&output=embed"
                    loading="lazy"
                  />
                )}
              </div>
              <div>
                <VideoVertical
                  src="/video/alma/trajeto.mp4"
                  poster="/img/alma/poster-trajeto.jpg"
                  nome="Ver o trajeto até a praia"
                  legenda="Trajeto do Alma até a praia"
                  video="trajeto"
                />
                <p className="al-nota">
                  Gravação real do percurso, apresentada em edição de vídeo.
                </p>
              </div>
            </div>
          </Exposicao>
          <div className="al-tres al-trajeto-quadros">
            {[
              ["porta", "Na rua do empreendimento"],
              ["avenida", "A travessia da avenida"],
              ["praia", "A chegada à praia"],
            ].map(([src, t]) => (
              <FotoAlma
                key={src}
                src={`/img/alma/trajeto-${src}.jpg`}
                alt={`Registro real: ${t}.`}
                titulo={t}
                legenda="Quadro da gravação real do percurso."
              />
            ))}
          </div>
          <EspacoMidia id="M08" previa={previa} />
        </div>
      </section>

      <section id="conforto" className="al-sec al-cla">
        <div className="al-wrap">
          <CabecalhoSecao
            n="07"
            titulo="O cuidado também está no que você usa todos os dias."
            sub="Acabamentos, espaços de apoio e infraestrutura fazem parte da experiência de morar."
          >
            Além dos ambientes que você vê nas imagens, o projeto reúne soluções
            para conforto e rotina. Conheça as especificações e converse com a
            equipe sobre os detalhes da entrega.
          </CabecalhoSecao>
          <div className="al-confortos">
            {confortoAlma.map(([t, r]) => (
              <article key={t}>
                <h3 className="al-h3">{t}</h3>
                <p className="al-p">{r}</p>
                {t === "A volta da praia" && (
                  <EspacoMidia id="M07" previa={previa} />
                )}
              </article>
            ))}
          </div>
          <div className="al-hall">
            <FotoAlma
              src="/img/alma/hall.jpg"
              alt="Perspectiva ilustrativa do hall social do Alma."
              titulo="Hall social"
              legenda="Perspectiva ilustrativa do hall do projeto."
            />
          </div>
          <details className="al-expansao">
            <summary>
              <span className="al-recolhido">Consultar as especificações</span>
              <span className="al-expandido">Recolher especificações</span>
            </summary>
            <h3 className="al-h3">Especificações do projeto</h3>
            {especificacoesAlma.map(([t, r]) => (
              <div className="al-especificacao" key={t}>
                <h4>{t}</h4>
                <p className="al-p">{r}</p>
              </div>
            ))}
            <p className="al-aviso">
              Resumo das especificações divulgadas para o projeto. Consulte a
              equipe sobre o detalhamento dos sistemas e as condições aplicáveis
              à entrega. Infraestrutura para equipamentos não significa
              fornecimento dos aparelhos.
            </p>
            <a href="#contato">Tirar uma dúvida com a equipe</a>
          </details>
        </div>
      </section>

      <section id="obra" className="al-sec al-noite al-relevo">
        <div className="al-wrap">
          <CabecalhoSecao
            n="08"
            titulo="Conheça quem constrói. Acompanhe o que acontece."
            sub="O Alma é um empreendimento da Bossa Empreendimentos."
          >
            Conhecer a construtora faz parte da escolha da sua próxima casa.
            Veja as entregas anteriores da Bossa e consulte os registros
            disponíveis sobre a construção do Alma.
          </CabecalhoSecao>
          <div className="al-grade-dupla">
            {[
              ["Jazz", "setembro de 2019", "M04A", "jazz-residence"],
              ["Soul", "dezembro de 2023", "M04B", "soul-residence"],
            ].map(([t, data, id, slug]) => (
              <article key={t}>
                <EspacoMidia id={id as "M04A" | "M04B"} previa={previa} />
                <h3 className="al-h3">{t}</h3>
                <p>Entregue em {data}.</p>
                <Link href={`/empreendimentos/${slug}`}>Conhecer o {t}</Link>
              </article>
            ))}
          </div>
          <EspacoMidia id="M02" previa={previa} />
          <Exposicao
            evento="view_construction"
            detalhe={{ empreendimento: e.slug, edicao: ed.numero }}
          >
            <div className="al-boletim">
              <h3 className="al-h3">A construção do Alma, em cada registro.</h3>
              <p>
                Último boletim publicado: <strong>{ed.mesExtenso}</strong>
              </p>
              <p>
                Avanço geral informado nessa edição:{" "}
                <strong className="al-percentual">{percentual}%</strong>
              </p>
              <p>Boletim nº {String(ed.numero).padStart(2, "0")}</p>
              <p className="al-p">
                A edição de agosto registra os serviços de fundação,
                reservatórios e infraestrutura descritos no boletim. Consulte o
                registro completo para conhecer as etapas informadas naquele
                período.
              </p>
              <p>
                Início da obra: julho de 2025 · Entrega prevista: julho de 2030.
              </p>
              <Link className="al-bt" href={`/obras/${e.slug}/${ed.mes}`}>
                Ver boletim de {ed.mesExtenso}
              </Link>
              <p>
                Para informações mais recentes, converse com a equipe Bossa.
              </p>
              <a href="#contato">Conversar com a equipe Bossa</a>
            </div>
          </Exposicao>
          <EspacoMidia id="M03" previa={previa} />
        </div>
      </section>

      <section id="duvidas" className="al-sec al-cla-2">
        <div className="al-wrap">
          <CabecalhoSecao
            n="09"
            titulo="Algumas respostas antes da nossa conversa."
            sub="Informações para conhecer o projeto com mais clareza."
          />
          <div className="al-faq-lista">
            {faq.map((q) => (
              <details
                key={q.id}
                onToggle={(ev) => {
                  if (ev.currentTarget.open)
                    rastrear("faq_open", {
                      empreendimento: e.slug,
                      pergunta: q.id.padStart(2, "0"),
                    });
                }}
              >
                <summary>{q.p}</summary>
                <p className="al-p">{q.r}</p>
                {linksFaq[q.id] && (
                  <a href={linksFaq[q.id][0]}>{linksFaq[q.id][1]}</a>
                )}
              </details>
            ))}
          </div>
          <p className="al-lead">
            Ficou alguma dúvida sobre o que faz sentido para você?
          </p>
          <a href="#contato" className="al-bt">
            Conversar com a equipe
          </a>
        </div>
      </section>

      <section id="contato" className="al-sec al-sal al-relevo">
        <div className="al-wrap" ref={contato}>
          <CabecalhoSecao
            n="10"
            titulo="Conte como você imagina viver aqui."
            sub="Uma conversa pode ajudar a encontrar a opção que combina com a sua rotina."
          >
            Quer morar perto da praia, ter um lugar para reunir a família ou
            entender melhor as plantas? Conte o que é importante para você.
            Nossa equipe apresenta o projeto e ajuda a comparar as opções.
          </CabecalhoSecao>
          <div className="al-contato-final">
            <div className="al-pilha">
              {contexto && (
                <div aria-live="polite">
                  <p>
                    Você está conhecendo: {p.area} · {p.suites} suítes ·{" "}
                    {p.nome}
                  </p>
                  <a href="#plantas">Alterar planta</a>
                </div>
              )}
              {wa(
                "alma_contato",
                contexto
                  ? `Conversar sobre ${p.suites === 4 ? "este duplex" : "esta planta"}`
                  : "Conversar sobre o Alma",
              )}
              <p className="al-p">
                Você também pode solicitar uma apresentação do projeto no
                escritório da Bossa. O dia e o horário são combinados com a
                equipe.
              </p>
              <p>Rua São José, 163 · Térreo do Flow · Perequê, Porto Belo</p>
              {wa(
                "alma_solicitar_apresentacao",
                "Solicitar uma apresentação",
                "al-bt al-bt--linha",
                true,
              )}
            </div>
            <div className="al-form">
              <button
                type="button"
                className="al-bt al-bt--linha"
                aria-expanded={formulario}
                aria-controls="al-formulario"
                onClick={() => setFormulario(!formulario)}
              >
                Prefiro receber um contato
              </button>
              <div hidden={!formulario} id="al-formulario">
                <h3 className="al-h3">Prefiro receber um contato.</h3>
                <p>
                  Deixe seu nome e WhatsApp para conversar com a Bossa sobre o
                  Alma.
                </p>
                <FormLead
                  formulario="interesse"
                  empreendimento={e.slug}
                  interesse
                  alma
                  botao="Registrar meu interesse"
                  sucesso="Seu interesse no Alma foi registrado. A equipe Bossa entrará em contato pelo número informado."
                />
                {wa(
                  "alma_formulario_alternativa",
                  "Conversar pelo WhatsApp",
                  "al-bt al-bt--linha",
                )}
              </div>
            </div>
          </div>
          <p className="al-aviso">
            {notaLegal}{" "}
            {ALMA_ESTADO === "pre-registro" ? notaAlmaPreRegistro : ""}
          </p>
        </div>
      </section>
      {barra && (
        <aside className="al-barra-mobile" aria-label="Acesso rápido">
          <a className="al-bt" href="#plantas">
            Plantas
          </a>
          {wa("alma_barra_mobile", "Conversar")}
        </aside>
      )}
    </div>
  );
}
function Giro() {
  const [i, setI] = useState(0);
  return (
    <div className="al-pilha">
      <FotoAlma
        src={`/img/alma/vista/r-${String(i).padStart(2, "0")}.jpg`}
        alt={`Registro de drone do entorno, quadro ${i + 1} de 7 do giro do rooftop; referência do piso a 102 m.`}
        titulo={`Giro por imagens · ${i + 1} de 7 · piso do rooftop a 102 m`}
        legenda="Registros de drone. A posição de captura pode diferir da posição do apartamento. As imagens não garantem vista permanente nem vista idêntica em todas as unidades."
      />
      <div className="al-acoes">
        <button
          type="button"
          className="al-bt"
          onClick={() => {
            setI((i + 6) % 7);
            rastrear("gallery_interact", {
              empreendimento: "alma-seahouses",
              ambiente: "giro_rooftop",
            });
          }}
        >
          Anterior
        </button>
        <button
          type="button"
          className="al-bt"
          onClick={() => {
            setI((i + 1) % 7);
            rastrear("gallery_interact", {
              empreendimento: "alma-seahouses",
              ambiente: "giro_rooftop",
            });
          }}
        >
          Próximo
        </button>
      </div>
    </div>
  );
}
