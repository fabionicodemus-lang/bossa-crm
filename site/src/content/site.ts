// Conteúdo institucional aprovado na Fase 4 (17/10/2026).
// Itens entre [colchetes] são pendências: aparecem no site só depois de preenchidos.

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.bossaempreendimentos.com.br";
export const WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP || ""; // número da Nara, só dígitos
export const ALMA_ESTADO = (process.env.NEXT_PUBLIC_ALMA_ESTADO || "pre-registro") as "pre-registro" | "registrado";

export const empresa = {
  nome: "Bossa Empreendimentos",
  fundacao: 2017,
  fundadores: ["Sabrina", "Carlos"],
  endereco: { rua: "R. 406-B, 272", bairro: "Morretes", cidade: "Itapema", uf: "SC", cep: "88220-000" },
  email: "contato@bossaempreendimentos.com.br",
  instagram: "https://instagram.com/bossaempreendimentos/",
  facebook: "https://www.facebook.com/bossaempreendimentos",
  definicao:
    "A Bossa Empreendimentos é uma incorporadora fundada em 2017 que atua em Porto Belo e Itapema, em Santa Catarina. Constrói poucos empreendimentos por vez para acompanhar cada obra de perto: entregou o Jazz Residence em 2019, um ano e oito meses antes do prazo, e o Soul Residence em 2023, no prazo, e tem em obra o Flow Aptos, com entrega em novembro de 2027, e o Alma Seahouses, com entrega em julho de 2030, ambos no Balneário Perequê, em Porto Belo.",
  assinatura: "Construímos pouco. Para entregar tudo.",
};

export const pilares = [
  { n: "01", titulo: "Poucos projetos por vez", texto: "A direção acompanha cada obra toda semana, não só no lançamento.", prova: "Hoje: 2 obras em execução" },
  { n: "02", titulo: "Engenharia na decisão", texto: "O projeto bonito precisa funcionar na obra e na manutenção. A engenharia entra junto com a arquitetura, não depois.", prova: "O box com ralo linear do Flow" },
  { n: "03", titulo: "Obra que se mede", texto: "Topografia, prumo, nível, controle do concreto e testes antes de cada etapa. Obra boa se confere.", prova: "Teste de estanqueidade de 72 horas em cada box" },
  { n: "04", titulo: "Material é desempenho", texto: "Escolhemos acabamento pela estética, pela durabilidade e pela manutenção.", prova: "Porcelanato com dupla colagem e ensaio de arrancamento" },
  { n: "05", titulo: "Conforto que não aparece na foto", texto: "Isolamento acústico entre lajes, ventilação natural, exaustão das churrasqueiras.", prova: "Prumada de exaustão com exaustor no rooftop do Flow" },
  { n: "06", titulo: "Crescer com responsabilidade", texto: "Planejamento de caixa e orçamento por etapas, para crescer no ritmo que a engenharia consegue acompanhar.", prova: "" },
  { n: "07", titulo: "Obra transparente", texto: "Todo mês, o andamento de cada obra, pavimento a pavimento, publicado aqui.", prova: "Flow na edição nº 25, Alma na nº 07" },
  { n: "08", titulo: "A entrega faz parte da venda", texto: "A promessa só termina quando o apartamento está pronto e documentado.", prova: "Jazz um ano e oito meses antes do prazo; Soul no prazo" },
];

export const equipe = [
  { nome: "Sabrina", cargo: "Sócia diretora" },
  { nome: "Fábio Nicodemus", cargo: "Diretor de incorporações" },
  { nome: "Gabrielle", cargo: "Engenheira" },
  { nome: "Taís", cargo: "Gestora administrativa" },
  { nome: "Cíntia", cargo: "Secretária e marketing" },
  { nome: "Mateus", cargo: "Financeiro" },
];

export const linhaDoTempo = [
  { ano: "2017", titulo: "O começo", texto: "Sabrina e Carlos já comandavam uma empresa de rastreamento de caminhões que atendia operações como JBS, Mercado Livre e Seara. Em 2017 decidiram entrar na construção civil e fundaram a Bossa, em Itapema e Porto Belo.", periodo: "", href: "" },
  { ano: "2019", titulo: "Jazz Residence", texto: "14 apartamentos em Itapema. Sem nenhum prédio para mostrar, a Bossa bancou a obra inteira com capital próprio. Entregue um ano e oito meses antes do prazo. O Habite-se saiu 15 dias depois.", periodo: "nov/2017 → set/2019", href: "/empreendimentos/jazz-residence", img: "/img/jazz-1.jpg" },
  { ano: "2023", titulo: "Soul Residence", texto: "36 apartamentos e um rooftop completo, em Itapema. A obra começou em fevereiro de 2020, semanas antes da pandemia, e foi entregue em dezembro de 2023, no prazo.", periodo: "fev/2020 → dez/2023", href: "/empreendimentos/soul-residence", img: "/img/soul-3.jpg" },
  { ano: "2027", titulo: "Flow Aptos", texto: "O primeiro Bossa em Porto Belo. 57 apartamentos, entre eles os duplex, e dois andares de lazer no Balneário Perequê. Em setembro de 2026, 57,87% concluído.", periodo: "nov/2023 → nov/2027", href: "/empreendimentos/flow-aptos", img: "/img/flow-fachada-dia.jpg" },
  { ano: "2030", titulo: "Alma Seahouses", texto: "30 pavimentos, dois apartamentos por andar, a 300 metros da Praia do Perequê. A obra começou em julho de 2025.", periodo: "jul/2025 → jul/2030", href: "/empreendimentos/alma-seahouses", img: "/img/alma-fachada.jpg" },
];

export type Pergunta = { p: string; r: string; grupo: "bossa" | "alma" | "flow" | "compra" };
export const perguntas: Pergunta[] = [
  { grupo: "bossa", p: "O que é a Bossa Empreendimentos?", r: "Uma incorporadora fundada em 2017 que atua em Porto Belo e Itapema, em Santa Catarina, e constrói poucos empreendimentos por vez para acompanhar cada obra de perto. Já entregou o Jazz Residence e o Soul Residence e tem em obra o Flow Aptos e o Alma Seahouses." },
  { grupo: "bossa", p: "A Bossa já entregou algum empreendimento no prazo?", r: "Sim, os dois que lançou. O Jazz Residence foi entregue em setembro de 2019, um ano e oito meses antes do prazo, e o Soul Residence em dezembro de 2023, no prazo, mesmo com a pandemia no meio da obra." },
  { grupo: "bossa", p: "Por que a Bossa constrói poucos empreendimentos ao mesmo tempo?", r: "Para que a direção e a engenharia acompanhem cada obra toda semana. Com poucas obras, as decisões técnicas são tomadas por quem está perto delas." },
  { grupo: "bossa", p: "Como acompanho a obra do meu apartamento?", r: "Todo mês publicamos o andamento de cada obra na página Obras, com percentual, fotos e o que avançou pavimento a pavimento. A mesma edição chega por WhatsApp a quem pedir." },
  { grupo: "bossa", p: "Porto Belo e Itapema são a mesma região?", r: "São cidades vizinhas, separadas por uma ponte sobre o Rio Perequê. As obras atuais da Bossa, no Balneário Perequê, ficam a cerca de 5 km dos empreendimentos entregues em Itapema." },
  { grupo: "alma", p: "O Alma Seahouses é frente mar?", r: "Não. Fica a 300 metros da Praia do Perequê, cerca de 4 minutos a pé, numa rua residencial." },
  { grupo: "alma", p: "Quais são as plantas do Alma Seahouses?", r: "Quatro: 103 e 114 m² com 3 suítes, e duplex de 145 e 168 m² com 4 suítes. Todas têm 2 vagas, e são dois apartamentos por andar." },
  { grupo: "alma", p: "Quando o Alma Seahouses será entregue?", r: "A entrega está prevista para julho de 2030. A obra começou em julho de 2025 e estava com 10,52% em agosto de 2026." },
  { grupo: "flow", p: "A que distância do mar fica o Flow Aptos?", r: "A 800 metros da Praia do Perequê, cerca de 3 minutos de carro, na Rua São José, 163." },
  { grupo: "flow", p: "Quais são as plantas do Flow Aptos?", r: "Apartamentos de 2 suítes com 62 e 73 m², e duplex de 3 suítes com 93 e 117,7 m² e living com pé-direito duplo." },
  { grupo: "flow", p: "Em que fase está a obra do Flow Aptos?", r: "Em setembro de 2026 estava com 57,87%: estrutura concluída, alvenaria no rooftop e acabamentos subindo a torre. A entrega está prevista para novembro de 2027." },
  { grupo: "compra", p: "Posso comprar morando fora do Brasil?", r: "Sim. O atendimento pode ser todo feito pelo WhatsApp, e você acompanha a obra pelas edições mensais publicadas aqui." },
];

export const perguntaAlmaCompra = {
  "pre-registro": { p: "Já posso comprar no Alma?", r: "A incorporação está em registro. Até lá, você pode registrar seu interesse e será avisado primeiro." },
  registrado: { p: "Já posso comprar no Alma?", r: "Sim. As condições são direto com a construtora: simule na página do Alma ou fale conosco." },
};

export const distanciasHome = [
  ["Praia do Perequê, a partir do Alma", "300 m"],
  ["Praia do Perequê, a partir do Flow", "800 m"],
  ["Itapema", "3 min de carro"],
  ["Balneário Camboriú", "15 min"],
  ["Florianópolis", "40 min"],
  ["Aeroporto de Navegantes", "57 km"],
];

export const distanciasAlma = [
  ["Praia do Perequê", "300 m"], ["Píer do Centro de Porto Belo", "1 km"], ["Marina Porto das Águas", "2 km"], ["Itapema", "12 km"],
  ["Bombinhas", "17 km"], ["Balneário Camboriú", "35 km"], ["Aeroporto de Navegantes", "57 km"], ["Aeroporto de Florianópolis", "67 km"],
];

export const distanciasFlow = [
  ["Praia do Perequê", "3 min de carro"], ["Itapema", "3 min"], ["Marinas", "5 min"], ["Balneário Camboriú", "15 min"], ["Florianópolis", "40 min"],
];

export const acabamentosAlma = [
  "Porcelanato no living e piso vinílico nas suítes",
  "Forro de gesso em todos os ambientes, com cortineiro",
  "Isolamento acústico e térmico entre as lajes e nas paredes de divisa",
  "Churrasqueira a carvão com sistema de exaustão e damper",
  "Nicho do banho já revestido",
  "Água quente na cozinha e nos banheiros, registros monocomando",
  "Infraestrutura para ar-condicionado split, com área técnica protegida por brise",
  "Infraestrutura para automação",
  "Área de serviço fechada e ventilada",
];

export const acabamentosFlow = [
  "Porcelanato no living e piso vinílico nas suítes",
  "Forro de gesso em todos os ambientes, com cortineiro",
  "Fechadura eletrônica na porta de entrada",
  "Isolamento acústico e térmico entre as lajes e nas paredes de divisa",
  "Churrasqueira a carvão com exaustão própria e damper",
  "Box com ralo linear e nicho já revestido",
  "Água quente na cozinha e nos banheiros",
  "Infraestrutura para ar-condicionado split e para automação",
  "Sacada integrada com fechamento da esquadria",
];

export const notaLegal =
  "Imagens meramente ilustrativas. Projetos, plantas e acabamentos podem sofrer alterações durante o desenvolvimento da obra, conforme as normas legais e contratuais.";
export const notaAlmaPreRegistro =
  "Este empreendimento está com a incorporação em processo de registro e só poderá ser ofertado à venda depois do registro, nos termos da Lei 4.591/64.";

/** Texto entre colchetes = pendência. Não aparece no site publicado. */
export const pendente = (s: string | undefined | null) => !s || /^\s*\[/.test(s);
