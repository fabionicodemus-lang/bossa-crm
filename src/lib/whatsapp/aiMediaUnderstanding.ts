import type { SupabaseClient } from '@supabase/supabase-js';
import { transcribeAudio } from '@/lib/audio-transcription';
import { channelAccess, findChannelById } from '@/lib/whatsapp/channelService';
import { fetchMetaMedia } from '@/lib/whatsapp/media';

type MessageRow = {
  id: string;
  organization_id?: string;
  whatsapp_channel_id: string | null;
  raw_payload: Record<string, unknown> | null;
  body: string;
};

type MediaRef = { type: 'audio' | 'image'; id: string; mimeType: string | null; caption: string | null };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function envelope(raw: Record<string, unknown> | null) {
  if (!raw) return null;
  return asRecord(raw.message_echo) ?? asRecord(raw.history_message) ?? raw;
}

function mediaRef(raw: Record<string, unknown> | null): MediaRef | null {
  const source = envelope(raw);
  if (!source) return null;
  const type = String(source.type || '').toLowerCase();
  if (type !== 'audio' && type !== 'image') return null;
  const media = asRecord(source[type]);
  if (!media) return null;
  const id = String(media.id || '').trim();
  if (!id) return null;
  return {
    type,
    id,
    mimeType: typeof media.mime_type === 'string' ? media.mime_type : null,
    caption: typeof media.caption === 'string' && media.caption.trim() ? media.caption.trim() : null,
  };
}

function cachedUnderstanding(raw: Record<string, unknown> | null) {
  const value = raw?.bossa_ai_understanding;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cachedTranscript(raw: Record<string, unknown> | null) {
  const value = raw?.bossa_transcription;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function describeImage(bytes: ArrayBuffer, mimeType: string) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('OPENAI_API_KEY ausente para compreensão de imagem.');
  const model = 'gpt-5.6-luna';
  const base64 = Buffer.from(bytes).toString('base64');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: 'low' },
      max_output_tokens: 350,
      text: { verbosity: 'low' },
      input: [{
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'Analise esta imagem enviada em uma conversa de WhatsApp com a Bossa Empreendimentos. Descreva de forma objetiva somente o conteúdo útil para responder ao contato: textos legíveis, imóvel/ambiente, dúvida aparente, documento ou informação comercial visível. Não invente detalhes, identidade de pessoas, valores ilegíveis nem conclusões não sustentadas. Responda em português brasileiro em até 120 palavras.',
          },
          { type: 'input_image', image_url: `data:${mimeType};base64,${base64}`, detail: 'low' },
        ],
      }],
    }),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({})) as {
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(data.error?.message || `OpenAI visão: HTTP ${response.status}`);
  for (const item of data.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text?.trim()) return { text: content.text.trim(), model };
    }
  }
  throw new Error('A OpenAI não devolveu uma descrição utilizável da imagem.');
}

export async function understandInboundMedia(args: {
  admin: SupabaseClient;
  organizationId: string;
  row: MessageRow;
}): Promise<string | null> {
  const raw = args.row.raw_payload;
  const cached = cachedUnderstanding(raw);
  if (cached) return cached;
  const ref = mediaRef(raw);
  if (!ref || !args.row.whatsapp_channel_id) return null;

  try {
    const channel = await findChannelById(args.admin as never, args.organizationId, args.row.whatsapp_channel_id);
    if (!channel) return null;
    const { accessToken } = channelAccess(channel);
    const { descriptor, response } = await fetchMetaMedia(ref.id, accessToken);
    const bytes = await response.arrayBuffer();
    const mime = descriptor.mime_type || ref.mimeType || response.headers.get('content-type') || (ref.type === 'audio' ? 'audio/ogg' : 'image/jpeg');
    let understanding: string;
    let model: string;

    if (ref.type === 'audio') {
      const existing = cachedTranscript(raw);
      if (existing) {
        understanding = `Áudio transcrito: ${existing}`;
        model = String(raw?.bossa_transcription_model || 'cached');
      } else {
        if (bytes.byteLength > 25 * 1024 * 1024) throw new Error('Áudio grande demais para transcrição automática.');
        const result = await transcribeAudio({ bytes, mimeType: mime, language: 'pt' });
        understanding = `Áudio transcrito: ${result.text}`;
        model = result.model;
      }
    } else {
      if (bytes.byteLength > 12 * 1024 * 1024) throw new Error('Imagem grande demais para interpretação automática.');
      const result = await describeImage(bytes, mime);
      understanding = `Imagem recebida${ref.caption ? `, legenda: ${ref.caption}` : ''}. Conteúdo: ${result.text}`;
      model = result.model;
    }

    const now = new Date().toISOString();
    const enriched = {
      ...(raw || {}),
      ...(ref.type === 'audio' && !cachedTranscript(raw)
        ? {
            bossa_transcription: understanding.replace(/^Áudio transcrito:\s*/u, ''),
            bossa_transcription_model: model,
            bossa_transcribed_at: now,
          }
        : {}),
      bossa_ai_understanding: understanding,
      bossa_ai_understanding_model: model,
      bossa_ai_understood_at: now,
    };
    const { error } = await args.admin.from('messages').update({ raw_payload: enriched }).eq('id', args.row.id);
    if (error) console.error('[ai media cache]', args.row.id, error.message);
    return understanding;
  } catch (error) {
    console.error('[ai media understanding]', args.row.id, error instanceof Error ? error.message : error);
    return null;
  }
}
