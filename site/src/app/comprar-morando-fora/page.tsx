import { meta } from "@/lib/seo";
import { LinkWhatsApp } from "@/components/LinkWhatsApp";

export const metadata = meta({ titulo: "Comprar imóvel em Santa Catarina morando fora do Brasil", descricao: "Atendimento por WhatsApp, obra acompanhada mês a mês e histórico de entregas no prazo. Conheça os empreendimentos da Bossa.", caminho: "/comprar-morando-fora" });

const passos = [
  ["Conversa", "Você fala com a gente pelo WhatsApp e recebe plantas, condições e o book do empreendimento."],
  ["Visita, se quiser", "Presencial na sua próxima viagem ao Brasil, ou acompanhando a obra pelas edições mensais."],
  ["Contrato", "Nosso time explica, caso a caso, como a assinatura acontece à distância."],
  ["Acompanhamento", "A cada mês, a edição da obra chega no seu WhatsApp, até a entrega das chaves."],
];

export default function MorandoFora() {
  return (
    <>
      <section className="sec">
        <div className="wrap pilha" style={{ gap: 32 }}>
          <p className="rotulo">Para quem mora fora do Brasil</p>
          <h1 className="h1" style={{ maxWidth: 1100 }}>Um apartamento no litoral de Santa Catarina, acompanhado de onde você estiver.</h1>
          <p className="lead">Muitos dos nossos clientes moram longe. Por isso a Bossa publica todo mês o andamento de cada obra, com fotos e percentual, e atende pelo WhatsApp.</p>
        </div>
      </section>
      <section className="sec sec--elev">
        <div className="wrap pilha" style={{ gap: 32 }}>
          <h2 className="h2">Como funciona.</h2>
          <ol className="quatro" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {passos.map(([t, x], i) => <li key={t} className="pilha-p" style={{ borderTop: "1px solid var(--tinta)", paddingTop: 24 }}><span className="cota__valor">{String(i + 1).padStart(2, "0")}</span><h3 className="h3" style={{ fontSize: 24 }}>{t}</h3><p className="nota" style={{ fontSize: 15, lineHeight: "22px" }}>{x}</p></li>)}
          </ol>
        </div>
      </section>
      <section className="sec">
        <div className="wrap dupla" style={{ alignItems: "end" }}>
          <ul className="lista-simples"><li>Jazz entregue um ano e oito meses antes do prazo</li><li>Soul entregue no prazo durante a pandemia</li><li>Duas obras em andamento publicadas mês a mês</li></ul>
          <div className="pilha" style={{ alignItems: "flex-start" }}><h2 className="h2">Fale com a gente.</h2><LinkWhatsApp className="botao" botao="morando_fora" mensagem="Olá! Moro fora do Brasil e tenho interesse nos empreendimentos da Bossa.">Conversar pelo WhatsApp</LinkWhatsApp></div>
        </div>
      </section>
    </>
  );
}
