// Ficha oficial dos empreendimentos — validada por Fábio Nicodemus em 16 e 17/10/2026.
// Fonte única: toda página, metadado, dado estruturado e llms.txt lê daqui.
// Na próxima etapa estes dados passam a vir do painel (Sanity) e, preço e disponibilidade, do CRM.

export type Planta = {
  slug: string;
  nome: string;
  area: string; // texto com unidade, ex. "168 m²"
  areaNum: number;
  suites: number | null; // null = a confirmar
  vagas: number | null;
  descricao: string;
  imagens: { src: string; alt: string }[];
};

export type FichaItem = { numero: string; unidade?: string; legenda: string };
export type Foto = { src: string; alt: string; legenda?: string };

export type Edicao = {
  numero: number;
  mes: string; // "2026-09"
  mesExtenso: string; // "setembro de 2026"
  percentual: number;
  avanco: number;
  titulo: string;
  subtitulo: string;
  resumo: string;
  etapas: { nome: string; pct: number }[];
  frentes?: { pav: string; servico: string }[];
  carta?: string[];
  reportagem?: { titulo: string; texto: string; passos: { titulo: string; texto: string }[] };
  proximo?: string;
};

export type Empreendimento = {
  slug: string;
  nome: string;
  universo: "alma" | "flow" | "neutro";
  status: "obra" | "entregue";
  cidade: string;
  bairro: string;
  endereco?: string;
  rotulo: string;
  resumo: string;
  linhaCartao: string;
  statusCartao: string;
  inicioObra: string;
  entrega: string; // "jul/2030"
  entregaIso: string; // "2030-07"
  unidades: number;
  pavimentos?: number;
  distanciaMar?: string;
  ficha: FichaItem[];
  capa: Foto;
  cartao: Foto;
  galeria: Foto[];
  plantas: Planta[];
  edicoes: Edicao[];
  metaTitle: string;
  metaDescription: string;
};

const alma: Empreendimento = {
  slug: "alma-seahouses",
  nome: "Alma Seahouses",
  universo: "alma",
  status: "obra",
  cidade: "Porto Belo",
  bairro: "Balneário Perequê",
  endereco: "Rua Wilson Belber, 316",
  rotulo: "Em obra · Balneário Perequê, Porto Belo",
  resumo: "Dois apartamentos por andar, jardins em dois pavimentos de lazer e a Praia do Perequê a 300 metros.",
  linhaCartao: "300 m do mar · 3 e 4 suítes · entrega jul/2030",
  statusCartao: "Em obra",
  inicioObra: "jul/2025",
  entrega: "jul/2030",
  entregaIso: "2030-07",
  unidades: 48,
  pavimentos: 30,
  distanciaMar: "300 m",
  ficha: [
    { numero: "300", unidade: "m", legenda: "até a Praia do Perequê, 4 minutos a pé" },
    { numero: "2", unidade: "por andar", legenda: "48 apartamentos" },
    { numero: "3 e 4", unidade: "suítes", legenda: "de 103 a 168 m², 2 vagas" },
    { numero: "30", unidade: "pav.", legenda: "112 m de altura" },
    { numero: "07", unidade: "/2030", legenda: "entrega prevista" },
  ],
  capa: { src: "/img/alma-piscina.jpg", alt: "Piscina aquecida do Alma Seahouses com prainha, entre jardins, e o gourmet ao fundo" },
  cartao: { src: "/img/alma-fachada.jpg", alt: "Fachada do Alma Seahouses com varandas curvas e palmeiras" },
  galeria: [
    { src: "/img/alma-piscina.jpg", alt: "Piscina aquecida com prainha", legenda: "Piscina aquecida com prainha" },
    { src: "/img/alma-garden.jpg", alt: "Garden solarium com espreguiçadeiras entre jardins", legenda: "Garden solarium" },
    { src: "/img/alma-casa-de-banho.jpg", alt: "Casa de banho do Alma Seahouses", legenda: "Casa de banho" },
    { src: "/img/alma-academia.jpg", alt: "Academia panorâmica voltada para os jardins", legenda: "Academia panorâmica" },
    { src: "/img/alma-gourmet.jpg", alt: "Gourmet ao lado da piscina", legenda: "Gourmet da piscina" },
    { src: "/img/alma-pub.jpg", alt: "Pub com pé-direito duplo no rooftop", legenda: "Pub View · rooftop" },
    { src: "/img/alma-fireplace.jpg", alt: "Lareira e wine bar no rooftop", legenda: "Fire place e wine bar" },
    { src: "/img/alma-rooftop.jpg", alt: "Rooftop do Alma Seahouses", legenda: "Rooftop" },
    { src: "/img/alma-brinquedoteca.jpg", alt: "Brinquedoteca Floresta Encantada", legenda: "Brinquedoteca Floresta Encantada" },
    { src: "/img/alma-living.jpg", alt: "Living de um apartamento tipo do Alma", legenda: "Living · apartamento tipo" },
    { src: "/img/alma-duplex.jpg", alt: "Living com pé-direito duplo de um duplex do Alma", legenda: "Living · duplex" },
  ],
  plantas: [
    { slug: "tipo-02", nome: "Tipo 02", area: "103 m²", areaNum: 103, suites: 3, vagas: 2, descricao: "Living integrado à cozinha, lavabo e churrasqueira a carvão.", imagens: [{ src: "/img/alma-planta-tipo-02.jpg", alt: "Planta humanizada do Tipo 02 do Alma Seahouses, 103 m², 3 suítes" }] },
    { slug: "tipo-01", nome: "Tipo 01", area: "114 m²", areaNum: 114, suites: 3, vagas: 2, descricao: "Living integrado à cozinha, lavabo e churrasqueira a carvão.", imagens: [{ src: "/img/alma-planta-tipo-01.jpg", alt: "Planta humanizada do Tipo 01 do Alma Seahouses, 114 m², 3 suítes" }] },
    { slug: "duplex-tipo-2", nome: "Duplex Tipo 2", area: "145 m²", areaNum: 145, suites: 4, vagas: 2, descricao: "Dois pisos, living com pé-direito duplo.", imagens: [{ src: "/img/alma-planta-duplex-inferior.jpg", alt: "Planta do piso inferior dos duplex do Alma Seahouses" }, { src: "/img/alma-planta-duplex-superior.jpg", alt: "Planta do piso superior dos duplex do Alma Seahouses" }] },
    { slug: "duplex-tipo-1", nome: "Duplex Tipo 1", area: "168 m²", areaNum: 168, suites: 4, vagas: 2, descricao: "Dois pisos, living com pé-direito duplo e suíte master no piso superior.", imagens: [{ src: "/img/alma-planta-duplex-inferior.jpg", alt: "Planta do piso inferior dos duplex do Alma Seahouses" }, { src: "/img/alma-planta-duplex-superior.jpg", alt: "Planta do piso superior dos duplex do Alma Seahouses" }] },
  ],
  edicoes: [
    {
      numero: 7, mes: "2026-08", mesExtenso: "agosto de 2026", percentual: 10.52, avanco: 1.92,
      titulo: "Pronto para concretar.",
      subtitulo: "Agosto foi o mês de instalar o que fica escondido e de deixar tudo pronto para as grandes concretagens.",
      resumo: "O subsolo está pronto. Estacas e blocos concluídos, a cisterna de 51.000 litros concretada e toda a infraestrutura entre o piso e a laje do térreo instalada. Setembro traz a concretagem da laje do térreo, que abre caminho para a torre.",
      etapas: [
        { nome: "Estacas hélice", pct: 100 }, { nome: "Blocos de fundação", pct: 100 }, { nome: "Cisterna e reservatórios", pct: 100 },
        { nome: "Infra entre piso e laje", pct: 100 },
      ],
      carta: [
        "Prezados clientes e investidores, agosto avançou nos sistemas que ficam escondidos, mas sustentam o dia a dia do edifício. A cisterna foi concretada: a reserva de 51.000 litros agora é estrutura pronta na base do Alma.",
        "Também executamos todas as instalações que passam entre o piso e a laje do térreo: elétrica, hidráulica, prevenção de incêndio e o SPDA (para-raios). Depois que a laje for concretada, tudo isso fica selado, então precisa estar perfeito agora.",
      ],
      reportagem: {
        titulo: "Como o Alma se protege dos raios.",
        texto: "Numa torre à beira-mar, com 30 pavimentos e 107 m até o ponto de captação, a proteção contra raios não é detalhe. O SPDA capta o raio no ponto mais alto e o conduz com segurança até o solo, longe das pessoas, da estrutura e dos equipamentos.",
        passos: [
          { titulo: "Captação, no topo", texto: "Terminais no ponto mais alto do edifício recebem a descarga antes que ela atinja qualquer outra parte da torre." },
          { titulo: "Descidas, pela estrutura", texto: "Cabos conduzem a energia pela lateral do prédio, do topo até o solo, por um caminho controlado." },
          { titulo: "Aterramento, no subsolo", texto: "Uma malha enterrada dissipa a energia na terra. Projeto conforme a norma NBR 5419." },
        ],
      },
      proximo: "Setembro é o mês das grandes concretagens: as vigas baldrames e a laje do térreo, que abrem caminho para a estrutura vertical.",
    },
  ],
  metaTitle: "Alma Seahouses · 3 e 4 suítes a 300 m do mar em Porto Belo",
  metaDescription: "Dois por andar, 103 a 168 m², 850 m² de lazer e rooftop no 30º pavimento. Balneário Perequê, Porto Belo. Entrega prevista em julho de 2030.",
};

const flow: Empreendimento = {
  slug: "flow-aptos",
  nome: "Flow Aptos",
  universo: "flow",
  status: "obra",
  cidade: "Porto Belo",
  bairro: "Balneário Perequê",
  endereco: "Rua São José, 163",
  rotulo: "Em obra · Balneário Perequê, Porto Belo",
  resumo: "No ritmo da nossa vida. 57 apartamentos, duas suítes nas plantas tipo e três nos duplex, com lazer e conveniências em dois pavimentos.",
  linhaCartao: "800 m do mar · 2 e 3 suítes · entrega nov/2027",
  statusCartao: "Em obra · 57,87% · set/2026",
  inicioObra: "nov/2023",
  entrega: "nov/2027",
  entregaIso: "2027-11",
  unidades: 57,
  pavimentos: 24,
  distanciaMar: "800 m",
  ficha: [
    { numero: "800", unidade: "m", legenda: "até a Praia do Perequê" },
    { numero: "57", legenda: "apartamentos, incluindo duplex" },
    { numero: "2 e 3", unidade: "suítes", legenda: "de 62 a 117,7 m²" },
    { numero: "24", unidade: "pav.", legenda: "lazer no 5º e no 24º" },
    { numero: "11", unidade: "/2027", legenda: "entrega prevista" },
  ],
  capa: { src: "/img/flow-fachada-noite.jpg", alt: "Fachada iluminada do Flow Aptos ao entardecer" },
  cartao: { src: "/img/flow-rooftop.jpg", alt: "Piscina do rooftop The Roof, no 24º andar do Flow Aptos, com vista para a cidade" },
  galeria: [
    { src: "/img/flow-rooftop.jpg", alt: "Piscina do The Roof no 24º andar", legenda: "The Roof · piscina" },
    { src: "/img/flow-lounge.jpg", alt: "Lounge externo do Flow Move", legenda: "Lounge externo" },
    { src: "/img/flow-coworking.jpg", alt: "Coworking com sala de reuniões", legenda: "Coworking" },
    { src: "/img/flow-academia.jpg", alt: "Espaço fitness do Flow Aptos", legenda: "Espaço fitness" },
    { src: "/img/flow-pub.jpg", alt: "Pub do Flow Aptos", legenda: "Pub" },
    { src: "/img/flow-duplex-living.jpg", alt: "Living com pé-direito duplo de um duplex do Flow", legenda: "Living · duplex" },
    { src: "/img/flow-apto.jpg", alt: "Perspectiva ilustrativa de interior do acervo do Flow, tipologia não confirmada", legenda: "Interior · perspectiva ilustrativa" },
  ],
  plantas: [
    { slug: "tipo-2", nome: "Tipo 2", area: "62 m²", areaNum: 62, suites: 2, vagas: null, descricao: "Sol da manhã.", imagens: [{ src: "/img/flow/plantas/tipo2-62m2-aprovada-20261023.png", alt: "Planta humanizada ilustrativa do Tipo 2 do Flow Aptos, 62 m² e duas suítes" }] },
    { slug: "tipo-3", nome: "Tipo 3", area: "62 m²", areaNum: 62, suites: 2, vagas: null, descricao: "Sol da tarde.", imagens: [{ src: "/img/flow/plantas/tipo3-62m2-aprovada-20261023.png", alt: "Planta humanizada ilustrativa do Tipo 3 do Flow Aptos, 62 m² e duas suítes" }] },
    { slug: "tipo-1", nome: "Tipo 1", area: "73 m²", areaNum: 73, suites: 2, vagas: null, descricao: "Sol da manhã no living e da tarde nas suítes.", imagens: [{ src: "/img/flow/plantas/tipo1-73m2-aprovada-20261023.png", alt: "Planta humanizada ilustrativa do Tipo 1 do Flow Aptos, 73 m² e duas suítes" }] },
    { slug: "duplex-tipo-2-e-3", nome: "Duplex Tipo 2 e 3", area: "93 m²", areaNum: 93, suites: 3, vagas: null, descricao: "62 m² no piso inferior e 31 m² no superior. Living com pé-direito duplo, todo em vidro.", imagens: [{ src: "/img/flow-planta-duplex-tipo23.jpg", alt: "Plantas dos pisos inferior e superior dos duplex Tipo 2 e 3 do Flow Aptos" }] },
    { slug: "duplex-tipo-1", nome: "Duplex Tipo 1", area: "117,7 m²", areaNum: 117.7, suites: 3, vagas: null, descricao: "73 m² no piso inferior e 44,7 m² no superior. Living com pé-direito duplo de 4,90 m, todo em vidro.", imagens: [{ src: "/img/flow-planta-duplex-tipo1.jpg", alt: "Plantas dos pisos inferior e superior do duplex Tipo 1 do Flow Aptos" }] },
  ],
  edicoes: [
    {
      numero: 25, mes: "2026-09", mesExtenso: "setembro de 2026", percentual: 57.87, avanco: 2.39,
      titulo: "A alvenaria chegou ao Rooftop.",
      subtitulo: "Alvenaria e acabamentos avançam em etapas diferentes, conforme o boletim de setembro de 2026.",
      resumo: "A alvenaria chegou ao Rooftop e estava em 94,55%, com esquadrias metálicas em 18%, em setembro de 2026. O reboco interno está no 20º pavimento, o forro no 11º e o porcelanato no 6º. Em outubro, as equipes de reboco externo e de piso dobram.",
      etapas: [
        { nome: "Fundação", pct: 100 }, { nome: "Estrutura", pct: 100 }, { nome: "Alvenaria", pct: 94.55 }, { nome: "Infraestrutura", pct: 80 },
        { nome: "Instalações", pct: 53.2 }, { nome: "Revestimento interno", pct: 46.81 }, { nome: "Pavimentação interna", pct: 33.5 }, { nome: "Forro de gesso", pct: 29.91 },
        { nome: "Revestimento externo", pct: 25 }, { nome: "Impermeabilização", pct: 20 }, { nome: "Esquadrias metálicas", pct: 18 }, { nome: "Elevador", pct: 15 },
      ],
      frentes: [
        { pav: "RF", servico: "alvenaria em execução" }, { pav: "20º", servico: "reboco interno" }, { pav: "11º", servico: "forro de gesso" },
        { pav: "8º", servico: "impermeabilização dos banheiros" }, { pav: "6º", servico: "cerâmica e porcelanato" }, { pav: "Garagens", servico: "reboco interno" },
      ],
      carta: [
        "Prezados clientes e investidores, o boletim de setembro registra o avanço da alvenaria. A alvenaria executou os pavimentos 22 e 23 e já iniciou o Rooftop: o serviço chega a 94,55% enquanto as esquadrias metálicas estão em 18% nesse boletim.",
        "O reboco interno concluiu o 19º e passou da metade do 20º, seguindo também nas garagens. O forro de gesso finalizou dois pavimentos no mês, o 10º e o 11º. A impermeabilização dos banheiros chegou ao 8º, e o revestimento, cerâmica de parede e porcelanato de piso, está no 6º. Do lado de fora, o reboco externo já executa a fachada leste.",
      ],
      reportagem: {
        titulo: "O box por dentro.",
        texto: "O box é o metro quadrado mais exigido do apartamento. No Flow, duas decisões de projeto resolvem isso antes da obra começar: o ralo linear, que transforma o piso num plano único, e o nicho embutido, entregue revestido com o porcelanato da parede.",
        passos: [
          { titulo: "Nicho embutido na parede", texto: "Executado junto com a alvenaria, antes de qualquer revestimento." },
          { titulo: "Contrapiso com caimento em plano único", texto: "Todo o box cai na direção da linha do ralo." },
          { titulo: "Instalação do ralo linear", texto: "Nivelado com o piso acabado, sem degrau para a água." },
          { titulo: "Impermeabilização e teste de 72 horas", texto: "Sem aprovação do teste de estanqueidade, nenhuma peça é assentada." },
          { titulo: "Porcelanato com dupla colagem", texto: "Piso, parede e nicho com o mesmo porcelanato, argamassa AC-III." },
          { titulo: "Rejunte para área molhada", texto: "Aplicado após a cura, em todo o box." },
        ],
      },
      proximo: "Outubro dobra as equipes de reboco externo e de piso para acelerar os acabamentos.",
    },
  ],
  metaTitle: "Flow Aptos | 2 suítes, lazer em dois pavimentos e entrega 2027 | Bossa",
  metaDescription: "Conheça o Flow Aptos em Balneário Perequê, Porto Belo. Plantas de 62 e 73 m² com duas suítes, duplex, Flow Move e rooftop no 24º pavimento. Entrega prevista novembro de 2027.",
};

const soul: Empreendimento = {
  slug: "soul-residence",
  nome: "Soul Residence",
  universo: "neutro",
  status: "entregue",
  cidade: "Itapema",
  bairro: "Morretes",
  rotulo: "Entregue em dezembro de 2023 · Morretes, Itapema",
  resumo: "36 apartamentos e um rooftop completo. A obra começou em fevereiro de 2020, atravessou a pandemia e foi entregue no prazo.",
  linhaCartao: "Itapema · 36 apartamentos · obra de fev/2020 a dez/2023, no prazo, atravessando a pandemia",
  statusCartao: "Entregue em dez/2023",
  inicioObra: "fev/2020",
  entrega: "dez/2023",
  entregaIso: "2023-12",
  unidades: 36,
  ficha: [
    { numero: "36", unidade: "aptos", legenda: "e rooftop completo" },
    { numero: "12", unidade: "/2023", legenda: "entregue no prazo" },
    { numero: "60079", legenda: "registro de incorporação" },
  ],
  capa: { src: "/img/soul-3.jpg", alt: "Piscina do rooftop do Soul Residence pronto, com deck e espreguiçadeiras" },
  cartao: { src: "/img/soul-3.jpg", alt: "Rooftop do Soul Residence pronto" },
  galeria: [
    { src: "/img/soul-3.jpg", alt: "Rooftop do Soul com piscina", legenda: "Rooftop · foto real" },
    { src: "/img/soul-1.jpg", alt: "Salão de festas do Soul com mesa em mármore", legenda: "Salão de festas · foto real" },
    { src: "/img/soul-2.jpg", alt: "Espaço gourmet do Soul", legenda: "Gourmet · foto real" },
    { src: "/img/soul-cozinha.jpg", alt: "Cozinha de um apartamento do Soul", legenda: "Cozinha · foto real" },
    { src: "/img/soul-suite.jpg", alt: "Suíte de um apartamento do Soul", legenda: "Suíte · foto real" },
  ],
  plantas: [],
  edicoes: [],
  metaTitle: "Soul Residence · Entregue em 2023 em Itapema",
  metaDescription: "36 apartamentos e rooftop, entregue no prazo em dezembro de 2023. Um apartamento de 2 suítes, 70 m², pronto para morar.",
};

const jazz: Empreendimento = {
  slug: "jazz-residence",
  nome: "Jazz Residence",
  universo: "neutro",
  status: "entregue",
  cidade: "Itapema",
  bairro: "Itapema",
  rotulo: "Entregue em setembro de 2019 · Itapema",
  resumo: "O primeiro Bossa. 14 apartamentos em Itapema, financiados inteiramente com capital próprio, numa época em que a empresa ainda não tinha nenhum prédio para mostrar.",
  linhaCartao: "Itapema · 14 apartamentos · 1 ano e 8 meses antes do prazo · Habite-se 15 dias depois",
  statusCartao: "Entregue em set/2019",
  inicioObra: "nov/2017",
  entrega: "set/2019",
  entregaIso: "2019-09",
  unidades: 14,
  ficha: [
    { numero: "14", unidade: "aptos", legenda: "capital próprio" },
    { numero: "20", unidade: "meses", legenda: "antes do prazo (1 ano e 8 meses)" },
    { numero: "15", unidade: "dias", legenda: "até o Habite-se" },
  ],
  capa: { src: "/img/jazz-1.jpg", alt: "Fachada do Jazz Residence pronto, em Itapema" },
  cartao: { src: "/img/jazz-1.jpg", alt: "Fachada do Jazz Residence pronto" },
  galeria: [
    { src: "/img/jazz-1.jpg", alt: "Fachada do Jazz Residence", legenda: "Fachada · foto real" },
    { src: "/img/jazz-2.jpg", alt: "Cozinha integrada de um apartamento do Jazz", legenda: "Apartamento · foto real" },
  ],
  plantas: [],
  edicoes: [],
  metaTitle: "Jazz Residence · Entregue antes do prazo em Itapema",
  metaDescription: "O primeiro Bossa: 14 apartamentos entregues em setembro de 2019, um ano e oito meses antes do prazo.",
};

export const empreendimentos = [alma, flow, soul, jazz];
export const emObra = [alma, flow];
export const entregues = [soul, jazz];
export const getEmpreendimento = (slug: string) => empreendimentos.find((e) => e.slug === slug);
export { alma, flow, soul, jazz };

export const soulDisponivel = { area: "70 m²", suites: 2, detalhe: "[Andar, vaga, mobília e valor vindos do CRM]" };
