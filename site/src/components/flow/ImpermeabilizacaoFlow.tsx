"use client";

import { impermeabilizacaoFlow } from "@/content/flow";
import { FotoFlow } from "./Experiencia";
import { VideoFlowModal } from "./VideoFlowModal";

export function ImpermeabilizacaoFlow() {
  return (
    <section
      id="impermeabilizacao"
      className="fl-imper"
      aria-labelledby="fl-imper-titulo"
    >
      <div className="fl-imper__conteudo">
        <p className="fl-rot">IMPERMEABILIZAÇÃO DOS BANHEIROS</p>
        <h3 id="fl-imper-titulo" className="fl-h3">
          {impermeabilizacaoFlow.titulo}
        </h3>
        <p className="fl-p">{impermeabilizacaoFlow.descricao}</p>
        <dl className="fl-imper__destaques">
          <div>
            <dt>Posição da membrana</dt>
            <dd>
              <strong>Sobre o contrapiso</strong>
              <span>Base com caimento para conduzir a água ao ralo.</span>
            </dd>
          </div>
          <div>
            <dt>Teste de estanqueidade</dt>
            <dd>
              <strong>72 h</strong>
              <span>Conferência antes da liberação do revestimento.</span>
            </dd>
          </div>
        </dl>
        <VideoFlowModal
          src="/video/flow/impermeabilizacao-flow.mp4"
          poster="/img/flow/engenharia/impermeabilizacao-aplicacao.webp"
          nome="Impermeabilização em execução"
          legenda="Aplicação e tela de reforço no Flow"
          video="impermeabilizacao-flow"
        />
        <a href="#visita" className="fl-link">
          Conhecer esses cuidados na obra ↗
        </a>
      </div>
      <div className="fl-imper__registro">
        <FotoFlow
          src="/img/flow/engenharia/impermeabilizacao-aplicacao.webp"
          alt="Aplicação do impermeabilizante sobre a tela de reforço no encontro entre piso e parede na obra do Flow"
          titulo="Reforço nos pontos críticos"
          legenda="Registro real da aplicação no Flow. Quadro extraído do vídeo enviado pela Bossa."
          inteira
          sizes="(max-width: 540px) 90vw, 320px"
        />
      </div>
      <details className="fl-imper__processo">
        <summary>Entenda as etapas e veja o esquema</summary>
        <div className="fl-imper__etapas">
          <ol>
            {impermeabilizacaoFlow.etapas.map((etapa) => (
              <li key={etapa.titulo}>
                <h4>{etapa.titulo}</h4>
                <p className="fl-p">{etapa.texto}</p>
              </li>
            ))}
          </ol>
          <FotoFlow
            src="/img/flow/engenharia/impermeabilizacao-esquema-newsletter.webp"
            alt="Esquema ilustrativo de camadas de impermeabilização com tela de reforço sob revestimento cerâmico"
            titulo="Como as camadas se organizam"
            legenda="Esquema ilustrativo da newsletter Bossa nº 22, de junho de 2026. A composição executiva depende do projeto e das especificações do sistema."
            inteira
            sizes="(max-width: 860px) 100vw, 40vw"
          />
        </div>
        <p className="fl-nota fl-imper__fonte">
          Processo descrito no Boletim nº 22 · junho de 2026. O teste faz parte
          da conferência de cada banheiro antes do revestimento.
        </p>
      </details>
    </section>
  );
}
