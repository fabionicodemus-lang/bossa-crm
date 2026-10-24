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
export const isolamentoPisoFlow = {
  titulo: "Menos ruído de passos entre andares.",
  descricao:
    "O Flow conta com a manta de lã de PET FS Floor, da Fibersoft, com 8 mm de espessura, entre a laje e o contrapiso. Essa camada ajuda a reduzir a transmissão de ruídos de impacto, como passos e movimentação de móveis.",
  fotos: [
    {
      src: "/img/flow/engenharia/manta-fs-floor-aplicacao.webp",
      alt: "Manta Fibersoft cobrindo o piso e acompanhando as bordas das paredes na obra do Flow",
      titulo: "Manta acústica aplicada no Flow",
    },
    {
      src: "/img/flow/engenharia/manta-fs-floor-circulacao.webp",
      alt: "Manta Fibersoft instalada no piso de um ambiente e na circulação do Flow, antes do contrapiso",
      titulo: "Aplicação na circulação",
    },
    {
      src: "/img/flow/engenharia/manta-fs-floor-ambiente.webp",
      alt: "Vista de outro ambiente do Flow com a manta Fibersoft cobrindo o piso antes do contrapiso",
      titulo: "Aplicação em outro ambiente",
    },
  ],
} as const;

export const impermeabilizacaoFlow = {
  titulo: "O cuidado que fica sob o revestimento.",
  descricao:
    "Nos banheiros do Flow, a impermeabilização é executada sobre o contrapiso com caimento para o ralo. Usamos o Vedatop Ultraflex 12000, da Vedacit, em um processo que inclui reforço nos pontos críticos e teste antes de liberar o revestimento.",
  etapas: [
    {
      titulo: "Preparar a base",
      texto: "Contrapiso com caimento para o ralo, superfície preparada e atenção aos encontros entre piso, paredes e tubulações.",
    },
    {
      titulo: "Preparar o produto",
      texto: "Mistura dos dois componentes conforme as orientações do fabricante, para formar a membrana impermeabilizante.",
    },
    {
      titulo: "Aplicar e reforçar",
      texto: "Tela de reforço nos cantos, ao redor dos ralos e na área do box. Demãos cruzadas, respeitando o consumo e os intervalos de aplicação.",
    },
    {
      titulo: "Respeitar a cura",
      texto: "Aguardar a cura do sistema conforme as condições do ambiente e as orientações do fabricante antes de iniciar o teste.",
    },
    {
      titulo: "Testar por 72 horas",
      texto: "Com o ralo vedado, uma lâmina d’água permite conferir o nível e verificar o teto do pavimento inferior. Havendo falha, o trecho é corrigido e o teste, repetido.",
    },
    {
      titulo: "Conferir e liberar",
      texto: "A próxima etapa do acabamento só é liberada após a aprovação do teste de estanqueidade.",
    },
  ],
} as const;

export const engenhariaFlow = [
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

