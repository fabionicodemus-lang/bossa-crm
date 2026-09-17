'use client';

import { useMemo, useState, type ChangeEvent } from 'react';
import type { MetaTemplateConnection, MetaTemplateRow } from '@/components/MetaTemplatesManager';
import { WhatsAppTemplatePreview } from '@/components/WhatsAppTemplatePreview';

export function TemplatesPreviewGallery({ templates, connections, canEdit, onRefresh }: {
  templates: MetaTemplateRow[];
  connections: MetaTemplateConnection[];
  canEdit: boolean;
  onRefresh?: () => void;
}) {
  const connected = connections.filter((connection) => connection.status === 'connected');
  const [channelId, setChannelId] = useState(connected[0]?.id || '');
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewRevisions, setPreviewRevisions] = useState<Record<string, number>>({});
  const filtered = useMemo(() => templates.filter((template) =>
    template.whatsapp_connection_id === channelId && (showAll || template.status.toUpperCase() === 'APPROVED'),
  ), [channelId, showAll, templates]);
  const expanded = filtered.find((template) => template.id === expandedId);

  function mediaUrl(id: string) { return `/api/transmissoes/templates/${encodeURIComponent(id)}/preview-media?v=${previewRevisions[id] || 0}`; }

  async function uploadPreview(id: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Selecione uma imagem JPG ou PNG de até 5 MB.'); return;
    }
    setError(''); setNotice(''); setUploadingId(id);
    try {
      const form = new FormData(); form.set('file', file);
      const response = await fetch(`/api/transmissoes/templates/${encodeURIComponent(id)}/preview-media`, { method: 'POST', body: form });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar a imagem de prévia.');
      setPreviewRevisions((current) => ({ ...current, [id]: Date.now() }));
      setNotice('Imagem de prévia atualizada. Ela não será anexada automaticamente às transmissões.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Erro ao salvar a imagem de prévia.'); }
    finally { setUploadingId(null); }
  }

  function preview(template: MetaTemplateRow, compact = false) {
    const url = template.header_format === 'IMAGE' ? mediaUrl(template.id) : undefined;
    return <WhatsAppTemplatePreview key={`${template.id}-${previewRevisions[template.id] || 0}`} template={template} compact={compact} mediaPreviewUrl={url} />;
  }

  function uploadControl(template: MetaTemplateRow) {
    if (!canEdit || template.header_format !== 'IMAGE') return null;
    return <label className="btn btn-ghost btn-sm" style={{ cursor: uploadingId ? 'wait' : 'pointer', display: 'block', textAlign: 'center', marginTop: 8 }}>
      {uploadingId === template.id ? 'Carregando imagem…' : '📷 Definir imagem de prévia'}
      <input aria-label={`Definir imagem de prévia de ${template.name}`} type="file" accept="image/jpeg,image/png" disabled={Boolean(uploadingId)} style={{ display: 'none' }} onChange={(event) => void uploadPreview(template.id, event)} />
    </label>;
  }

  return <section className="card" style={{ margin: '0 16px 14px' }}>
    <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
      <div><h3>📱 Como o contato verá os modelos</h3><small className="faint">Texto formatado, imagem de exemplo, documento, rodapé e botões em uma tela semelhante à do WhatsApp.</small></div>
      {onRefresh && <button type="button" className="btn btn-ghost btn-sm" onClick={onRefresh}>↻ Atualizar prévias</button>}
    </div>
    <div className="card-body">
      {error && <div className="error-box">{error}</div>}
      {notice && <div className="success-box">{notice}</div>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <label className="field" style={{ minWidth: 220, flex: '1 1 220px' }}><span>Canal</span><select className="select" value={channelId} onChange={(event) => { setChannelId(event.target.value); setExpandedId(null); }}>{connected.map((connection) => <option key={connection.id} value={connection.id}>{connection.channel === 'clientes' ? 'Clientes' : 'Corretores'} · {connection.display_phone_number || connection.verified_name}</option>)}</select></label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}><input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} /> Mostrar também os não aprovados</label>
      </div>
      {!filtered.length && <div className="empty-state">Nenhum modelo {showAll ? '' : 'aprovado '}neste canal.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 295px), 1fr))', gap: 15, alignItems: 'start' }}>
        {filtered.map((template) => <div key={template.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 11, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', marginBottom: 9 }}><div style={{ minWidth: 0 }}><strong style={{ fontSize: 12, wordBreak: 'break-word' }}>{template.name}</strong><div className="faint" style={{ fontSize: 10 }}>{template.category} · {template.language} · {template.header_format}</div></div><span className="chip" style={{ fontSize: 10 }}>{template.status.toUpperCase() === 'APPROVED' ? 'Aprovado' : template.status}</span></div>
          {preview(template, true)}
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setExpandedId(template.id)} style={{ width: '100%', marginTop: 10 }}>Ampliar mensagem e imagem</button>
          {uploadControl(template)}
        </div>)}
      </div>
    </div>
    {expanded && <div role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setExpandedId(null); }} style={{ position: 'fixed', inset: 0, zIndex: 120, background: '#0009', padding: 16, display: 'grid', placeItems: 'center' }}>
      <div className="card" role="dialog" aria-modal="true" aria-label={`Prévia do modelo ${expanded.name}`} style={{ width: 'min(520px, 96vw)', maxHeight: '95vh', overflowY: 'auto', padding: 15 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 13 }}><strong style={{ wordBreak: 'break-word' }}>{expanded.name}</strong><button className="btn btn-ghost btn-sm" type="button" onClick={() => setExpandedId(null)} aria-label="Fechar prévia">✕ Fechar</button></div>
        {preview(expanded)}
        {expanded.header_format === 'IMAGE' && <><p className="faint" style={{ fontSize: 11, marginTop: 10 }}>Esta é uma imagem de exemplo. O destinatário receberá a imagem escolhida em Nova transmissão → 📎 Anexar arquivo.</p>{uploadControl(expanded)}</>}
      </div>
    </div>}
  </section>;
}
