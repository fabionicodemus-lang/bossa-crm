import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;
type Template = { id: string; organization_id: string; channel_id: string; name: string; language: string; header_format: string; components: unknown };

function imageMime(bytes: Uint8Array): 'image/jpeg' | 'image/png' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  return null;
}

function imageResponse(bytes: ArrayBuffer, mime: string) {
  if (bytes.byteLength > MAX_PREVIEW_BYTES) return new Response(null, { status: 413 });
  return new Response(bytes, {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}

async function findTemplate(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { template: null, role: null, errorStatus: 401 };
  const { data: membership } = await supabase.from('memberships')
    .select('organization_id,role').eq('user_id', user.id).limit(1).maybeSingle();
  if (!membership) return { template: null, role: null, errorStatus: 403 };
  const admin = createAdminClient();
  const { data } = await admin.from('whatsapp_templates')
    .select('id,organization_id,channel_id,name,language,header_format,components')
    .eq('id', id).eq('organization_id', membership.organization_id).maybeSingle();
  if (!data || String(data.header_format).toUpperCase() !== 'IMAGE') return { template: null, role: membership.role, errorStatus: 404 };
  return { template: data as Template, role: membership.role, errorStatus: 200 };
}

function samplePath(template: Template) {
  return `${template.organization_id}/template-samples/${template.channel_id}/${template.name}_${template.language}`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await findTemplate(id);
  if (!auth.template) return new Response(null, { status: auth.errorStatus });
  const admin = createAdminClient();
  const { data: sample, error: sampleError } = await admin.storage.from('broadcast-media').download(samplePath(auth.template));
  if (!sampleError && sample && sample.size <= MAX_PREVIEW_BYTES) {
    const bytes = await sample.arrayBuffer();
    const mime = imageMime(new Uint8Array(bytes));
    if (mime) return imageResponse(bytes, mime);
  }

  // Amostras importadas da Meta podem ter URL temporária. Nunca buscar URL
  // arbitrária: host exato oficial, HTTPS, sem redirecionamentos ou portas extras.
  const components = Array.isArray(auth.template.components) ? auth.template.components : [];
  const header = components.find((item: { type?: string }) => item?.type?.toUpperCase() === 'HEADER') as { example?: { header_handle?: unknown } } | undefined;
  const handles = header?.example?.header_handle;
  const raw = Array.isArray(handles) && typeof handles[0] === 'string' ? handles[0] : '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'scontent.whatsapp.net' || (url.port && url.port !== '443')) return new Response(null, { status: 404 });
    const response = await fetch(url.toString(), { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok || Number(response.headers.get('content-length') || 0) > MAX_PREVIEW_BYTES) return new Response(null, { status: 404 });
    const bytes = await response.arrayBuffer();
    const mime = imageMime(new Uint8Array(bytes));
    return mime ? imageResponse(bytes, mime) : new Response(null, { status: 404 });
  } catch {
    return new Response(null, { status: 404 });
  }
}

/** Salva apenas uma imagem de exemplo para exibição no CRM. Não modifica a
 * aprovação nem anexa nada às futuras campanhas: o anexo é escolhido no envio. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await findTemplate(id);
  if (!auth.template) return Response.json({ error: 'Modelo não encontrado.' }, { status: auth.errorStatus });
  if (auth.role === 'viewer') return Response.json({ error: 'Você não pode alterar prévias.' }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const value = form?.get('file');
  if (!(value instanceof File) || !value.size || value.size > MAX_PREVIEW_BYTES) {
    return Response.json({ error: 'Selecione JPG ou PNG de até 5 MB.' }, { status: 400 });
  }
  const bytes = await value.arrayBuffer();
  const mime = imageMime(new Uint8Array(bytes));
  if (!mime || value.type !== mime) return Response.json({ error: 'O arquivo precisa ser uma imagem JPG ou PNG válida.' }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.storage.from('broadcast-media').upload(samplePath(auth.template), bytes, { contentType: mime, upsert: true });
  if (error) return Response.json({ error: 'Não foi possível salvar a imagem de prévia.' }, { status: 500 });
  return Response.json({ ok: true });
}
