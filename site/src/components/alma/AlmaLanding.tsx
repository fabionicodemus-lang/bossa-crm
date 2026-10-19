import Image from "next/image";
import Link from "next/link";
import "@fontsource/ephesis/400.css";
import "@/styles/alma.css";
import type { Empreendimento } from "@/content/empreendimentos";
import { ALMA_ESTADO, acabamentosAlma, notaAlmaPreRegistro, notaLegal, perguntaAlmaCompra, perguntas } from "@/content/site";
import { empreendimentoLd, migalhasLd, perguntasLd } from "@/lib/seo";
import { Andamento, JsonLd } from "../Blocos";
import { AoVer } from "../AoVer";
import { SeletorPlantas } from "../SeletorPlantas";
import { FormLead } from "../FormLead";
import { Perguntas } from "../Perguntas";
import { LinkWhatsApp } from "../LinkWhatsApp";
import { LinkRastreado } from "../LinkRastreado";
import { VerEmpreendimento } from "../VerEmpreendimento";
import { Surgir, VideoAbertura, VideoLoop, VideoVertical, VistaAlma } from "./Clientes";

const IMG = "/img/alma";
const VID = "/video/alma";

const SABADO = [
  { hora: "7h", titulo: "Espaço Vitalidade", texto: "O dia começa devagar, com yoga ou um treino funcional entre plantas e luz natural.", fotos: [["yoga", "Espaço Vitalidade, para yoga e treino funcional, com luz natural"]], chips: ["Yoga", "Funcional"] },
  { hora: "8h", titulo: "Academia panorâmica", texto: "Do alto, a academia enxerga o pavimento inteiro: os jardins, a piscina, o movimento lento da manhã.", fotos: [["academia", "Academia panorâmica do Alma com vista para os jardins e a piscina"]], chips: ["Academia panorâmica"] },
  { hora: "10h", titulo: "A piscina aquecida", texto: "O coração do Alma. Uma piscina de formato orgânico, aquecida, com prainha revestida em areia Bora Bora da Crystal Pool, hidromassagem e jardins em volta. Água morna o ano inteiro, como uma praia particular.", fotos: [["piscina", "Piscina aquecida de formato orgânico do Alma, com prainha e jardins"], ["gourmet-piscina", "Prainha da piscina com espreguiçadeiras e o gourmet ao lado"]], chips: ["Piscina aquecida", "Prainha", "Hidromassagem", "Garden solarium"] },
  { hora: "13h", titulo: "Gourmet ao lado da piscina", texto: "A churrasqueira fica a poucos passos da água. Os amigos chegam de roupa de banho e a conversa não precisa mudar de lugar.", fotos: [["gourmet", "Espaço gourmet com churrasqueira, ao lado da piscina do Alma"]], chips: ["Gourmet com churrasqueira"] },
  { hora: "16h", titulo: "Casa da Árvore", texto: "As crianças sobem na casa da árvore, no playground entre os jardins. O pet place fica ali perto.", fotos: [["playground-2", "Jardim do pavimento de lazer com a Casa da Árvore ao fundo"]], chips: ["Playground Casa da Árvore", "Pet place"] },
  { hora: "18h", titulo: "Casa de banho", texto: "O sábado termina num ritual: a casa de banho sensorial, com banheiras, e a sauna seca. É o spa da sua casa na praia.", fotos: [["casa-de-banho", "Casa de banho sensorial do Alma, com banheiras"], ["sauna", "Sauna seca do Alma"]], chips: ["Casa de banho", "Banheiras", "Sauna seca"] },
] as const;

const CONDOMINIO = [
  "Entrada exclusiva de banhistas, com ducha e lava-pés",
  "Box de praia individual",
  "Áreas de lazer entregues mobiliadas, decoradas, equipadas e com enxoval",
  "Hall social mobiliado, decorado e sonorizado",
  "Dois elevadores de alta velocidade",
  "Piscina aquecida com hidromassagem",
  "Reuso da água da chuva",
  "Gerador para emergências",
  "Automação do condomínio e câmeras de segurança",
  "Medição individual de energia, gás e água",
];
const APARTAMENTO = [
  ...acabamentosAlma,
  "Portas de 4,2 cm de espessura",
  "Sacada integrada, com fechamento que mantém a estética da fachada",
  "Janelas amplas, com luz e ventilação natural",
];
const ENGENHARIA = [
  { valor: "107 m", titulo: "Proteção contra raios do topo ao solo", texto: "Para-raios conforme a NBR 5419: captação no ponto mais alto, descidas pela estrutura e malha de aterramento no subsolo." },
  { valor: "51.000 L", titulo: "Água reservada na base", texto: "Cisterna concretada junto à fundação, com reuso da água da chuva." },
  { valor: "entre lajes", titulo: "Silêncio entre vizinhos", texto: "Isolamento acústico e térmico entre as lajes e nas paredes de divisa dos apartamentos." },
];
const DIST = [
  { t: "Pelo mar", itens: [["Praia do Perequê", "300 m"], ["Píer do Centro", "1 km"], ["Ilha de Porto Belo", "1,5 km"], ["Marina Porto das Águas", "2 km"], ["Marina Pier 33", "3 km"], ["Porto Marina Atlântica", "4 km"]] },
  { t: "Praias e natureza", itens: [["Praia das Vieiras", "3 km"], ["Praia do Estaleiro", "5 km"], ["Mirante do Morro de Zimbros", "7 km"], ["Bombinhas", "10 km"], ["Quatro Ilhas", "12 km"], ["Mariscal", "13 km"]] },
  { t: "Cidades e aeroportos", itens: [["Itapema", "12 km"], ["Balneário Camboriú", "35 km"], ["Aeroporto Costa Esmeralda", "5 km"], ["Aeroporto de Navegantes", "57 km"], ["Aeroporto de Florianópolis", "67 km"], ["Curitiba", "220 km"]] },
];

function Onda({ cor = "currentColor" }: { cor?: string }) {
  return (
    <svg viewBox="0 0 1200 60" preserveAspectRatio="none" aria-hidden="true" style={{ display: "block", width: "100%", height: 40, color: cor }}>
      <path d="M0 30 C 200 0 400 60 600 30 S 1000 0 1200 30" fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function AlmaLanding({ e, plantaInicial }: { e: Empreendimento; plantaInicial?: string }) {
  const ed = e.edicoes[0];
  const pre = ALMA_ESTADO === "pre-registro";
  const faq = [...perguntas.filter((q) => q.grupo === "alma"), perguntaAlmaCompra[ALMA_ESTADO], perguntas.find((q) => q.p.startsWith("A Bossa já entregou"))!, perguntas.find((q) => q.grupo === "compra")!];
  const migalhas = [{ nome: "Início", href: "/" }, { nome: "Empreendimentos", href: "/empreendimentos" }, { nome: e.nome, href: `/empreendimentos/${e.slug}` }];
  const ctaPrincipal = pre ? "Registrar meu interesse" : "Receber o book";

  return (
    <div className="al">
      <Surgir />
      <VerEmpreendimento slug={e.slug} estagio={e.status} />
      <JsonLd dados={empreendimentoLd(e)} />
      <JsonLd dados={perguntasLd(faq)} />
      <JsonLd dados={migalhasLd(migalhas)} />

      {/* 1 · Abertura */}
      <section className="al-abertura" aria-labelledby="al-titulo">
        <VideoAbertura src={`${VID}/piscina.mp4`} poster={`${IMG}/poster-piscina.jpg`} />
        <div className="al-wrap al-abertura__conteudo">
          <Image src={`${IMG}/logo-claro.png`} alt="Alma Sea Houses" width={1319} height={481} priority className="al-abertura__logo" />
          <h1 id="al-titulo" className="al-h1">Sua casa na praia.<br /><span className="al-mao">feita para sua alma.</span></h1>
          <p className="al-lead" style={{ color: "#f1ede6" }}>Dois apartamentos por andar, 850 m² de lazer entre jardins e a Praia do Perequê a 300 metros, em Porto Belo.</p>
          <div className="al-selos"><span className="al-selo">300 m da Praia do Perequê</span><span className="al-selo">Dois apartamentos por andar</span></div>
          <div className="al-acoes">
            <a className="al-bt" href="#interesse">{ctaPrincipal}</a>
            <LinkWhatsApp className="al-bt al-bt--linha" botao="abertura" empreendimento={e.slug} mensagem="Olá! Vi o Alma Seahouses no site e quero saber mais.">Conversar pelo WhatsApp</LinkWhatsApp>
          </div>
        </div>
      </section>

      {/* 2 · Desacelerar */}
      <section className="al-sec al-cla al-relevo">
        <div className="al-wrap al-manifesto">
          <div className="al-foto al-arco al-r-3-4 al-surge"><Image src={`${IMG}/vida/varanda.jpg`} alt="Mulher tomando café na varanda com vista para o mar" fill sizes="(max-width: 960px) 100vw, 30vw" /></div>
          <div className="al-pilha al-pilha--g al-estreito al-surge">
            <p className="al-rot">Feito para sua alma</p>
            <h2 className="al-h2">Você já correu muito.<br />Agora, quer <span className="al-mao">tempo</span>.</h2>
            <p className="al-p">Tempo para a família, para os amigos, para você. O Perequê é cheio de vida, com praia, marinas e restaurantes. Mas quando a porta do Alma se fecha, o ritmo muda: jardins, água morna, silêncio.</p>
            <p className="al-p">Por isso são só dois apartamentos por andar. Menos vizinhos no corredor, mais privacidade, mais calma. A sensação de estar de férias num lugar que é seu.</p>
            <ul className="al-palavras" aria-label="Palavras do Alma"><li>Harmonia</li><li>Acolhimento</li><li>Leveza</li><li>Equilíbrio</li></ul>
          </div>
          <div className="al-foto al-arco al-r-3-4 al-manifesto__foto--baixa al-surge"><Image src={`${IMG}/vida/amanhecer.jpg`} alt="Amanhecer visto da cama, com o mar pela janela" fill sizes="(max-width: 960px) 100vw, 30vw" /></div>
        </div>
      </section>

      {/* 3 · A vida no Perequê */}
      <AoVer as="section" evento="view_location" detalhe={{ empreendimento: e.slug, tipo_pagina: "estilo-de-vida" }} className="al-sec al-nev">
        <div className="al-wrap">
          <div className="al-cab al-surge">
            <div className="al-pilha"><p className="al-rot">A vida no Perequê</p><h2 className="al-h2">O mar é o seu quintal.</h2></div>
            <p className="al-p">Porto Belo tem baía calma, ilha em frente, marinas, trilhas e praias para todos os dias da semana. Do Alma, tudo isso começa a poucos minutos.</p>
          </div>
          <div className="al-vida">
            <article className="al-cartao al-surge">
              <div className="al-foto"><Image src={`${IMG}/vista/r-00.jpg`} alt="Baía de Porto Belo vista do alto do terreno do Alma" fill sizes="(max-width: 700px) 100vw, 25vw" /></div>
              <h3 className="al-h3">Pelo mar</h3>
              <p className="al-p" style={{ fontSize: 16 }}>Lancha, jet ski, passeio de barco até a Ilha de Porto Belo. Três marinas a até 4 km.</p>
            </article>
            <article className="al-cartao al-surge">
              <div className="al-foto"><Image src={`${IMG}/vida/corrida.jpg`} alt="Homem correndo ao ar livre numa manhã de sol" fill sizes="(max-width: 700px) 100vw, 25vw" /></div>
              <h3 className="al-h3">Pela areia</h3>
              <p className="al-p" style={{ fontSize: 16 }}>Caminhada no fim da tarde, corrida de manhã cedo, o pé na água antes do café.</p>
            </article>
            <article className="al-cartao al-surge">
              <div className="al-foto"><Image src={`${IMG}/vida/vento.jpg`} alt="Mulher segurando o chapéu ao vento, à beira-mar" fill sizes="(max-width: 700px) 100vw, 25vw" /></div>
              <h3 className="al-h3">Pela natureza</h3>
              <p className="al-p" style={{ fontSize: 16 }}>Trilha da Costeira de Zimbros, o mirante do Morro de Zimbros, as praias de Bombinhas.</p>
            </article>
            <article className="al-cartao al-surge">
              <div className="al-foto"><Image src={`${IMG}/vida/beira-mar.jpg`} alt="Homem sorrindo, sentado à beira-mar" fill sizes="(max-width: 700px) 100vw, 25vw" /></div>
              <h3 className="al-h3">Pela mesa</h3>
              <p className="al-p" style={{ fontSize: 16 }}>Os restaurantes do Perequê, do centro de Porto Belo e de Itapema, e o vinho com vista no fim do dia.</p>
            </article>
          </div>
          <p className="al-nota" style={{ marginTop: 20 }}>Fotos de estilo de vida meramente ilustrativas.</p>
        </div>
      </AoVer>

      {/* 4 · Da porta ao mar */}
      <section className="al-sec al-sal al-relevo">
        <div className="al-wrap al-porta">
          <div className="al-pilha al-pilha--g">
            <div className="al-pilha al-surge">
              <p className="al-rot">Da porta ao mar</p>
              <h2 className="al-h2">De chinelo, toalha no ombro, <span className="al-mao">quatro minutos</span>.</h2>
              <p className="al-p">Gravamos o caminho de verdade, da calçada do Alma até a areia do Perequê. Na volta, a entrada exclusiva de banhistas tem ducha e lava-pés, e cada apartamento tem seu box de praia para guardar cadeira, guarda-sol e prancha.</p>
            </div>
            <div className="al-trilha" aria-hidden="true" />
            <ol className="al-passos">
              <li className="al-surge"><div className="al-foto"><Image src={`${IMG}/trajeto-porta.jpg`} alt="Esquina do Alma Seahouses, ponto de partida até a praia" fill sizes="(max-width: 700px) 100vw, 22vw" /></div><b>0 m</b><span>A porta do Alma, na Rua Wilson Belber</span></li>
              <li className="al-surge"><div className="al-foto"><Image src={`${IMG}/trajeto-avenida.jpg`} alt="Travessia da Avenida Senador Atílio Fontana a caminho da praia" fill sizes="(max-width: 700px) 100vw, 22vw" /></div><b>Av. Atílio Fontana</b><span>Pela Rua Felix Walendowsky até a avenida</span></li>
              <li className="al-surge"><div className="al-foto"><Image src={`${IMG}/trajeto-praia.jpg`} alt="Chegada à areia da Praia do Perequê" fill sizes="(max-width: 700px) 100vw, 22vw" /></div><b>300 m</b><span>A areia da Praia do Perequê</span></li>
            </ol>
          </div>
          <div className="al-surge" style={{ maxWidth: 360, width: "100%", justifySelf: "center" }}>
            <VideoVertical src={`${VID}/trajeto.mp4`} poster={`${IMG}/poster-trajeto.jpg`} nome="Do Alma até a praia" legenda="O caminho real · 1min04" video="trajeto-praia" />
          </div>
        </div>
      </section>

      {/* 5 · O pavimento do bem-estar */}
      <section className="al-sec al-cla" aria-labelledby="al-bem">
        <div className="al-wrap">
          <div className="al-cab al-surge">
            <div className="al-pilha"><p className="al-rot">Pavimento de lazer · 850 m² em dois andares</p><h2 id="al-bem" className="al-h2">Um sábado <span className="al-mao">no Alma</span>.</h2></div>
            <p className="al-p">Um pavimento inteiro pensado como um spa: água, jardins, movimento e descanso. Sem pressa, do primeiro café ao último banho de banheira.</p>
          </div>
          <div className="al-sabado">
            {SABADO.map((m) => (
              <article key={m.hora} className="al-momento al-surge">
                <div className={`al-momento__midia${m.fotos.length > 1 ? " al-momento__midia--dupla" : ""}`}>
                  {m.fotos.map(([f, alt], k) => (
                    <div key={f} className={`al-foto al-suave ${k === 0 ? "al-r-4-5" : "al-r-3-4"}`} style={m.fotos.length === 1 ? { aspectRatio: "4 / 3" } : undefined}><Image src={`${IMG}/${f}.jpg`} alt={alt} fill sizes="(max-width: 900px) 100vw, 45vw" /></div>
                  ))}
                </div>
                <div className="al-momento__texto">
                  <p className="al-hora">{m.hora}</p>
                  <h3 className="al-h3">{m.titulo}</h3>
                  <p className="al-p">{m.texto}</p>
                  <ul className="al-chips">{m.chips.map((c) => <li key={c}>{c}</li>)}</ul>
                </div>
              </article>
            ))}
          </div>
          <div className="al-foto al-suave al-r-16-9 al-surge" style={{ marginTop: 96 }}><Image src={`${IMG}/planta-lazer.jpg`} alt="Planta humanizada do pavimento de lazer do Alma, com piscina, gourmet, academia, casa de banho e jardins" fill sizes="100vw" style={{ objectFit: "contain", background: "#fff" }} /></div>
          <p className="al-nota" style={{ marginTop: 14 }}>Planta do pavimento de lazer. Imagens ilustrativas.</p>
        </div>
      </section>

      {/* 6 · Rooftop */}
      <section aria-labelledby="al-roof">
        <div className="al-full">
          <Image src={`${IMG}/fireplace.jpg`} alt="Fire Place do rooftop do Alma, com lareira e poltronas ao entardecer" fill sizes="100vw" />
          <div className="al-wrap al-full__conteudo al-surge">
            <p className="al-rot" style={{ color: "#e4ded4" }}>Rooftop 360° · 102 metros</p>
            <h2 id="al-roof" className="al-h1" style={{ fontSize: "clamp(42px, 6vw, 92px)" }}>Para receber os amigos<br /><span className="al-mao">olhando o céu.</span></h2>
          </div>
        </div>
        <div className="al-sec al-noite al-relevo" style={{ paddingTop: "clamp(56px, 7vw, 96px)" }}>
          <div className="al-wrap">
            <div className="al-cab al-surge">
              <p className="al-lead" style={{ color: "#f1ede6" }}>No topo, tudo tem pé-direito duplo e vista de 360°. O salão de festas olha o mar de Porto Belo. O Wine Bar se abre para a praça de fogo. E um terraço de pedras e jardins une todos os ambientes.</p>
              <p className="al-p">Num jantar maior, salão, Jantar Jardim, Wine Bar e terraço viram um espaço só, ao ar livre, com a região inteira em volta.</p>
            </div>
            <div className="al-mosaico">
              <div className="al-foto al-suave al-surge" style={{ minHeight: 380 }}><Image src={`${IMG}/jantar-jardim.jpg`} alt="Jantar Jardim no rooftop do Alma, com mesa longa entre plantas" fill sizes="(max-width: 860px) 100vw, 40vw" /><span className="al-legenda">Jantar Jardim</span></div>
              <div className="al-foto al-suave al-r-4-5 al-surge"><Image src={`${IMG}/pub.jpg`} alt="Pub View com pé-direito duplo no rooftop" fill sizes="(max-width: 860px) 100vw, 30vw" /><span className="al-legenda">Pub View</span></div>
              <div className="al-foto al-suave al-r-4-5 al-surge"><Image src={`${IMG}/brinquedoteca.jpg`} alt="Brinquedoteca Floresta Encantada" fill sizes="(max-width: 860px) 100vw, 30vw" /><span className="al-legenda">Brinquedoteca Floresta Encantada</span></div>
              <div className="al-foto al-suave al-r-16-9 al-surge" style={{ gridColumn: "span 2" }}><Image src={`${IMG}/planta-rooftop.jpg`} alt="Planta humanizada do rooftop do Alma" fill sizes="(max-width: 860px) 100vw, 60vw" style={{ objectFit: "contain", background: "#fff" }} /><span className="al-legenda" style={{ color: "var(--sal-noite)", textShadow: "none" }}>Planta do rooftop</span></div>
            </div>
            <ul className="al-chips" style={{ marginTop: 28 }}><li>Salão de festas</li><li>Jantar Jardim</li><li>Pub View</li><li>Wine Bar</li><li>Fire Place</li><li>Lounge das Pedras</li><li>Brinquedoteca</li></ul>
          </div>
        </div>
      </section>

      {/* 7 · Escolha sua altura */}
      <AoVer as="section" evento="view_location" detalhe={{ empreendimento: e.slug, tipo_pagina: "vista-andares" }} className="al-sec al-sal">
        <div className="al-wrap">
          <div className="al-cab al-surge">
            <div className="al-pilha"><p className="al-rot">Vista dos andares</p><h2 className="al-h2">Escolha a altura. <span className="al-mao">Veja o mar.</span></h2></div>
            <p className="al-p">Subimos um drone no terreno, metro a metro, do pavimento de lazer ao rooftop. A cada andar, a baía de Porto Belo se abre um pouco mais.</p>
          </div>
          <VistaAlma />
          <h3 className="al-h3" style={{ marginTop: 72 }}>O giro de 360°, a 102 metros</h3>
          <div className="al-giro" aria-label="Vista de 360 graus do rooftop" tabIndex={0}>
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <figure key={n}><div className="al-foto"><Image src={`${IMG}/vista/r-${String(n).padStart(2, "0")}.jpg`} alt={`Vista do rooftop do Alma, parte ${n + 1} de 7 do giro de 360 graus`} fill sizes="520px" /></div></figure>
            ))}
          </div>
          <p className="al-nota">Arraste para o lado para dar a volta completa.</p>
        </div>
      </AoVer>

      {/* 8 · Dois por andar */}
      <section id="plantas" className="al-sec al-cla" style={{ scrollMarginTop: 72 }}>
        <div className="al-wrap">
          <div className="al-dois">
            <div className="al-pilha al-pilha--g al-surge">
              <p className="al-rot">Os apartamentos</p>
              <h2 className="al-h2">Só dois por andar. <span className="al-mao">E o resto é calma.</span></h2>
              <p className="al-p">Apartamentos de 3 suítes com 103 e 114 m², e duplex de 4 suítes com 145 e 168 m². Todos com duas vagas, living integrado à cozinha, lavabo e churrasqueira a carvão.</p>
            </div>
            <div className="al-numeros al-surge">
              <div><b>2</b><span>apartamentos por andar</span></div>
              <div><b>48</b><span>unidades no total</span></div>
              <div><b>3 e 4</b><span>suítes</span></div>
              <div><b>2</b><span>vagas em todos</span></div>
            </div>
          </div>
          <div className="al-fotos-apto">
            <div className="al-foto al-suave al-r-16-9 al-surge"><Image src={`${IMG}/living.jpg`} alt="Living integrado de um apartamento do Alma, com vista para o mar" fill sizes="(max-width: 860px) 100vw, 60vw" /><span className="al-legenda">Living</span></div>
            <div className="al-video-quadrado al-surge"><VideoLoop src={`${VID}/duplex.mp4`} poster={`${IMG}/poster-duplex.jpg`} rotulo="Living de um duplex do Alma, com vista para o mar" /></div>
            <div className="al-foto al-suave al-r-21-9 al-surge" style={{ gridColumn: "1 / -1" }}><Image src={`${IMG}/suite-master.jpg`} alt="Suíte master de um apartamento do Alma" fill sizes="100vw" /><span className="al-legenda">Suíte master</span></div>
          </div>
          <div className="al-plantas">
            <SeletorPlantas slug={e.slug} nome={e.nome} plantas={e.plantas} inicial={plantaInicial} />
          </div>
        </div>
      </section>

      {/* 9 · O que vem junto */}
      <AoVer as="section" evento="view_engineering" detalhe={{ empreendimento: e.slug }} className="al-sec al-cla-2 al-relevo">
        <div className="al-wrap">
          <div className="al-cab al-surge">
            <div className="al-pilha"><p className="al-rot">O que vem junto</p><h2 className="al-h2">Cuidado no que se vê e no que não se vê.</h2></div>
            <p className="al-p">Da ducha na volta da praia à cisterna escondida na fundação, o Alma foi pensado para a vida ser simples quando você estiver nele.</p>
          </div>
          <div className="al-listas">
            <div className="al-pilha al-surge"><h3 className="al-h3">No condomínio</h3><ul className="al-lista">{CONDOMINIO.map((x) => <li key={x}>{x}</li>)}</ul></div>
            <div className="al-pilha al-surge"><h3 className="al-h3">No apartamento</h3><ul className="al-lista">{APARTAMENTO.map((x) => <li key={x}>{x}</li>)}</ul></div>
          </div>
          <ol className="al-eng">
            {ENGENHARIA.map((x) => <li key={x.titulo} className="al-surge"><b>{x.valor}</b><h3 className="al-h3">{x.titulo}</h3><p className="al-p" style={{ fontSize: 16 }}>{x.texto}</p></li>)}
          </ol>
        </div>
      </AoVer>

      {/* 10 · 2030 começa agora */}
      <AoVer as="section" evento="view_construction" detalhe={{ empreendimento: e.slug, edicao: ed.numero, percentual: ed.percentual }} className="al-sec al-noite">
        <div className="al-wrap al-prazo">
          <div className="al-pilha al-pilha--g">
            <div className="al-pilha al-surge">
              <p className="al-rot">A obra</p>
              <h2 className="al-h2">2030 parece longe. <span className="al-mao">A obra já começou.</span></h2>
              <p className="al-p">A obra do Alma começou em julho de 2025. Desde então, publicamos todo mês o que avançou, com fotos e percentual, para você acompanhar de onde estiver. E a Bossa tem um histórico de entregas para mostrar.</p>
            </div>
            <ol className="al-linha al-surge">
              <li><b>Jazz</b><span>Obra de nov/2017 a set/2019. Entregue um ano e oito meses antes do prazo.</span></li>
              <li><b>Soul</b><span>Obra de fev/2020 a dez/2023. Entregue no prazo, com a pandemia no meio.</span></li>
              <li><b>Flow</b><span>Obra desde nov/2023, entrega em nov/2027. Torre fechada de baixo a cima.</span></li>
              <li className="al-linha__agora"><b>Alma</b><span>Obra desde jul/2025, entrega prevista em jul/2030.</span></li>
            </ol>
          </div>
          <div className="al-pilha al-surge">
            <div className="al-andamento"><Andamento ed={ed} nome="Alma Seahouses" cor="var(--sal)" /></div>
            <p className="al-p">{ed.resumo}</p>
            <div className="al-acoes"><Link href={`/obras/${e.slug}/${ed.mes}`} className="al-bt">Ler a edição de {ed.mesExtenso.split(" ")[0]}</Link><Link href="/obras" className="al-bt al-bt--linha">Todas as edições</Link></div>
          </div>
        </div>
      </AoVer>

      {/* 11 · Localização */}
      <AoVer as="section" evento="view_location" detalhe={{ empreendimento: e.slug }} className="al-sec al-nev">
        <div className="al-wrap al-local">
          <div className="al-pilha al-pilha--g al-surge">
            <p className="al-rot">Localização</p>
            <h2 className="al-h2">Rua Wilson Belber, 316. Balneário Perequê.</h2>
            <p className="al-p">Uma rua residencial, na esquina com a Rua Felix Walendowsky, a 300 metros da praia. Perto do píer, das marinas e do centro de Porto Belo.</p>
            <div className="al-foto al-suave al-r-4-5" style={{ maxWidth: 420 }}><Image src={`${IMG}/fachada.jpg`} alt="Fachada do Alma Seahouses, com curvas e jardins" fill sizes="(max-width: 960px) 100vw, 30vw" /></div>
            <LinkRastreado externo className="al-bt al-bt--linha" evento="click_route" detalhe={{ empreendimento: e.slug }} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.endereco}, ${e.bairro}, ${e.cidade} - SC`)}`}>Abrir rota no mapa</LinkRastreado>
          </div>
          <div className="al-dist al-surge">
            {DIST.map((g) => <div key={g.t}><p className="al-rot">{g.t}</p><ul className="al-dados">{g.itens.map(([a, b]) => <li key={a}><span>{a}</span><span>{b}</span></li>)}</ul></div>)}
          </div>
        </div>
      </AoVer>

      {/* 12 · Fechamento */}
      <section id="interesse" className="al-sec al-sal al-relevo" style={{ scrollMarginTop: 72 }}>
        <div className="al-wrap">
          <Onda cor="rgba(233,230,223,.4)" />
          <div className="al-fecho" style={{ marginTop: 48 }}>
            <div className="al-pilha al-pilha--g">
              <Image src={`${IMG}/logo-claro.png`} alt="" width={1319} height={481} style={{ width: 200, height: "auto" }} />
              <h2 className="al-h1" style={{ fontSize: "clamp(40px, 5vw, 76px)" }}>{pre ? <>Seja dos primeiros <span className="al-mao">a saber.</span></> : <>Venha conhecer <span className="al-mao">o Alma.</span></>}</h2>
              <p className="al-p">{pre
                ? "A incorporação do Alma está em registro. Deixe seu interesse e receba primeiro as plantas disponíveis e as condições, assim que o registro sair. Enquanto isso, venha conhecer o projeto no nosso escritório, no térreo do Flow Aptos, na Rua São José, 163."
                : "Receba o book completo, agende uma visita ao nosso escritório, no térreo do Flow Aptos, ou fale agora com a gente pelo WhatsApp."}</p>
              <div className="al-acoes">
                <LinkWhatsApp className="al-bt" botao="fechamento" empreendimento={e.slug} mensagem="Olá! Estou vendo o Alma Seahouses no site e gostaria de mais informações.">Conversar pelo WhatsApp</LinkWhatsApp>
              </div>
            </div>
            <div className="al-pilha">
              <AoVer evento="view_price" detalhe={{ empreendimento: e.slug, faixa: pre ? "pre-registro" : "crm" }}>
                <div className="al-form">
                  <p className="al-rot" style={{ marginBottom: 20 }}>{ctaPrincipal}</p>
                  {pre
                    ? <FormLead formulario="interesse" empreendimento={e.slug} interesse botao="Registrar meu interesse" sucesso="Interesse registrado. Você será avisado assim que o registro da incorporação sair." />
                    : <FormLead formulario="book" empreendimento={e.slug} interesse botao="Receber o book" sucesso="Pronto. O book do Alma chega no seu WhatsApp em instantes." />}
                </div>
              </AoVer>
              <div className="al-form">
                <p className="al-rot" style={{ marginBottom: 20 }}>Agendar visita ao escritório</p>
                <FormLead formulario="visita" empreendimento={e.slug} data botao="Pedir visita" sucesso="Pedido recebido. Vamos confirmar data e horário pelo WhatsApp." />
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="al-sec al-noite" style={{ paddingTop: 72 }}>
        <div className="al-wrap">
          <div className="al-faq" style={{ marginTop: 0 }}>
            <div className="al-pilha"><p className="al-rot">Perguntas</p><h2 className="al-h2" style={{ fontSize: "clamp(28px, 3vw, 40px)" }}>O que mais nos perguntam sobre o Alma.</h2></div>
            <Perguntas itens={faq} />
          </div>
          <p className="al-nota" style={{ marginTop: 48 }}>{notaLegal}{pre ? " " + notaAlmaPreRegistro : ""}</p>
        </div>
      </section>
    </div>
  );
}
