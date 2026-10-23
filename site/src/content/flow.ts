import type { Planta } from "./empreendimentos";
// Preencher somente com legendas/transcrições recebidas e revisadas; nunca gerar uma fala presumida.
export const acessibilidadeVideosFlow: Record<
  string,
  { legendas?: string; transcricao?: string }
> = {};
export const flowMeta = {
  titulo:
    "Flow Aptos | 2 suítes, lazer em dois pavimentos e entrega 2027 | Bossa",
  descricao:
    "Conheça o Flow Aptos em Balneário Perequê, Porto Belo. Plantas de 62 e 73 m² com duas suítes, duplex, Flow Move e rooftop no 24º pavimento. Entrega prevista novembro de 2027.",
  imagem: "/img/flow/piscina.jpg",
  imagemLargura: 2400,
  imagemAltura: 1412,
};
export const flowMetaPlanta = (p: Planta) => ({
  titulo: `Flow Aptos: ${p.nome}, ${p.area}, ${p.suites} suítes | Bossa`,
  descricao: `Conheça a planta ${p.nome} do Flow Aptos: ${p.area}, ${p.suites} suítes. Consulte o desenho ilustrativo e converse sobre uma visita. Entrega prevista novembro de 2027.`,
  imagem: flowMeta.imagem,
  imagemLargura: 2400,
  imagemAltura: 1412,
});
export const mensagemFlow = (p?: Planta, visita = false) =>
  `Olá! ${visita ? "Quero solicitar uma visita para conhecer o Flow Aptos. Sei que data, horário e acesso serão confirmados pela equipe." : "Estou conhecendo o Flow Aptos e gostaria de conversar."}${p ? ` Estou consultando ${p.nome}, ${p.area}, ${p.suites} suítes.` : ""}`;
export const faqFlow = [
  {
    p: "A que distância fica da Praia do Perequê?",
    r: "A distância divulgada é de aproximadamente 800 metros. O percurso depende do acesso utilizado. Você pode consultar o endereço no mapa.",
  },
  {
    p: "Quais apartamentos existem?",
    r: "As plantas tipo têm 62 ou 73 m² e duas suítes. Os duplex têm 93 ou 117,7 m² e três suítes.",
  },
  {
    p: "Como funcionam as áreas de lazer?",
    r: "O Flow Move fica no 5º pavimento e o The Roof no 24º. Ambos reúnem os ambientes descritos nesta página.",
  },
  {
    p: "Quando está prevista a entrega?",
    r: "Novembro de 2027. A equipe pode esclarecer o cronograma e as condições contratuais da unidade de interesse.",
  },
  {
    p: "Como acompanho a construção?",
    r: "Pelos boletins divulgados pela Bossa. A edição nº 25, de setembro de 2026, registrou avanço geral de 57,87%.",
  },
  {
    p: "Como confirmo unidade, andar, vagas e condições comerciais?",
    r: "A equipe consulta as informações atuais da unidade de seu interesse e apresenta os detalhes confirmados.",
  },
  {
    p: "Posso visitar?",
    r: "Sim. Solicite uma visita; nossa equipe combina data, horário e as condições de acesso.",
  },
];
export const engenhariaFlow = [
  [
    "Menos ruído de passos entre andares.",
    "O Flow conta com a manta de lã de PET FS Floor, da Fibersoft, entre a laje e o contrapiso. Essa camada ajuda a reduzir a transmissão de ruídos de impacto, como passos e movimentação de móveis.",
    "Conforto acústico pensado também no piso.",
  ],
  [
    "Áreas molhadas: atenção antes do revestimento.",
    "O boletim de setembro detalha impermeabilização e assentamento do box.",
    "Boletim nº 25 · setembro de 2026.",
  ],
  [
    "Churrasqueira: exaustão prevista em projeto.",
    "A churrasqueira a carvão possui coifa e sistema de exaustão previstos no projeto. Conheça o detalhamento com a equipe.",
    "Conheça o detalhamento com a equipe.",
  ],
  [
    "Esquadrias: projeto e instalação.",
    "Conheça a especificação e o estágio de execução das aberturas.",
    "Esquadrias metálicas: 18% no boletim de setembro de 2026.",
  ],
];

/** Preencher somente com registros reais aprovados e identificação completa da execução. */
export const fotosEngenhariaFlow: Record<
  string,
  {
    src: string;
    alt: string;
    mesAno: string;
    pavimento: string;
    atividade: string;
  }
> = {};
