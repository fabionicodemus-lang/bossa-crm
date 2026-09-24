import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 300;

const TARGET_BYTES = Math.floor(4.5 * 1024 * 1024);
const ORGANIZATION_ID = 'efb563c0-42e2-403c-b86e-15b61a563757';

async function compressJpeg(input: Buffer): Promise<Buffer> {
  const attempts = [
    { maxSide: 2560, quality: 82 },
    { maxSide: 2200, quality: 78 },
    { maxSide: 1920, quality: 74 },
    { maxSide: 1600, quality: 70 },
    { maxSide: 1400, quality: 66 },
  ];

  for (const attempt of attempts) {
    const output = await sharp(input)
      .rotate()
      .resize({
        width: attempt.maxSide,
        height: attempt.maxSide,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: attempt.quality, mozjpeg: true })
      .toBuffer();

    if (output.byteLength <= TARGET_BYTES) return output;
  }

  throw new Error('Não foi possível reduzir a imagem abaixo de 4,5 MB.');
}

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'Esta manutenção só pode rodar em preview.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: files, error } = await admin
    .from('ai_files')
    .select('id,title,storage_bucket,storage_path,mime_type,size_bytes')
    .eq('organization_id', ORGANIZATION_ID)
    .eq('active', true)
    .in('mime_type', ['image/jpeg', 'image/jpg'])
    .gt('size_bytes', TARGET_BYTES)
    .order('size_bytes', { ascending: false });

  if (error) throw error;

  const results: Array<Record<string, unknown>> = [];

  for (const file of files ?? []) {
    const { data: blob, error: downloadError } = await admin.storage
      .from(file.storage_bucket)
      .download(file.storage_path);
    if (downloadError || !blob) {
      results.push({ id: file.id, title: file.title, ok: false, error: downloadError?.message ?? 'download vazio' });
      continue;
    }

    try {
      const before = file.size_bytes ?? blob.size;
      const input = Buffer.from(await blob.arrayBuffer());
      const output = await compressJpeg(input);

      const { error: uploadError } = await admin.storage
        .from(file.storage_bucket)
        .upload(file.storage_path, output, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { error: updateError } = await admin
        .from('ai_files')
        .update({ size_bytes: output.byteLength, mime_type: 'image/jpeg', updated_at: new Date().toISOString() })
        .eq('id', file.id)
        .eq('organization_id', ORGANIZATION_ID);
      if (updateError) throw updateError;

      results.push({
        id: file.id,
        title: file.title,
        ok: true,
        before,
        after: output.byteLength,
        reduction_pct: Math.round((1 - output.byteLength / before) * 1000) / 10,
      });
    } catch (caught) {
      results.push({
        id: file.id,
        title: file.title,
        ok: false,
        error: caught instanceof Error ? caught.message : String(caught),
      });
    }
  }

  return NextResponse.json({
    target_bytes: TARGET_BYTES,
    processed: results.length,
    success: results.filter((item) => item.ok === true).length,
    failed: results.filter((item) => item.ok !== true).length,
    results,
  });
}
