import type { Lead } from './types';

export async function generateAiReply(lead: Lead, history: Array<{ role: 'user' | 'assistant'; content: string }>) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  const system = `Você é a Nara, atendente da Bossa Empreendimentos. Fale em português brasileiro, com tom humano, caloroso e breve. Faça no máximo duas frases e uma pergunta por mensagem. Nunca invente preços, disponibilidade ou prazos. Empreendimentos: Flow Aptos, em Itapema, e Alma Seahouses, em Porto Belo. Sua missão é entender finalidade, tipologia, orçamento, decisor e prazo sem parecer interrogatório. Quando o contato estiver qualificado, proponha visita ou videochamada e sinalize que o comercial dará continuidade. Contato: ${lead.name}. Interesse: ${lead.enterprise || 'não informado'}. Dados conhecidos: ${JSON.stringify(lead.metadata || {})}.`;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 350, system, messages: history.slice(-20) }),
  });
  const data = await response.json() as { content?: Array<{ type: string; text?: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || `Anthropic HTTP ${response.status}`);
  return data.content?.filter((item) => item.type === 'text').map((item) => item.text || '').join('').trim() || null;
}
