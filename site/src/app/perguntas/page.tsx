import { ALMA_ESTADO, perguntaAlmaCompra, perguntas } from "@/content/site";
import { meta, perguntasLd } from "@/lib/seo";
import { Perguntas } from "@/components/Perguntas";
import { JsonLd } from "@/components/Blocos";

export const metadata = meta({ titulo: "Perguntas frequentes · Bossa Empreendimentos", descricao: "Prazos de entrega, plantas, distância do mar, pagamento direto com a construtora e compra morando fora do Brasil.", caminho: "/perguntas" });

const GRUPOS = [["bossa", "Sobre a Bossa"], ["alma", "Alma Seahouses"], ["flow", "Flow Aptos"], ["compra", "Compra"]] as const;

export default function PaginaPerguntas() {
  const todas = [...perguntas, { grupo: "alma" as const, ...perguntaAlmaCompra[ALMA_ESTADO] }];
  return (
    <section className="sec">
      <JsonLd dados={perguntasLd(todas)} />
      <div className="wrap pilha" style={{ gap: 48, maxWidth: 980 }}>
        <div className="pilha"><p className="rotulo">Perguntas frequentes</p><h1 className="h1">O que mais nos perguntam.</h1></div>
        {GRUPOS.map(([g, t]) => (
          <div className="pilha" key={g}><h2 className="h3">{t}</h2><Perguntas itens={todas.filter((q) => q.grupo === g)} /></div>
        ))}
      </div>
    </section>
  );
}
