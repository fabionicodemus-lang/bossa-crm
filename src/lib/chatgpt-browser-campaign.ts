export const CHATGPT_BATCH_LIMITS = [1, 2, 5, 10, 20] as const;
export const CHATGPT_MAX_CAMPAIGN_RECIPIENTS = 600;
export type ChatGPTBatchLimit = number;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validChatGPTCampaignId(value: string): boolean {
  return UUID.test(value);
}

export function chatGPTBatchLimit(value: string | number | null): ChatGPTBatchLimit {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= CHATGPT_MAX_CAMPAIGN_RECIPIENTS ? parsed : 2;
}

export function buildChatGPTRunnerUrl(origin: string, campaignId: string, limit: ChatGPTBatchLimit, runId: string): string {
  if (!validChatGPTCampaignId(campaignId) || !UUID.test(runId) || chatGPTBatchLimit(limit) !== limit)
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
  if (!/^\d{8,15}$/.test(senderPhone) || chatGPTBatchLimit(limit) !== limit)
    throw new Error('Remetente ou quantidade inválidos.');
  return `Use a extensão OFICIAL do ChatGPT para Chrome (@Chrome) e execute a campanha autorizada da Bossa pelo WhatsApp Web, de ponta a ponta, sem pedir que eu clique para cada corretor.\n\n` +
    `Abra esta tela autenticada do Bossa CRM: ${runnerUrl}\n` +
    `Remetente definido no CRM: +${senderPhone}. Máximo da campanha: ${limit} corretores aprovados. Não peça conferência nem nova confirmação do remetente: essa escolha já foi feita ao montar a campanha.\n\n` +
    `REPITA ATÉ A FILA ACABAR:\n` +
    `1. Na tela do CRM, clique em “Reservar próximo corretor”. Leia somente o contato apresentado. Confira no WhatsApp Web que a conversa individual corresponde EXATAMENTE ao telefone de destino. Não use grupos e não peça conferência do remetente.\n` +
    `2. Envie o TEXTO EXATO da tela uma única vez, com o primeiro nome já preparado. Depois baixe os PDFs aprovados, anexe como DOCUMENTO e envie cada um uma única vez. Não pule anexo nem altere conteúdo.\n` +
    `3. Confira no WhatsApp as novas mensagens de saída (texto e todos os anexos) na conversa correta. Só então volte ao CRM e clique em “Registrar contato concluído”. Isso atualiza a contagem no painel de transmissão. O CRM verifica o progresso a cada 2 minutos e encerra o acompanhamento após 15 minutos sem novo registro.\n` +
    `4. Aguarde o intervalo indicado na tela e volte ao passo 1. Ao aparecer “Campanha concluída” ou “Nenhum corretor disponível”, pare. Não ultrapasse o limite da campanha.\n\n` +
    `Se algum clique, anexo ou envio ficar incerto, clique em “Parar e marcar para conferir”; NÃO repita mensagens e NÃO passe ao próximo contato com pendência. Se uma permissão obrigatória do Chrome for solicitada, peça a autorização normal. Se a extensão não conseguir enviar arquivos, informe o bloqueio e pare. Não contorne restrições do WhatsApp.`;
}

export function buildChatGPTDesktopLink(prompt: string): string {
  // Deep link oficial: abre o compositor local com o texto pronto; o usuário
  // ainda precisa pressionar Enviar no aplicativo ChatGPT/Codex.
  return `codex://new?prompt=${encodeURIComponent(prompt)}`;
}
