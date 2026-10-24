"use client";
import Image from "next/image";
import { VideoFlowModal } from "./VideoFlowModal";

const aplicacoes = [
  {
    espessura: "20 cm",
    local: "Entre apartamentos",
    texto: "Bloco acústico na separação entre unidades, com foco na privacidade.",
  },
  {
    espessura: "14 cm",
    local: "Nas fachadas",
    texto: "Concreto celular nas paredes externas dos apartamentos, contribuindo para o conforto térmico.",
  },
  {
    espessura: "11 cm",
    local: "Nas divisões internas",
    texto: "Alvenaria nas divisões de quartos e banheiros, conforme a aplicação definida em projeto.",
  },
];

export function AlvenariaFlow() {
  return (
    <div className="fl-alvenaria">
      <div className="fl-alvenaria__conteudo">
        <p className="fl-rot">ALVENARIA CELUCON</p>
        <h3 className="fl-h3">Mais conforto, desde a alvenaria.</h3>
        <p className="fl-p">
          No Flow, a Bossa escolheu blocos de concreto celular Celucon com
          espessuras específicas para cada parte do apartamento. Uma decisão de
          engenharia voltada ao conforto térmico e ao cuidado com a transmissão
          de ruídos.
        </p>
        <dl className="fl-alvenaria__aplicacoes">
          {aplicacoes.map((item) => (
            <div key={item.local}>
              <dt>{item.local}</dt>
              <dd>
                <strong>{item.espessura}</strong>
                <span>{item.texto}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="fl-p">
          As células de ar do material ajudam a reduzir a passagem de calor.
          Entre apartamentos, o bloco acústico integra as soluções de conforto
          sonoro. O resultado depende do conjunto da parede e da sua execução.
        </p>
      </div>
      <figure className="fl-alvenaria__registro">
        <Image
          src="/img/flow/engenharia/alvenaria-celucon.webp"
          alt="Profissional trabalha junto à alvenaria de concreto celular na obra do Flow"
          width={640}
          height={1138}
          sizes="(max-width:540px) 90vw, 360px"
        />
        <figcaption>
          Execução da alvenaria do Flow. Registro extraído do vídeo da Celucon.
        </figcaption>
      </figure>
      <div className="fl-alvenaria__videos">
        <VideoFlowModal
          src="/video/flow/fabio-bloco-celular.mp4"
          poster="/img/flow/engenharia/fabio-bloco-celular.webp"
          nome="Por que a Bossa escolheu o concreto celular?"
          legenda="Fábio Nicodemus explica a escolha para o Flow"
          video="fabio-bloco-celular"
        />
        <VideoFlowModal
          src="/video/flow/demonstracao-acustica-celucon.mp4"
          poster="/img/flow/engenharia/demonstracao-acustica-celucon.webp"
          nome="Ouça a demonstração do material"
          legenda="Demonstração com uma amostra de concreto celular"
          video="demonstracao-acustica-celucon"
        />
        <VideoFlowModal
          src="/video/flow/celucon-na-obra.mp4"
          poster="/img/flow/engenharia/celucon-na-obra.webp"
          nome="Celucon na obra do Flow"
          legenda="Acompanhamento do fabricante na etapa de alvenaria"
          video="celucon-na-obra"
        />
      </div>
      <p className="fl-alvenaria__nota fl-nota">
        A demonstração com a amostra ilustra o comportamento do material. O
        desempenho acústico do apartamento depende do sistema construtivo
        completo e não é medido nesse vídeo.
      </p>
    </div>
  );
}
