'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type DevelopmentLogoItem = {
  id: string;
  name: string;
  logo_path: string | null;
};

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message ?? 'Erro inesperado.');
  return 'Erro inesperado.';
}

async function normalizeLogo(file: File): Promise<Blob> {
  if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Envie o logo em PNG ou JPG.');
  if (file.size > 8 * 1024 * 1024) throw new Error('O logo deve ter no máximo 8 MB.');

  const bitmap = await createImageBitmap(file);
  const maxWidth = 1600;
  const maxHeight = 900;
  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const padding = Math.max(24, Math.round(Math.min(width, height) * 0.06));
  const canvas = document.createElement('canvas');
  canvas.width = width + padding * 2;
  canvas.height = height + padding * 2;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível preparar a imagem.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, padding, padding, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.94));
  if (!blob) throw new Error('Não foi possível converter o logo.');
  return blob;
}

export function DevelopmentLogosPanel({ organizationId, canEdit, initialDevelopments }: {
  organizationId: string;
  canEdit: boolean;
  initialDevelopments: DevelopmentLogoItem[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [developments, setDevelopments] = useState(initialDevelopments);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [uploadingId, setUploadingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    async function loadPreviews() {
      const entries = await Promise.all(developments.filter((item) => item.logo_path).map(async (item) => {
        const { data } = await supabase.storage.from('development-files').createSignedUrl(item.logo_path!, 3600);
        return [item.id, data?.signedUrl ?? ''] as const;
      }));
      if (active) setSignedUrls(Object.fromEntries(entries.filter(([, url]) => Boolean(url))));
    }
    void loadPreviews();
    return () => { active = false; };
  }, [developments, supabase]);

  async function uploadLogo(item: DevelopmentLogoItem, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canEdit) return;
    setUploadingId(item.id);
    setError('');
    setNotice('');
    let newPath = '';
    try {
      const normalized = await normalizeLogo(file);
      newPath = `${organizationId}/${item.id}/brand/logo-${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage.from('development-files').upload(newPath, normalized, {
        cacheControl: '3600',
        contentType: 'image/jpeg',
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { data, error: updateError } = await supabase.from('developments')
        .update({ logo_path: newPath })
        .eq('id', item.id)
        .eq('organization_id', organizationId)
        .select('id,name,logo_path')
        .single();
      if (updateError) throw updateError;

      if (item.logo_path && item.logo_path !== newPath) {
        await supabase.storage.from('development-files').remove([item.logo_path]);
      }
      setDevelopments((current) => current.map((row) => row.id === item.id ? data as DevelopmentLogoItem : row));
      setNotice(`Logo do ${item.name} atualizado. Ele será usado nos PDFs das propostas.`);
    } catch (caught) {
      if (newPath) await supabase.storage.from('development-files').remove([newPath]);
      setError(errorText(caught));
    } finally {
      setUploadingId('');
    }
  }

  return <div className="page-content" style={{ paddingBottom: 0 }}>
    {error && <div className="error-box">{error}</div>}
    {notice && <div className="success-box">{notice}</div>}
    <section className="card">
      <div className="card-head"><h3>Marcas dos empreendimentos</h3><span className="chip">Usadas nos PDFs das propostas</span></div>
      <div className="card-body">
        <div className="info-box" style={{ marginTop: 0 }}>Cadastre um logo para cada empreendimento. PNG e JPG são aceitos; o sistema padroniza a imagem em JPG com fundo branco para o PDF.</div>
        <div className="grid grid-3">
          {developments.map((item) => <div className="card" key={item.id} style={{ boxShadow: 'none' }}>
            <div className="card-body" style={{ display: 'grid', gap: 10 }}>
              <div style={{ height: 90, border: '1px solid var(--line)', borderRadius: 8, display: 'grid', placeItems: 'center', background: '#fff', overflow: 'hidden' }}>
                {signedUrls[item.id]
                  ? <img src={signedUrls[item.id]} alt={`Logo ${item.name}`} style={{ maxWidth: '92%', maxHeight: 76, objectFit: 'contain' }} />
                  : <span className="faint">Logo não cadastrado</span>}
              </div>
              <strong>{item.name}</strong>
              {canEdit && <label className="btn btn-ghost btn-sm" style={{ cursor: uploadingId ? 'wait' : 'pointer', justifyContent: 'center' }}>
                {uploadingId === item.id ? 'Preparando e enviando…' : item.logo_path ? 'Trocar logo' : 'Cadastrar logo'}
                <input type="file" accept="image/png,image/jpeg" hidden disabled={Boolean(uploadingId)} onChange={(event) => void uploadLogo(item, event)} />
              </label>}
            </div>
          </div>)}
          {developments.length === 0 && <div className="empty-state">Cadastre primeiro um empreendimento.</div>}
        </div>
      </div>
    </section>
  </div>;
}
