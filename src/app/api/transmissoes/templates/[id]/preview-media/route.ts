import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;

function imageResponse(bytes: ArrayBuffer, mime: string) {
  if (bytes.byteLength > MAX_PREVIEW_BYTES) return new Response(null, { status: 413 });
  return new Response(bytes, {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'private, max-age=900',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  const { data: membership } = await supabase.from('memberships')
    .select('organization_id').eq('user_id', user.id).limit(1).maybeSingle();
  if (!membership) return new Response(null, { status: 403 });

  const admin = createAdminClient();
  const { data: template } = await admin.from('whatsapp_templates')
    .select('id,organization_id,channel_id,name,language,header_format,components')
    .eq('id', id).eq('organization_id', membership.organization_id).maybeSingle();
  if (!template || String(template.header_format).toUpperCase() !== 'IMAGE') return new Response(null, { status: 404 });

  // Os arquivos enviados pelo próprio CRM são privados. A sincronização Meta
  // preserva esta amostra, pois o caminho é derivado de nome + canal + idioma.
  const samplePath = `${template.organization_id}/template-samples/${template.channel_id}/${template.name}_${template.language}`;
  const { data: sample, error: sampleError } = await admin.storage.from('broadcast-media').download(samplePath);
  if (!sampleError && sample && sample.size <= MAX_PREVIEW_BYTES && ['image/jpeg', 'image/png'].includes(sample.type)) {
    return imageResponse(await sample.arrayBuffer(), sample.type);
  }

  // Modelos criados fora do CRM podem ter uma URL de amostra retornada pela
  // Meta. Somente o domínio de mídia oficial é permitido, sem redirecionamento.
  const components = Array.isArray(template.components) ? template.components : [];
  const header = components.find((item: { type?: string }) => item?.type?.toUpperCase() === 'HEADER') as { example?: { header_handle?: unknown } } | undefined;
  const handles = header?.example?.header_handle;
  const raw = Array.isArray(handles) && typeof handles[0] === 'string' ? handles[0] : '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'scontent.whatsapp.net' || (url.port && url.port !== '443')) {
      return new Response(null, { status: 404 });
    }
    const response = await fetch(url.toString(), { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return new Response(null, { status: 404 });
    const mime = response.headers.get('content-type')?.split(';')[0]?.toLowerCase() || '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) return new Response(null, { status: 404 });
    if (Number(response.headers.get('content-length') || 0) > MAX_PREVIEW_BYTES) return new Response(null, { status: 413 });
    return imageResponse(await response.arrayBuffer(), mime);
  } catch {
    return new Response(null, { status: 404 });
  }
}
