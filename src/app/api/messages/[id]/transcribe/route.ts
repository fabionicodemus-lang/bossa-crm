import { getCurrentContext } from '@/lib/auth';
import { transcribeAudio } from '@/lib/audio-transcription';
import { createAdminClient } from '@/lib/supabase/admin';
import { channelAccess, findChannelById } from '@/lib/whatsapp/channelService';
import { fetchMetaMedia } from '@/lib/whatsapp/media';

export const runtime = 'nodejs';
export const maxDuration = 60;

type AudioMessageRow = {
  id: string;
  organization_id: string;
  whatsapp_channel_id: string | null;
  whatsapp_message_id: string | null;
  body: string;
  raw_payload: Record<string, unknown> | null;
};

type AudioPayload = {
  id?: string;
  mime_type?: string;
};

function readAudio(raw: Record<string, unknown> | null) {
  if (!raw || raw.type !== 'audio') return null;
  const audio = raw.audio;
  if (!audio || typeof audio !== 'object') return null;
  const value = audio as AudioPayload;
  const id = String(value.id ?? '').trim();
  if (!id) return null;
  return { id, mimeType: value.mime_type || null };
}

function existingTranscript(raw: Record<string, unknown> | null) {
  const value = raw?.bossa_transcription;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context) return Response.json({ error: 'Não autenticado.' }, { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('messages')
    .select('id,organization_id,whatsapp_channel_id,whatsapp_message_id,body,raw_payload')
    .eq('id', id)
    .eq('organization_id', context.organization.id)
    .maybeSingle();
  if (error) return Response.json({ error: 'Não foi possível localizar a mensagem.' }, { status: 500 });

  const message = data as AudioMessageRow | null;
  if (!message) return Response.json({ error: 'Mensagem não encontrada.' }, { status: 404 });
  const cached = existingTranscript(message.raw_payload);
  if (cached) return Response.json({ transcript: cached, cached: true });

  const audio = readAudio(message.raw_payload);
  if (!audio) return Response.json({ error: 'Esta mensagem não contém um áudio do WhatsApp.' }, { status: 400 });
  if (!message.whatsapp_channel_id) return Response.json({ error: 'Canal do WhatsApp não identificado.' }, { status: 409 });

  const channel = await findChannelById(admin, context.organization.id, message.whatsapp_channel_id);
  if (!channel) return Response.json({ error: 'Canal do WhatsApp não encontrado.' }, { status: 404 });

  try {
    const { accessToken } = channelAccess(channel);
    const { descriptor, response } = await fetchMetaMedia(audio.id, accessToken);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 25 * 1024 * 1024) {
      return Response.json({ error: 'O áudio é grande demais para transcrição automática.' }, { status: 413 });
    }

    const result = await transcribeAudio({
      bytes,
      mimeType: descriptor.mime_type || audio.mimeType || response.headers.get('content-type') || 'audio/ogg',
      language: 'pt',
    });
    const now = new Date().toISOString();
    const enrichedPayload = {
      ...(message.raw_payload || {}),
      bossa_transcription: result.text,
      bossa_transcription_model: result.model,
      bossa_transcribed_at: now,
    };
    const body = `🎙️ ${result.text}`;

    const { error: messageUpdateError } = await admin
      .from('messages')
      .update({ body, raw_payload: enrichedPayload })
      .eq('id', message.id);
    if (messageUpdateError) throw messageUpdateError;

    if (message.whatsapp_message_id) {
      const { error: transportUpdateError } = await admin
        .from('whatsapp_messages')
        .update({ body, payload: enrichedPayload })
        .eq('wamid', message.whatsapp_message_id);
      if (transportUpdateError) throw transportUpdateError;
    }

    return Response.json({ transcript: result.text, cached: false });
  } catch (cause) {
    console.error('[whatsapp audio transcription]', id, cause);
    return Response.json({
      error: cause instanceof Error ? cause.message : 'Não foi possível transcrever o áudio.',
    }, { status: 502 });
  }
}
