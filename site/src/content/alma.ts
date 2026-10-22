import type { Planta } from "./empreendimentos";
export const almaMeta = {
  titulo: "Alma Sea Houses em Perequê | Bossa Empreendimentos",
  descricao:
    "Apartamentos de 3 suítes e duplex de 4 suítes em Perequê, Porto Belo. Conheça as plantas, os espaços de convivência e o projeto do Alma.",
  imagem: "/img/alma/fachada.jpg",
};
export const almaFaq = [
  {
    id: "1",
    p: "Quais são as opções de apartamento do Alma?",
    r: "O Alma tem apartamentos de 103 e 114 m² privativos, com três suítes, e duplex de 145 e 168 m² privativos, com quatro suítes. Todas as quatro tipologias têm duas vagas de garagem.",
  },
  {
    id: "2",
    p: "Como comparar os apartamentos de 103 e 114 m²?",
    r: "Os dois têm três suítes e duas vagas. Você pode ampliar as plantas para conhecer a organização de cada opção. Para comparar medidas de ambientes e possibilidades de mobiliário, converse com a equipe sobre os desenhos técnicos disponíveis.",
  },
  {
    id: "3",
    p: "Por que as plantas dos duplex mostram dois apartamentos?",
    r: "As imagens disponíveis são pranchas gerais do pavimento, com duas unidades e a circulação comum. O desenho completo não representa a área privativa de um único duplex. Nossa equipe pode orientar a identificação da opção que você deseja conhecer.",
  },
  {
    id: "4",
    p: "Quantos apartamentos há por andar?",
    r: "São dois apartamentos por andar, em um empreendimento com 48 unidades no total.",
  },
  {
    id: "5",
    p: "O Alma fica de frente para o mar?",
    r: "Não. O Alma fica na Rua Wilson Belber, 316, em Perequê, com distância de referência de aproximadamente 300 m da praia. Você pode assistir ao vídeo do percurso e abrir o endereço no mapa nesta página.",
  },
  {
    id: "6",
    p: "Quais ambientes de lazer estão previstos?",
    r: "São 850 m² de lazer distribuídos em dois pavimentos. O projeto reúne piscina, espaços para brincar, receber e cuidar de si, incluindo playground, brinquedoteca, gourmet, salão de festas, academia, casa de banho e sauna. Veja a seção de lazer para conhecer os ambientes e seus pavimentos.",
  },
  {
    id: "7",
    p: "Qual é a previsão de entrega?",
    r: "A entrega do Alma está prevista para julho de 2030. A construção teve início em julho de 2025.",
  },
  {
    id: "8",
    p: "Como posso acompanhar a obra?",
    r: "Consulte os boletins de obra disponíveis no site. A edição de agosto de 2026 informa avanço geral de 10,52% naquele período. Para informações mais recentes, converse com a equipe Bossa.",
  },
  {
    id: "9",
    p: "As imagens mostram a vista do meu futuro apartamento?",
    r: "As imagens de drone são referências do entorno em alturas associadas ao projeto. A vista de cada apartamento depende da posição e do pavimento e pode mudar com o entorno. Os renders são perspectivas ilustrativas.",
  },
  {
    id: "10",
    p: "Posso conhecer o projeto pessoalmente?",
    r: "Você pode solicitar uma apresentação à equipe Bossa no escritório da Rua São José, 163, térreo do Flow, em Perequê, Porto Belo. O dia e o horário são combinados e confirmados pela equipe. A apresentação é do projeto do Alma.",
  },
  {
    id: "11",
    p: "Posso conversar sobre personalização ou mobiliário?",
    r: "Conte à equipe o que você imagina para sua rotina. Possibilidades de alteração dependem de avaliação técnica e das condições aplicáveis ao projeto. As plantas e imagens desta página não representam uma autorização de personalização.",
  },
  {
    id: "12",
    p: "Já existe um valor de condomínio informado?",
    r: "A página ainda não apresenta uma estimativa de condomínio. Converse com a equipe para conhecer as informações disponíveis sobre a futura operação do empreendimento.",
  },
  {
    id: "13",
    p: "Quais cuidados de conforto estão previstos nos apartamentos?",
    r: "O projeto prevê isolamento acústico e térmico entre lajes e paredes de divisa, porcelanato no living, vinílico nas suítes e área de serviço fechada e ventilada. Também há infraestrutura para split e automação, que não significa fornecimento dos aparelhos. Consulte a seção de conforto e converse com a equipe sobre o detalhamento das especificações.",
  },
];
export const avisoDuplex =
  "Estas pranchas mostram duas unidades e a circulação comum do pavimento. O desenho completo não corresponde à área privativa de um único apartamento. Converse com a equipe para identificar o duplex de seu interesse.";
export const avisoTipo =
  "Planta humanizada ilustrativa. Consulte a equipe sobre o detalhamento do projeto.";
export const mensagemAlma =
  "Olá! Quero conhecer melhor o Alma Sea Houses e entender as opções do projeto.";
export const mensagemPlanta = (p: Planta) =>
  `Olá! Estou conhecendo o Alma Sea Houses e gostaria de conversar sobre a opção de ${p.areaNum} m², ${p.nome}, com ${p.suites} suítes.`;
export const mensagemApresentacao = (p?: Planta) =>
  `Olá! Gostaria de solicitar uma apresentação do projeto do Alma Sea Houses${p ? ` e entender melhor a opção de ${p.areaNum} m², ${p.nome}, com ${p.suites} suítes` : ""}. Podemos combinar um dia e horário?`;
export const tituloPlanta = (p: Planta) =>
  `${p.area} · ${p.suites === 4 ? "Duplex de 4 suítes" : "3 suítes"}`;
export const descricaoPlanta = (p: Planta) =>
  p.suites === 4
    ? `${p.nome}, com quatro suítes, lavabo, churrasqueira a carvão e pé-direito duplo. Duas vagas de garagem.`
    : `Apartamento ${p.nome}, com três suítes, lavabo, living integrado à cozinha e churrasqueira a carvão. Duas vagas de garagem.`;
export const plantaAlt = (p: Planta, prancha: number) =>
  p.suites === 4
    ? `Prancha geral dos duplex, arquivo ${prancha === 0 ? "inferior" : "superior"}, com duas unidades e circulação comum. Limites da tipologia selecionada não destacados.`
    : `Planta humanizada do ${p.nome} do Alma, com ${p.area} e três suítes.`;
export const almaMetaPlanta = (p: Planta) => ({
  titulo:
    p.suites === 4
      ? `Alma Sea Houses: duplex de ${p.area} | Bossa`
      : `Alma Sea Houses: ${p.area}, 3 suítes | Bossa`,
  descricao:
    p.suites === 4
      ? `Conheça a opção de ${p.area}, com 4 suítes e 2 vagas. Consulte as pranchas gerais do pavimento e converse sobre o ${p.nome}.`
      : `Conheça o ${p.nome} do Alma: ${p.area} privativos, 3 suítes e 2 vagas. Amplie a planta e converse com a equipe sobre o projeto.`,
  imagem: p.suites === 4 ? "/img/alma/fachada.jpg" : p.imagens[0].src,
});
export const midiasAlma = {
  M01: {
    nome: "Imagem: família no living do Alma",
    proporcao: "16:9",
    alternativa: "/img/alma/living.jpg",
  },
  M02: { nome: "Vídeo: Fábio apresenta o Alma", proporcao: "16:9" },
  M03: { nome: "Fotos e vídeo: obra do Alma em mês/ano", proporcao: "16:9" },
  M04A: { nome: "Foto real: Jazz entregue", proporcao: "4:3" },
  M04B: { nome: "Foto real: Soul entregue", proporcao: "4:3" },
  M05: { nome: "Vídeo: conheça as plantas de 103 e 114 m²", proporcao: "16:9" },
  M06: {
    nome: "Imagem técnica: pavimento, acessos e duas unidades",
    proporcao: "4:3",
  },
  M07: { nome: "Imagem: o apoio na volta da praia", proporcao: "4:3" },
  M08: { nome: "Vídeo: uma manhã em família no Perequê", proporcao: "16:9" },
} as const;
export const confortoAlma = [
  [
    "Conforto entre os ambientes",
    "Isolamento acústico e térmico entre lajes e paredes de divisa: uma escolha de projeto voltada ao conforto dentro de casa.",
  ],
  [
    "Materiais para diferentes momentos",
    "Porcelanato no living e piso vinílico nas suítes acompanham os diferentes usos da casa, da convivência aos momentos de descanso.",
  ],
  [
    "Um apoio para a rotina",
    "Área de serviço fechada e ventilada para as tarefas do dia a dia, além de área técnica com brise.",
  ],
  [
    "A volta da praia",
    "Entrada de banhistas, ducha/lava-pés e box de praia individual dão apoio ao retorno do mar.",
  ],
  [
    "Infraestrutura para suas escolhas",
    "Infraestrutura prevista para split e automação permite planejar a instalação desses recursos, conforme o projeto.",
  ],
  [
    "O condomínio no conjunto",
    "Medição individual de água, energia e gás para acompanhar os consumos da unidade. Dois elevadores e lazer previsto mobiliado e equipado completam o conjunto.",
  ],
];
export const especificacoesAlma = [
  [
    "Apartamento",
    "Living integrado à cozinha; lavabo; churrasqueira a carvão com exaustão e damper; porcelanato no living; vinílico nas suítes; forro de gesso com cortineiro; nicho revestido.",
  ],
  [
    "Conforto e instalações",
    "Isolamento acústico e térmico nas lajes e paredes de divisa conforme o projeto; água quente e monocomando; infraestrutura para split e automação; área técnica com brise; área de serviço fechada e ventilada.",
  ],
  [
    "Apoio à praia",
    "Entrada de banhistas, ducha/lava-pés e box de praia individual.",
  ],
  [
    "Áreas comuns e sistemas",
    "Dois elevadores; hall mobiliado, decorado e sonorizado; lazer mobiliado, decorado, equipado e com enxoval; medição individual de água, energia e gás; previsão de gerador de emergência e reuso de água da chuva.",
  ],
];

/** Só preencher após conferir o arquivo, direitos, legenda e aprovação editorial.
 * Fotos de obra precisam de data própria, independente do mês da medição.
 * Vídeos narrados exigem legendas revisadas e transcrição. */
export type MidiaAlmaAprovada =
  | { tipo: "imagem"; src: string; alt: string; legenda: string }
  | {
      tipo: "video";
      src: string;
      poster: string;
      legenda: string;
      legendas: string;
      transcricao: string;
    };
export const midiasAprovadasAlma: Partial<
  Record<keyof typeof midiasAlma, MidiaAlmaAprovada>
> = {};
