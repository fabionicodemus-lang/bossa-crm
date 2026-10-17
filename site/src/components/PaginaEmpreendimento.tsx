import Image from "next/image";
import Link from "next/link";
import type { Empreendimento } from "@/content/empreendimentos";
import { ALMA_ESTADO, acabamentosAlma, acabamentosFlow, distanciasAlma, distanciasFlow, notaAlmaPreRegistro, notaLegal, perguntaAlmaCompra, perguntas } from "@/content/site";
import { Andamento, Cota, Ficha, JsonLd, Migalhas } from "./Blocos";
import { AoVer } from "./AoVer";
import { SeletorPlantas } from "./SeletorPlantas";
import { Galeria } from "./Galeria";
import { FormLead } from "./FormLead";
import { Perguntas } from "./Perguntas";
import { LinkWhatsApp } from "./LinkWhatsApp";
import { LinkRastreado } from "./LinkRastreado";
import { VerEmpreendimento } from "./VerEmpreendimento";
import { empreendimentoLd, migalhasLd, perguntasLd } from "@/lib/seo";

const ENGENHARIA: Record<string, { valor: string; titulo: string; texto: string }[]> = {
  "alma-seahouses": [
    { valor: "107 m", titulo: "Proteção contra raios do topo ao solo", texto: "Para-raios (SPDA) conforme a norma NBR 5419: captação no ponto mais alto, descidas pela estrutura e malha de aterramento no subsolo." },
    { valor: "51.000 L", titulo: "Água reservada na base", texto: "Cisterna concretada junto à fundação, com reuso da água da chuva." },
    { valor: "entre lajes", titulo: "Silêncio entre vizinhos", texto: "Isolamento acústico e térmico entre as lajes e nas paredes de divisa dos apartamentos." },
  ],
  "flow-aptos": [
    { valor: "72 h", titulo: "O box por dentro", texto: "Ralo linear em vez de ralo central: o piso do box vira um plano só e a água não para. O nicho do shampoo é feito com a parede e entregue revestido, sem furar área molhada depois." },
    { valor: "24º", titulo: "Churrasqueira sem fumaça de volta", texto: "Cada churrasqueira tem coifa metálica e damper. Uma prumada leva a fumaça até acima do rooftop, onde um exaustor industrial puxa o ar." },
    { valor: "2 mm", titulo: "Porcelanato que não solta", texto: "Piso 70 × 70 cm e parede 35 × 72 cm, juntas de 2 mm, dupla colagem com argamassa AC-III e ensaio de arrancamento." },
  ],
};

const TEXTOS: Record<string, { conceitoRotulo: string; conceitoTitulo: string; conceito: string[]; plantasTitulo: string; lazerRotulo: string; lazerTitulo: string; lazer: string; localTitulo: string; localTexto: string; extra: string }> = {
  "alma-seahouses": {
    conceitoRotulo: "O conceito", conceitoTitulo: "Feito para sua alma.",
    conceito: ["Um edifício pensado para quem quer viver o ano inteiro no ritmo das férias. Piscina aquecida com prainha, casa de banho, academia voltada para os jardins e, no topo, um rooftop com pub, wine bar e lareira, a 102 metros da rua.", "Sem ostentação. Conforto, privacidade e natureza, com a engenharia da Bossa por trás de cada detalhe."],
    plantasTitulo: "Quatro plantas, de 103 a 168 m².",
    lazerRotulo: "Lazer · 850 m² em dois pavimentos", lazerTitulo: "Bem Viver no lazer. Rooftop no topo.",
    lazer: "No pavimento Bem Viver, a piscina aquecida com prainha e hidromassagem, o gourmet ao lado da piscina, o garden solarium, a academia panorâmica, o espaço de yoga, a casa de banho e a sauna seca. No rooftop, o jantar jardim, o salão de festas e o pub com pé-direito duplo, o wine bar com lareira e o lounge das pedras. E ainda playground, brinquedoteca e pet place.",
    localTitulo: "Rua Wilson Belber, 316. Perequê, Porto Belo.",
    localTexto: "Uma rua residencial, a 300 metros da Praia do Perequê. Perto do píer, das marinas e do centro de Porto Belo, e a poucos minutos de Itapema.",
    extra: "No condomínio: entrada de banhistas com ducha, box de praia individual, reuso da água da chuva, gerador, medição individual de energia, gás e água, e áreas comuns entregues decoradas e equipadas.",
  },
  "flow-aptos": {
    conceitoRotulo: "O conceito", conceitoTitulo: "Uma extensão da sua casa, em dois andares.",
    conceito: ["O Flow foi pensado para a vida que não para: coworking com sala de reuniões, espaço fitness, lavanderia, uma pequena loja de conveniência e, no 24º andar, o The Roof, com piscina, gourmet e pub de frente para a cidade. Todas as áreas comuns são entregues mobiliadas, decoradas e equipadas."],
    plantasTitulo: "Do apartamento de 62 m² ao duplex com pé-direito duplo.",
    lazerRotulo: "Lazer · mais de 600 m² em dois andares", lazerTitulo: "Flow Move no 5º. The Roof no 24º.",
    lazer: "Doze ambientes, todos mobiliados, decorados e com enxoval. No Flow Move: espaço zen, playground, cine Flow, coworking com sala de reuniões, espaço fitness, Flow Store e lavanderia. No The Roof: piscina, espaço gourmet, pub, brinquedoteca e salão de festas.",
    localTitulo: "Rua São José, 163. Balneário Perequê, Porto Belo.",
    localTexto: "Duas entradas, pela Rua São José e pela Rua Santa Terezinha. Perto de mercado, escola, farmácia, da via gastronômica e do acesso à BR-101.",
    extra: "As suítes principais têm janelas panorâmicas.",
  },
};

export function PaginaEmpreendimento({ e, plantaInicial }: { e: Empreendimento; plantaInicial?: string }) {
  const t = TEXTOS[e.slug];
  const u = e.universo === "alma" ? "u-alma" : "u-flow";
  const ed = e.edicoes[0];
  const isAlma = e.slug === "alma-seahouses";
  const preRegistro = isAlma && ALMA_ESTADO === "pre-registro";
  const faq = [
    ...perguntas.filter((q) => q.grupo === (isAlma ? "alma" : "flow")),
    ...(isAlma ? [perguntaAlmaCompra[ALMA_ESTADO]] : []),
    perguntas.find((q) => q.p.startsWith("A Bossa já entregou"))!,
  ];
  const migalhas = [{ nome: "Início", href: "/" }, { nome: "Empreendimentos", href: "/empreendimentos" }, { nome: e.nome, href: `/empreendimentos/${e.slug}` }];
  const curto = e.nome.split(" ")[0];

  return (
    <>
      <VerEmpreendimento slug={e.slug} estagio={e.status} />
      <JsonLd dados={empreendimentoLd(e)} />
      <JsonLd dados={perguntasLd(faq)} />
      <JsonLd dados={migalhasLd(migalhas)} />

      <section className="sec" style={{ paddingBottom: 48 }}>
        <div className="wrap pilha" style={{ gap: 32 }}>
          <Migalhas itens={migalhas} />
          <div className="dupla" style={{ alignItems: "end" }}>
            <div className="pilha">
              <p className="rotulo">{e.rotulo}</p>
              <h1 className={`h1 ${isAlma ? "t-alma" : "t-flow"}`}>{e.nome}</h1>
            </div>
            <p className="lead" style={{ paddingBottom: 8 }}>{e.resumo}</p>
          </div>
        </div>
      </section>
      <div className="abertura-foto"><Image src={e.capa.src} alt={e.capa.alt} fill priority sizes="100vw" style={{ objectPosition: isAlma ? "center" : "center 25%" }} /></div>

      <section className="sec" style={{ paddingTop: 48 }}>
        <div className="wrap"><Ficha itens={e.ficha} /></div>
      </section>

      <section className={`sec ${u}`}>
        <div className="wrap dupla" style={{ alignItems: "center" }}>
          <div className="pilha">
            <p className="rotulo">{t.conceitoRotulo}</p>
            <h2 className="h2">{t.conceitoTitulo}</h2>
            {t.conceito.map((p) => <p className="p" key={p}>{p}</p>)}
          </div>
          <div className="ratio-4-5 revelar" style={{ position: "relative" }}>
            <Image src={isAlma ? e.cartao.src : "/img/flow-fachada-dia.jpg"} alt={isAlma ? e.cartao.alt : "Fachada do Flow Aptos durante o dia"} fill sizes="(max-width: 860px) 100vw, 50vw" />
          </div>
        </div>
      </section>

      <section id="plantas" className="sec">
        <div className="wrap pilha" style={{ gap: 32 }}>
          <div className="pilha"><p className="rotulo">Plantas</p><h2 className="h2">{t.plantasTitulo}</h2></div>
          <SeletorPlantas slug={e.slug} nome={e.nome} plantas={e.plantas} inicial={plantaInicial} />
        </div>
      </section>

      <section className="sec sec--elev">
        <div className="wrap pilha" style={{ gap: 32 }}>
          <div className="dupla" style={{ alignItems: "end" }}>
            <div className="pilha"><p className="rotulo">{t.lazerRotulo}</p><h2 className="h2">{t.lazerTitulo}</h2></div>
            <p className="p">{t.lazer}</p>
          </div>
          <Galeria fotos={e.galeria} empreendimento={e.slug} />
          <p className="nota">Imagens ilustrativas.</p>
        </div>
      </section>

      <section className="sec">
        <div className="wrap dupla" style={{ alignItems: "start" }}>
          <div className="pilha"><h2 className="h2">O que vem em cada apartamento.</h2><p className="p">{t.extra}</p></div>
          <ul className="lista-simples">{(isAlma ? acabamentosAlma : acabamentosFlow).map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      </section>

      <AoVer as="section" evento="view_location" detalhe={{ empreendimento: e.slug }} className="sec sec--elev">
        <div className="wrap dupla" style={{ alignItems: "start" }}>
          <div className="pilha">
            <p className="rotulo">Localização</p>
            <h2 className="h2">{t.localTitulo}</h2>
            <p className="p">{t.localTexto}</p>
            <LinkRastreado externo className="botao botao--texto" evento="click_route" detalhe={{ empreendimento: e.slug }}
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.endereco}, ${e.bairro}, ${e.cidade} - SC`)}`}>Abrir rota no mapa</LinkRastreado>
          </div>
          <div className="pilha">
            <Cota valor={`${e.distanciaMar} até a praia`} />
            <ul className="lista-dados">{(isAlma ? distanciasAlma : distanciasFlow).map(([a, b]) => <li key={a}><span>{a}</span><span>{b}</span></li>)}</ul>
          </div>
        </div>
      </AoVer>

      {ed && (
        <AoVer as="section" evento="view_construction" detalhe={{ empreendimento: e.slug, edicao: ed.numero, percentual: ed.percentual }} className="sec">
          <div className="wrap pilha" style={{ gap: 32 }}>
            <Andamento ed={ed} nome="A obra" />
            <p className="p">{ed.resumo}</p>
            <Link href={`/obras/${e.slug}/${ed.mes}`} className="botao botao--texto">Ler a edição completa</Link>
          </div>
        </AoVer>
      )}

      <AoVer as="section" evento="view_engineering" detalhe={{ empreendimento: e.slug }} className="sec sec--elev">
        <div className="wrap pilha" style={{ gap: 32 }}>
          <div className="pilha"><p className="rotulo">Engenharia do {curto}</p><h2 className="h2">Decisões que você não vê, mas vai sentir.</h2></div>
          <ol className="tres" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {ENGENHARIA[e.slug].map((x) => (
              <li key={x.titulo} className="pilha-p" style={{ borderTop: "1px solid var(--tinta)", paddingTop: 24 }}>
                <span className="cota__valor">{x.valor}</span>
                <h3 className="h3" style={{ fontSize: 24 }}>{x.titulo}</h3>
                <p className="nota" style={{ fontSize: 15, lineHeight: "22px" }}>{x.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </AoVer>

      <AoVer as="section" evento="view_price" detalhe={{ empreendimento: e.slug, faixa: preRegistro ? "pre-registro" : "crm" }} className={`sec ${u}`} id="condicoes">
        <div className="wrap dupla" style={{ alignItems: "start" }}>
          {preRegistro ? (
            <>
              <div className="pilha">
                <p className="rotulo">Condições</p>
                <h2 className="h2">A incorporação do Alma está em registro.</h2>
                <p className="p">Enquanto o registro não sai, não fazemos oferta de venda, como manda a Lei 4.591/64. Você pode deixar seu interesse registrado e será o primeiro a receber valores e plantas disponíveis.</p>
                <p className="nota">{notaAlmaPreRegistro}</p>
              </div>
              <div className="cartao-form"><FormLead formulario="interesse" empreendimento={e.slug} interesse botao="Registrar meu interesse" sucesso="Interesse registrado. Você será avisado assim que o registro da incorporação sair." /></div>
            </>
          ) : (
            <>
              <div className="pilha">
                <p className="rotulo">Condições</p>
                <h2 className="h2">Condições direto com a construtora.</h2>
                <p className="p">A tabela e a condição vigente são enviadas pelo nosso time, com a disponibilidade atualizada de cada planta.</p>
              </div>
              <div className="cartao-form pilha">
                <p className="p">Receba a tabela do {curto} no WhatsApp.</p>
                <LinkWhatsApp className="botao" botao="condicoes" empreendimento={e.slug} mensagem={`Olá! Gostaria de receber a tabela e as condições do ${e.nome}.`}>Receber a tabela</LinkWhatsApp>
                <p className="nota">Valores sujeitos a reajuste e disponibilidade.</p>
              </div>
            </>
          )}
        </div>
      </AoVer>

      {!preRegistro && (
        <section className="sec">
          <div className="wrap dupla" style={{ alignItems: "start" }}>
            <div className="pilha"><p className="rotulo">Apresentação completa</p><h2 className="h2">Receba o book do {curto}.</h2><p className="p">Plantas em alta, lista de acabamentos e o andamento da obra num PDF para guardar ou mandar para quem decide junto com você.</p></div>
            <FormLead formulario="book" empreendimento={e.slug} interesse botao="Receber o book" sucesso={`Pronto. O book do ${curto} chega no seu WhatsApp em instantes.`} />
          </div>
        </section>
      )}

      <section className="sec sec--elev" id="visita">
        <div className="wrap dupla" style={{ alignItems: "start" }}>
          <div className="pilha">
            <h2 className="h2">Quer ver o {curto} de perto?</h2>
            <p className="p">{isAlma ? "Agende uma visita ao stand ou converse com a gente pelo WhatsApp." : "Visite o decorado ou a obra, ou converse com a gente pelo WhatsApp."}</p>
            <LinkWhatsApp className="botao" botao="fechamento" empreendimento={e.slug} mensagem={`Olá! Estou vendo o ${e.nome} no site e gostaria de mais informações.`}>Conversar sobre o {curto}</LinkWhatsApp>
            <div style={{ marginTop: 24 }}><p className="rotulo" style={{ marginBottom: 16 }}>Agendar visita</p>
              <FormLead formulario="visita" empreendimento={e.slug} data botao="Pedir visita" sucesso="Pedido recebido. Vamos confirmar data e horário pelo WhatsApp." />
            </div>
          </div>
          <div className="pilha"><p className="rotulo">Perguntas</p><Perguntas itens={faq} /></div>
        </div>
      </section>
      <div className="wrap" style={{ paddingBlock: 24 }}><p className="nota">{notaLegal}{preRegistro ? " " + notaAlmaPreRegistro : ""}</p></div>
    </>
  );
}
