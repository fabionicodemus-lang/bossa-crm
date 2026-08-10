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

type MediaReference = {
  id: string;
  type: string;
  mimeType: string | null;
};

function readMediaReference(raw: Record<string, unknown> | null): MediaReference | null {
  if (!raw) return null;
  const type = String(raw.type ?? '').toLowerCase();
  if (!['image', 'audio', 'video', 'document', 'sticker'].includes(type)) return null;
  const value = raw[type];
  if (!value || typeof value !== 'object') return null;
  const media = value as Record<string, unknown>;
  const id = String(media.id ?? '').trim();
  if (!id) return null;
  return {
    id,
    type,
    mimeType: typeof media.mime_type === 'string' ? media.mime_type : null,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context) return new Response('Não autenticado.', { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('messages')
    .select('id,organization_id,whatsapp_channel_id,raw_payload')
    .eq('id', id)
    .eq('organization_id', context.organization.id)
    .maybeSingle();
  if (error) return new Response('Não foi possível localizar a mensagem.', { status: 500 });

  const message = data as MessageMediaRow | null;
  if (!message) return new Response('Mensagem não encontrada.', { status: 404 });
  const media = readMediaReference(message.raw_payload);
  if (!media) return new Response('Esta mensagem não contém mídia disponível.', { status: 404 });
  if (!message.whatsapp_channel_id) return new Response('Canal do WhatsApp não identificado.', { status: 409 });

  const channel = await findChannelById(admin, context.organization.id, message.whatsapp_channel_id);
  if (!channel) return new Response('Canal do WhatsApp não encontrado.', { status: 404 });

  try {
    const { accessToken } = channelAccess(channel);
    const { descriptor, response } = await fetchMetaMedia(media.id, accessToken, {
      range: request.headers.get('range'),
    });
    const headers = new Headers();
    headers.set('Content-Type', response.headers.get('content-type') || descriptor.mime_type || media.mimeType || 'application/octet-stream');
    headers.set('Cache-Control', 'private, max-age=300');
    headers.set('Content-Disposition', media.type === 'document' ? 'inline' : 'inline');
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
