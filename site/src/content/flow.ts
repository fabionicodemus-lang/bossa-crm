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
    p: "A que distância fica da praia?",
    r: "A distância divulgada até a Praia do Perequê é de aproximadamente 800 metros. O percurso efetivo depende do acesso utilizado. O Flow fica na Rua São José, 163, em Porto Belo. A consulta de endereço no mapa não representa uma rota pedonal aferida.",
  },
  {
    p: "Quais plantas existem?",
    r: "São cinco opções: Tipo 2 e Tipo 3, de 62 m², e Tipo 1, de 73 m², com duas suítes; Duplex Tipo 2 e 3, de 93 m², e Duplex Tipo 1, de 117,7 m², com três suítes e living de pé-direito duplo. Consulte a equipe sobre as condições atuais. Vagas não estão confirmadas nesta apresentação.",
  },
  {
    p: "O que há no Flow Move e no The Roof?",
    r: "No 5º pavimento, o Flow Move reúne coworking, fitness, Flow Store, lavanderia, playground, espaço zen e Cine Flow. No 24º, o The Roof tem piscina com infraestrutura para aquecimento, gourmet, pub, brinquedoteca e salão de festas. São áreas comuns, diferentes da área privativa do apartamento.",
  },
  {
    p: "Quando está prevista a entrega?",
    r: "A entrega do Flow está prevista para novembro de 2027. Acompanhe as informações atualizadas com a Bossa; a previsão não é promessa de antecipação.",
  },
  {
    p: "Como acompanhar a obra?",
    r: "Pelas edições periódicas publicadas pela Bossa. O boletim disponível nesta apresentação é a edição 25, de setembro de 2026, com 57,87%. Esse percentual é histórico e não representa uma nova medição em outubro.",
  },
  {
    p: "Posso visitar?",
    r: "Sim. Solicite uma visita à equipe. O escritório da Bossa fica na Rua São José, 163, no térreo do Flow. Data, horário e eventual acesso à obra dependem de confirmação da equipe e das condições de segurança. O pedido pelo site não confirma agendamento.",
  },
];
export const engenhariaFlow = [
  [
    "Conforto entre os ambientes",
    "Isolamento acústico e térmico entre lajes e paredes de divisa, conforme as especificações de acabamentos do Flow. Uma solução de projeto para conforto, sem promessa de silêncio absoluto.",
    "Referência: especificações de acabamentos do Flow, aprovadas no conteúdo do site.",
  ],
  [
    "Materiais e execução",
    "Porcelanato no living e piso vinílico nas suítes. O boletim de setembro de 2026 descreve impermeabilização e dupla colagem no box.",
    "Referência: acabamentos do Flow e boletim nº 25, setembro/2026.",
  ],
  [
    "Churrasqueira com exaustão",
    "Churrasqueira a carvão com coifa, damper e sistema de exaustão previsto no projeto. Conheça os detalhes de execução com a equipe.",
    "Referência: especificações de instalações e acabamentos do Flow.",
  ],
  [
    "Esquadrias e aberturas",
    "Esquadrias normatizadas e aberturas que fazem parte das decisões de conforto do projeto. A equipe pode esclarecer especificações e abrangência.",
    "Referência: especificação aprovada da Etapa 2; detalhamento técnico a consultar com a Bossa.",
  ],
];
