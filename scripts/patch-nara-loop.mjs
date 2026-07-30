import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/lib/ai.ts';
let content = readFileSync(path, 'utf8');

function replaceOnce(oldValue, newValue, label, alreadyPatchedMarker) {
  if (alreadyPatchedMarker && content.includes(alreadyPatchedMarker)) return;
  if (!content.includes(oldValue)) {
    throw new Error(`Não foi possível aplicar a correção da Nara: bloco ${label} não encontrado.`);
  }
  content = content.replace(oldValue, newValue);
}

replaceOnce(
  `function routeOutsideBuyerProfile(text: string): boolean {
  const value = normalizeText(text);
  if (/\\b(nao sou corretor|nao sou cliente)\\b/.test(value)) return false;
  return /\\b(corretor|corretora|imobiliaria|creci|ja comprei|sou cliente|segunda via|boleto|contrato|pos-venda|assistencia|entrega|chaves|fornecedor|prestador|curriculo|vaga|trabalhar com voces|cobranca|imprensa)\\b/.test(value);
}`,
  `function routeOutsideBuyerProfile(text: string): boolean {
  const value = normalizeText(text);
  if (/\\b(nao sou corretor|nao sou cliente)\\b/.test(value)) return false;
  return /\\b(outro atendimento|outro assunto|preciso de atendimento|preciso falar com a bossa|nao quero comprar|nao estou procurando|corretor|corretora|imobiliaria|creci|ja comprei|sou cliente|segunda via|boleto|contrato|pos-venda|assistencia|entrega|chaves|fornecedor|prestador|curriculo|vaga|trabalhar com voces|cobranca|imprensa)\\b/.test(value);
}

function outsideBuyerReply(history: ChatMessage[]): string {
  const value = normalizeText(lastUserText(history));
  if (/\\b(corretor|corretora|imobiliaria|creci)\\b/.test(value)) {
    return 'Claro. Vou direcionar você para o Plantão da Bossa, que atende corretores parceiros.';
  }
  if (/\\b(ja comprei|sou cliente|segunda via|boleto|contrato|pos-venda|assistencia|entrega|chaves)\\b/.test(value)) {
    return 'Claro. Vou direcionar você para a equipe responsável pelo atendimento aos clientes. Pode me dizer em uma frase qual é o assunto?';
  }
  return 'Claro. Vou direcionar você para a equipe responsável. Pode me dizer em uma frase qual atendimento precisa?';
}`,
  'roteamento de outro atendimento',
  'function outsideBuyerReply(history: ChatMessage[])',
);

replaceOnce(
  `  const buyerConfirmed = hasExplicitBuyerIntent(lead, history, context);
  const askedBefore = hasTriageQuestionBeenAsked(history, context);

  if (!buyerConfirmed && !routed) {
    const learnedCorrection = exactManagerCorrection(history, context);`,
  `  const buyerConfirmed = hasExplicitBuyerIntent(lead, history, context);
  const askedBefore = hasTriageQuestionBeenAsked(history, context);
  const triageAttempts = assistantMessages(history).filter((message) => looksLikeTriageQuestion(message, context)).length;

  if (!buyerConfirmed && !routed) {
    if (triageAttempts >= 2) {
      turn.reply = ensureFirstTurnIntroduction(
        'Entendi. Vou direcionar você para a equipe da Bossa para continuar por outro atendimento. Pode me dizer em uma frase qual é o assunto?',
        history,
        context,
      );
      turn.classification = 'frio';
      turn.score = Math.min(turn.score, 20);
      turn.stage = 'ia';
      turn.summary = 'A intenção de compra não foi confirmada após duas tentativas de triagem.';
      turn.next_action = 'Transferir para atendimento humano e identificar o assunto solicitado.';
      turn.handoff = true;
      turn.attachment_ids = [];
      return turn;
    }

    const learnedCorrection = exactManagerCorrection(history, context);`,
  'limite de tentativas de triagem',
  'const triageAttempts = assistantMessages(history)',
);

replaceOnce(
  `  if (routed) {
    turn.stage = 'ia';
    turn.handoff = true;
    turn.attachment_ids = [];
    turn.reply = ensureFirstTurnIntroduction(turn.reply, history, context);
    return turn;
  }`,
  `  if (routed) {
    turn.stage = 'ia';
    turn.handoff = true;
    turn.attachment_ids = [];
    turn.classification = 'frio';
    turn.score = Math.min(turn.score, 20);
    turn.summary = 'Contato informou que precisa de outro atendimento da Bossa.';
    turn.next_action = 'Direcionar para o canal humano responsável e identificar o assunto.';
    turn.reply = ensureFirstTurnIntroduction(outsideBuyerReply(history), history, context);
    return turn;
  }`,
  'resposta de encaminhamento',
  "turn.reply = ensureFirstTurnIntroduction(outsideBuyerReply(history), history, context);",
);

writeFileSync(path, content);
console.log('Correção anti-loop da Nara aplicada.');
