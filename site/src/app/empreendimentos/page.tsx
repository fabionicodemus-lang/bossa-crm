import { emObra, entregues } from "@/content/empreendimentos";
import { meta } from "@/lib/seo";
import { CartaoEmpreendimento } from "@/components/Blocos";

export const metadata = meta({ titulo: "Empreendimentos · Bossa Empreendimentos", descricao: "Alma Seahouses e Flow Aptos em obra no Balneário Perequê, Porto Belo. Soul Residence e Jazz Residence entregues em Itapema.", caminho: "/empreendimentos" });

export default function Empreendimentos() {
  return (
    <>
      <section className="sec">
        <div className="wrap pilha" style={{ gap: 48 }}>
          <div className="pilha"><p className="rotulo">Empreendimentos</p><h1 className="h1">Dois em obra. Dois entregues.</h1></div>
          <div className="pilha"><p className="rotulo">Em obra · Balneário Perequê, Porto Belo</p><div className="dupla">{emObra.map((e, i) => <CartaoEmpreendimento key={e.slug} e={e} prioridade={i === 0} />)}</div></div>
        </div>
      </section>
      <section className="sec sec--elev">
        <div className="wrap pilha"><p className="rotulo">Entregues · Itapema</p><div className="dupla">{entregues.map((e) => <CartaoEmpreendimento key={e.slug} e={e} />)}</div></div>
      </section>
    </>
  );
}
