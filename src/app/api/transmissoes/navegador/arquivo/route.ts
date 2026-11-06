import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { safeBrowserMedia } from '@/lib/browser-campaigns';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Download de um PDF aprovado, com autorização por organização e verificação SHA-256. */
export async function GET(request: Request) {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context || context.role === 'viewer')
    return NextResponse.json({ error: 'Acesso de operador necessário.' }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const campaignId = params.get('campaign') ?? '';
  const rawIndex = params.get('index') ?? '';
  if (!UUID.test(campaignId) || !/^[0-2]$/.test(rawIndex))
    return NextResponse.json({ error: 'Arquivo inválido.' }, { status: 400 });

  const admin = createAdminClient();
  const { data: campaign, error: lookupError } = await admin.from('browser_campaigns')
    .select('id,status,media').eq('id', campaignId)
    .eq('organization_id', context.organization.id).maybeSingle();
  if (lookupError) return NextResponse.json({ error: 'Falha ao consultar campanha.' }, { status: 500 });
  if (!campaign || campaign.status !== 'running')
    return NextResponse.json({ error: 'Campanha indisponível para envio.' }, { status: 404 });

  const files = safeBrowserMedia(context.organization.id, campaign.media);
  const file = files?.[Number(rawIndex)];
  if (!file) return NextResponse.json({ error: 'PDF não pertence à campanha.' }, { status: 404 });

  const { data: blob, error: storageError } = await admin.storage.from(file.bucket).download(file.path);
  if (storageError || !blob)
    return NextResponse.json({ error: 'Arquivo aprovado indisponível.' }, { status: 404 });

  const bytes = Buffer.from(await blob.arrayBuffer());
  const validSignature = bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  if (!validSignature || bytes.length !== file.size
    || createHash('sha256').update(bytes).digest('hex') !== file.sha256)
    return NextResponse.json({ error: 'O PDF foi alterado. Envio bloqueado.' }, { status: 409 });

  const asciiFilename = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return new NextResponse(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
