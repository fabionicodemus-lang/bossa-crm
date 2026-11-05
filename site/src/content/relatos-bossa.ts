/**
 * Depoimentos devem manter a redação original do cliente. Não publicar apenas
 * com base em uma conversa privada: confirmar autorização para texto e nome.
 * Não atribuir um relato do Jazz, Soul ou Flow a compradores do Alma.
 */
export type RelatoBossa = {
  nomePublico: string;
  identificacao: string;
  textoOriginal: string;
  tipo: "cliente" | "parceiro";
  destaqueHome: boolean;
  destaqueAlma: boolean;
  autorizacaoPublicacao: boolean;
};

// Textos e atribuições fornecidos e autorizados por Fábio em 05/11/2026.
// Quebras de linha de diagramação foram unidas, sem alterar as palavras.
export const relatosRecebidosBossa: RelatoBossa[] = [
  {
    nomePublico: "José Biondo Filho",
    identificacao: "Cliente Flow",
    textoOriginal: "A Bossa é a única construtora com quem não tive problemas.",
    tipo: "cliente",
    destaqueHome: true,
    destaqueAlma: false,
    autorizacaoPublicacao: true,
  },
  {
    nomePublico: "Liana Pellicioli",
    identificacao: "Cliente Soul",
    textoOriginal:
      "É a realização de um sonho. A Bossa traz uma satisfação muito grande quando entrega um sonho, não apenas um empreendimento.",
    tipo: "cliente",
    destaqueHome: true,
    destaqueAlma: true,
    autorizacaoPublicacao: true,
  },
  {
    nomePublico: "Débora Martins da Silva Schaeffer",
    identificacao: "Cliente Flow",
    textoOriginal:
      "Sei que meu investimento está em boas mãos. A Sabrina abriu mão do descanso no domingo para nos atender pessoalmente e mostrar tudo com clareza. E o acompanhamento de obra mês a mês é tão bacana.",
    tipo: "cliente",
    destaqueHome: true,
    destaqueAlma: true,
    autorizacaoPublicacao: true,
  },
  {
    nomePublico: "Luiz Carlos Alcantara de Almeida",
    identificacao: "Cliente Flow",
    textoOriginal:
      "Vi as reportagens sobre construtoras com problemas na região, mas sempre tive certeza que a Bossa não trabalha assim. Vocês são diferentes, transparentes no acompanhamento. Sempre indico — tenho muita confiança na empresa.",
    tipo: "cliente",
    destaqueHome: false,
    destaqueAlma: false,
    autorizacaoPublicacao: true,
  },
  {
    nomePublico: "Carlos Alberto Abreu Junior",
    identificacao: "Cliente Soul e Alma",
    textoOriginal:
      "Por tudo isso nossa escolha foi investir com a Bossa… essa semana já comentei sobre vocês umas 5 vezes.",
    tipo: "cliente",
    destaqueHome: false,
    destaqueAlma: true,
    autorizacaoPublicacao: true,
  },
  {
    nomePublico: "Jelson Alois Debatin",
    identificacao: "Cliente Flow e Alma",
    textoOriginal:
      "Até agora não tenho do que me queixar, está tudo certo! Tive antes uma experiência horrível, que ainda está na justiça. Com a Bossa, meu investimento está em boas mãos.",
    tipo: "cliente",
    destaqueHome: false,
    destaqueAlma: false,
    autorizacaoPublicacao: true,
  },
  {
    nomePublico: "Marison Pedrolo",
    identificacao: "Cliente Jazz",
    textoOriginal:
      "Parabéns à Bossa pela obra: superou todas as nossas expectativas. Acabamento caprichado e de muito bom gosto — estamos totalmente satisfeitos com o empreendimento.",
    tipo: "cliente",
    destaqueHome: true,
    destaqueAlma: true,
    autorizacaoPublicacao: true,
  },
  {
    nomePublico: "Maicon",
    identificacao: "JM Empreiteira · parceiro de obra",
    textoOriginal:
      "A Bossa nos proporciona um ótimo ambiente e os melhores materiais para trabalhar. Uma construtora diferenciada: a confiança dos proprietários e a qualidade são os grandes diferenciais.",
    tipo: "parceiro",
    destaqueHome: false,
    destaqueAlma: false,
    autorizacaoPublicacao: true,
  },
];

export const relatosPublicaveisBossa = relatosRecebidosBossa.filter(
  (relato) =>
    relato.autorizacaoPublicacao &&
    relato.nomePublico.trim() &&
    relato.identificacao.trim() &&
    relato.textoOriginal.trim(),
);

export const relatosDestaqueHome = relatosPublicaveisBossa.filter(
  (relato) => relato.tipo === "cliente" && relato.destaqueHome,
);
export const relatosComplementaresHome = relatosPublicaveisBossa.filter(
  (relato) => relato.tipo === "cliente" && !relato.destaqueHome,
);
export const relatosParceirosBossa = relatosPublicaveisBossa.filter(
  (relato) => relato.tipo === "parceiro",
);
export const relatosDestaqueAlma = relatosPublicaveisBossa.filter(
  (relato) => relato.tipo === "cliente" && relato.destaqueAlma,
);
