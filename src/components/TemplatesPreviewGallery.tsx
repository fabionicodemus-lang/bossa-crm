'use client';

import { useMemo, useState } from 'react';
import type { MetaTemplateConnection, MetaTemplateRow } from '@/components/MetaTemplatesManager';
import { WhatsAppTemplatePreview } from '@/components/WhatsAppTemplatePreview';

export function TemplatesPreviewGallery({ templates, connections, onRefresh }: {
  templates: MetaTemplateRow[];
  connections: MetaTemplateConnection[];
  onRefresh?: () => void;
}) {
  const connected = connections.filter((connection) => connection.status === 'connected');
  const [channelId, setChannelId] = useState(connected[0]?.id || '');
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const filtered = useMemo(() => templates.filter((template) =>
    template.whatsapp_connection_id === channelId && (showAll || template.status.toUpperCase() === 'APPROVED'),
  ), [channelId, showAll, templates]);
  const expanded = filtered.find((template) => template.id === expandedId);

  return <section className="card" style={{ margin: '0 16px 14px' }}>
    <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
      <div><h3>📱 Como o contato verá os modelos</h3><small className="faint">Texto formatado, cabeçalho, imagem de exemplo, rodapé e botões no formato do WhatsApp.</small></div>
      {onRefresh && <button type="button" className="btn btn-ghost btn-sm" onClick={onRefresh}>↻ Atualizar prévias</button>}
    </div>
    <div className="card-body">
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <label className="field" style={{ minWidth: 220, flex: '1 1 220px' }}><span>Canal</span><select className="select" value={channelId} onChange={(event) => { setChannelId(event.target.value); setExpandedId(null); }}>{connected.map((connection) => <option key={connection.id} value={connection.id}>{connection.channel === 'clientes' ? 'Clientes' : 'Corretores'} · {connection.display_phone_number || connection.verified_name}</option>)}</select></label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}><input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} /> Mostrar também os não aprovados</label>
      </div>
      {!filtered.length && <div className="empty-state">Nenhum modelo {showAll ? '' : 'aprovado '}neste canal.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 295px), 1fr))', gap: 15, alignItems: 'start' }}>
        {filtered.map((template) => <div key={template.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 11, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', marginBottom: 9 }}><div style={{ minWidth: 0 }}><strong style={{ fontSize: 12, wordBreak: 'break-word' }}>{template.name}</strong><div className="faint" style={{ fontSize: 10 }}>{template.category} · {template.language} · {template.header_format}</div></div><span className="chip" style={{ fontSize: 10 }}>{template.status.toUpperCase() === 'APPROVED' ? 'Aprovado' : template.status}</span></div>
          <WhatsAppTemplatePreview template={template} compact />
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setExpandedId(template.id)} style={{ width: '100%', marginTop: 10 }}>Ampliar mensagem e imagem</button>
        </div>)}
      </div>
    </div>
    {expanded && <div role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setExpandedId(null); }} style={{ position: 'fixed', inset: 0, zIndex: 120, background: '#0009', padding: 16, display: 'grid', placeItems: 'center' }}>
      <div className="card" role="dialog" aria-modal="true" aria-label={`Prévia do modelo ${expanded.name}`} style={{ width: 'min(520px, 96vw)', maxHeight: '95vh', overflowY: 'auto', padding: 15 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 13 }}><strong style={{ wordBreak: 'break-word' }}>{expanded.name}</strong><button className="btn btn-ghost btn-sm" type="button" onClick={() => setExpandedId(null)} aria-label="Fechar prévia">✕ Fechar</button></div>
        <WhatsAppTemplatePreview template={expanded} />
        {expanded.header_format === 'IMAGE' && <p className="faint" style={{ fontSize: 11, marginTop: 10 }}>Imagem de exemplo aprovada pela Meta. Na campanha, a imagem exibida será o arquivo anexado na criação da transmissão.</p>}
      </div>
    </div>}
  </section>;
}
