import { getCurrentContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { channelAccess, findChannelById } from '@/lib/whatsapp/channelService';
import { fetchMetaMedia } from '@/lib/whatsapp/media';

export const runtime = 'nodejs';
export const maxDuration = 60;

type MessageMediaRow = {
  id: string;
  organization_id: string;
  whatsapp_channel_id: string | null;
  raw_payload: Record<string, unknown> | null;
};

type TransportMediaRow = {
  id: string;
  organization_id: string;
  channel_id: string;
  payload: Record<string, unknown> | null;
};

type MediaReference = {
  id: string | null;
  type: string;
  mimeType: string | null;
  filename: string | null;
  aiFileId: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function mediaEnvelope(raw: Record<string, unknown> | null) {
  if (!raw) return null;
  const echo = asRecord(raw.message_echo);
  if (echo) return echo;
  const history = asRecord(raw.history_message);
  if (history) return history;
  return raw;
}

function readAiFileReference(raw: Record<string, unknown> | null): MediaReference | null {
  if (!raw) return null;
  const crm = asRecord(raw.crm);
  const source = crm ?? raw;
  const aiFileId = String(source.ai_file_id ?? '').trim();
  if (!aiFileId) return null;
  const mimeType = typeof source.mime_type === 'string' ? source.mime_type : null;
  const filename = typeof source.original_name === 'string' ? source.original_name : null;
  const type = mimeType?.startsWith('image/')
    ? 'image'
    : mimeType?.startsWith('audio/')
      ? 'audio'
      : mimeType?.startsWith('video/')
        ? 'video'
        : 'document';
  return { id: null, type, mimeType, filename, aiFileId };
}

function readMetaMediaReference(raw: Record<string, unknown> | null): MediaReference | null {
  const envelope = mediaEnvelope(raw);
  if (!envelope) return null;
  const type = String(envelope.type ?? '').toLowerCase();
  if (!['image', 'audio', 'video', 'document', 'sticker'].includes(type)) return null;
  const value = asRecord(envelope[type]);
  if (!value) return null;
  const id = String(value.id ?? '').trim();
  if (!id) return null;
  return {
    id,
    type,
    mimeType: typeof value.mime_type === 'string' ? value.mime_type : null,
    filename: typeof value.filename === 'string' ? value.filename : null,
    aiFileId: null,
  };
}

function readMediaReference(raw: Record<string, unknown> | null): MediaReference | null {
  return readMetaMediaReference(raw) ?? readAiFileReference(raw);
}

function safeFilename(value: string | null, fallback: string) {
  const name = (value || fallback).replace(/[\r\n"]/g, '').trim();
  return name || fallback;
}

function disposition(type: string, filename: string | null, download: boolean) {
  const fallback = type === 'image'
    ? 'imagem-whatsapp'
    : type === 'audio'
      ? 'audio-whatsapp'
      : type === 'video'
        ? 'video-whatsapp'
        : 'arquivo-whatsapp';
  const name = safeFilename(filename, fallback);
  const mode = download ? 'attachment' : 'inline';
  return `${mode}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context) return new Response('Não autenticado.', { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();

  const { data: legacyData, error: legacyError } = await admin
    .from('messages')
    .select('id,organization_id,whatsapp_channel_id,raw_payload')
    .eq('id', id)
    .eq('organization_id', context.organization.id)
    .maybeSingle();
  if (legacyError) return new Response('Não foi possível localizar a mensagem.', { status: 500 });

  let channelId: string | null = null;
  let raw: Record<string, unknown> | null = null;

  const legacy = legacyData as MessageMediaRow | null;
  if (legacy) {
    channelId = legacy.whatsapp_channel_id;
    raw = legacy.raw_payload;
  } else {
    const { data: transportData, error: transportError } = await admin
      .from('whatsapp_messages')
      .select('id,organization_id,channel_id,payload')
      .eq('id', id)
      .eq('organization_id', context.organization.id)
      .maybeSingle();
    if (transportError) return new Response('Não foi possível localizar a mensagem.', { status: 500 });
    const transport = transportData as TransportMediaRow | null;
    if (!transport) return new Response('Mensagem não encontrada.', { status: 404 });
    channelId = transport.channel_id;
    raw = transport.payload;
  }

  const media = readMediaReference(raw);
  if (!media) return new Response('Esta mensagem não contém mídia disponível.', { status: 404 });
  const download = new URL(request.url).searchParams.get('download') === '1';

  if (media.aiFileId) {
    const { data: file, error: fileError } = await admin
      .from('ai_files')
      .select('id,organization_id,storage_bucket,storage_path,original_name,mime_type')
      .eq('id', media.aiFileId)
      .eq('organization_id', context.organization.id)
      .maybeSingle();
    if (fileError) return new Response('Não foi possível localizar o arquivo enviado.', { status: 500 });
    if (!file) return new Response('Arquivo enviado não encontrado.', { status: 404 });

    const { data: blob, error: downloadError } = await admin.storage
      .from(file.storage_bucket)
      .download(file.storage_path);
    if (downloadError || !blob) {
      return new Response('Não foi possível carregar o arquivo enviado.', { status: 502 });
    }

    const headers = new Headers();
    headers.set('Content-Type', file.mime_type || media.mimeType || blob.type || 'application/octet-stream');
    headers.set('Content-Length', String(blob.size));
    headers.set('Cache-Control', 'private, max-age=300');
    headers.set('Content-Disposition', disposition(media.type, file.original_name || media.filename, download));
    return new Response(blob.stream(), { status: 200, headers });
  }

  if (!channelId) return new Response('Canal do WhatsApp não identificado.', { status: 409 });
  const channel = await findChannelById(admin, context.organization.id, channelId);
  if (!channel) return new Response('Canal do WhatsApp não encontrado.', { status: 404 });

  try {
    const { accessToken } = channelAccess(channel);
    const { descriptor, response } = await fetchMetaMedia(media.id!, accessToken, {
      range: request.headers.get('range'),
    });
    const headers = new Headers();
    headers.set('Content-Type', response.headers.get('content-type') || descriptor.mime_type || media.mimeType || 'application/octet-stream');
    headers.set('Cache-Control', 'private, max-age=300');
    headers.set('Content-Disposition', disposition(media.type, media.filename, download));
    for (const name of ['content-length', 'content-range', 'accept-ranges']) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch (cause) {
    console.error('[whatsapp media proxy]', id, cause);
    return new Response('Não foi possível carregar a mídia do WhatsApp.', { status: 502 });
  }
}
