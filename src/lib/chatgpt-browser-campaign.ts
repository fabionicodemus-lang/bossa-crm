export const CHATGPT_BATCH_LIMITS = [1, 2, 5, 10, 20] as const;
export type ChatGPTBatchLimit = (typeof CHATGPT_BATCH_LIMITS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validChatGPTCampaignId(value: string): boolean {
  return UUID.test(value);
}

export function chatGPTBatchLimit(value: string | number | null): ChatGPTBatchLimit {
  const parsed = Number(value);
  return CHATGPT_BATCH_LIMITS.find((limit) => limit === parsed) ?? 2;
}

export function buildChatGPTRunnerUrl(origin: string, campaignId: string, limit: ChatGPTBatchLimit, runId: string): string {
  if (!validChatGPTCampaignId(campaignId) || !UUID.test(runId) || !CHATGPT_BATCH_LIMITS.includes(limit))
    throw new Error('Identificadores da execução do ChatGPT inválidos.');
  const url = new URL('/transmissoes/navegador/assistente', origin);
  if (!['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && url.hostname !== 'localhost'))
    throw new Error('É necessário acessar o CRM em uma origem HTTPS.');
  url.searchParams.set('campaign', campaignId);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('run', runId);
  return url.toString();
}

export function buildChatGPTCampaignPrompt(runnerUrl: string, senderPhone: string, limit: ChatGPTBatchLimit): string {
  if (!/^\d{8,15}$/.test(senderPhone) || !CHATGPT_BATCH_LIMITS.includes(limit))
    throw new Error('Remetente ou quantidade inválidos.');
  return `Execute uma transmissão supervisionada da Bossa pelo WhatsApp Web usando a extensão OFICIAL do ChatGPT para Chrome (@Chrome).\n\n` +
    `Abra no Chrome a área autenticada de execução: ${runnerUrl}\n` +
    `Número remetente aprovado: +${senderPhone}. Limite DESTA execução: ${limit} corretor(es).\n\n` +
    `REGRAS OBRIGATÓRIAS:\n` +
    `1. Use apenas os dados e botões exibidos nessa página do Bossa CRM. Não obtenha a lista completa por outros meios, não altere os textos aprovados e não ultrapasse o limite do lote.\n` +
    `2. Clique em “Reservar próximo corretor”. Antes de qualquer envio, confira no WhatsApp Web que a conversa individual corresponde EXATAMENTE ao telefone exibido no CRM. Nunca envie a grupos ou a um contato não verificado. Confira que a sessão é do remetente aprovado.\n` +
    `3. Para o texto, envie a mensagem literal da página uma única vez, incluindo o primeiro nome já preparado. Só clique em “Confirmar texto observado” no CRM se a nova mensagem enviada estiver visível na conversa correta.\n` +
    `4. Para cada PDF, clique no link de download protegido do CRM, anexe no WhatsApp como DOCUMENTO e confira o nome do arquivo na nova mensagem de saída. Só então clique em “Confirmar PDF observado”. Se necessário, peça que habilitem acesso a URLs de arquivo para a extensão do ChatGPT nas configurações do Chrome.\n` +
    `5. Se a conversa, o remetente, a presença da mensagem ou o resultado de qualquer clique forem incertos, clique em “Parar e marcar para conferir” no CRM e NÃO repita o envio. Não passe ao próximo contato com pendência.\n` +
    `6. Quando a página indicar que o lote terminou, pare. Informe quantos contatos tiveram todas as etapas observadas e quantos precisam de revisão. Não inicie outro lote sem nova autorização.\n\n` +
    `Se o acesso ao Chrome não estiver disponível ou surgir uma aprovação obrigatória, solicite a autorização normal do ChatGPT. Não contorne permissões nem mecanismos do WhatsApp.`;
}

export function buildChatGPTDesktopLink(prompt: string): string {
  // Deep link oficial: abre o compositor local com o texto pronto; o usuário
  // ainda precisa pressionar Enviar no aplicativo ChatGPT/Codex.
  return `codex://new?prompt=${encodeURIComponent(prompt)}`;
}
