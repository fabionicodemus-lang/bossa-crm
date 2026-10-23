"use client";

import { isolamentoPisoFlow } from "@/content/flow";
import { FotoFlow } from "./Experiencia";

const legenda = "Registro real da obra do Flow, antes da execução do contrapiso.";

export function MantaAcusticaFlow() {
  const [principal, ...demais] = isolamentoPisoFlow.fotos;

  return (
    <section
      id="isolamento-piso"
      className="fl-manta"
      aria-labelledby="fl-manta-titulo"
    >
      <div className="fl-manta__conteudo">
        <p className="fl-rot">ISOLAMENTO ENTRE PAVIMENTOS</p>
        <h3 id="fl-manta-titulo" className="fl-h3">
          {isolamentoPisoFlow.titulo}
        </h3>
        <p className="fl-p">{isolamentoPisoFlow.descricao}</p>
        <p className="fl-manta__especificacao">
          <strong>8 mm</strong>
          <span>FS Floor · Fibersoft · lã de PET</span>
        </p>
        <a
          href={isolamentoPisoFlow.videoInstagram}
          target="_blank"
          rel="noopener noreferrer"
          className="fl-link"
        >
          Fábio explica a manta no Instagram ↗
        </a>
        <a href="#visita" className="fl-link">
          Conhecer esse cuidado na obra ↗
        </a>
      </div>
      <div className="fl-manta__registros">
        <FotoFlow
          {...principal}
          inteira
          legenda={legenda}
          sizes="(max-width: 860px) 100vw, 50vw"
        />
        <details className="fl-manta__mais">
          <summary>Ver mais 2 fotos da aplicação</summary>
          <div className="fl-manta__galeria">
            {demais.map((foto) => (
              <FotoFlow
                key={foto.src}
                {...foto}
                inteira
                legenda={legenda}
                sizes="(max-width: 540px) 100vw, (max-width: 860px) 50vw, 25vw"
              />
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}
