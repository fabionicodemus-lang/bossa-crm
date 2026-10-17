import Link from "next/link";
import { emObra } from "@/content/empreendimentos";
import { meta } from "@/lib/seo";
import { Andamento } from "@/components/Blocos";
import { LinkWhatsApp } from "@/components/LinkWhatsApp";

export const metadata = meta({ titulo: "Andamento das obras · Flow Aptos e Alma Seahouses", descricao: "Percentual, fotos e o que avançou no mês, pavimento a pavimento. Publicado todo mês pela Bossa Empreendimentos.", caminho: "/obras" });

export default function Obras() {
  return (
    <>
      <section className="sec">
        <div className="wrap pilha" style={{ gap: 32 }}>
          <p className="rotulo">Obras</p>
          <h1 className="h1">A obra, todo mês, pavimento a pavimento.</h1>
          <p className="lead">Publicamos aqui o andamento de cada empreendimento em construção. O percentual é a média ponderada de todos os serviços, pelo peso de cada etapa no orçamento da obra. Ao lado dele, o que avançou no mês, o que vem a seguir e uma reportagem sobre uma decisão técnica.</p>
        </div>
      </section>
      {emObra.map((e) => (
        <section className="sec sec--elev" key={e.slug} style={{ borderTop: "1px solid var(--junta)" }}>
          <div className="wrap pilha" style={{ gap: 32 }}>
            <Andamento ed={e.edicoes[0]} nome={e.nome} />
            <h2 className="h2">{e.edicoes[0].titulo}</h2>
            <p className="p">{e.edicoes[0].resumo}</p>
            <div className="linha-acoes"><Link className="botao" href={`/obras/${e.slug}/${e.edicoes[0].mes}`}>Ler a edição de {e.edicoes[0].mesExtenso}</Link><Link className="botao botao--texto" href={`/empreendimentos/${e.slug}`}>Conhecer o {e.nome.split(" ")[0]}</Link></div>
          </div>
        </section>
      ))}
      <section className="sec">
        <div className="wrap linha-acoes" style={{ justifyContent: "space-between" }}>
          <h2 className="h2" style={{ maxWidth: 700 }}>Receba as próximas edições no WhatsApp.</h2>
          <LinkWhatsApp className="botao" botao="obras_assinar" mensagem="Olá! Quero receber as edições mensais das obras da Bossa.">Quero receber</LinkWhatsApp>
        </div>
      </section>
    </>
  );
}
