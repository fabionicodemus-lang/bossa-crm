'use client';

import { useMemo, useState } from 'react';

type TemplatePreviewData = {
  id: string;
  name: string;
  header_format: string;
  body_text: string;
  footer_text: string | null;
  components?: Array<Record<string, unknown>>;
  buttons?: Array<Record<string, unknown>>;
};

function component(template: TemplatePreviewData, type: string): Record<string, unknown> | undefined {
  return template.components?.find((entry) => String(entry.type ?? '').toUpperCase() === type);
}

function exampleBody(template: TemplatePreviewData) {
  const body = component(template, 'BODY');
  const example = (body?.example as { body_text?: unknown } | undefined)?.body_text;
  const values = Array.isArray(example) && Array.isArray(example[0]) ? example[0] as unknown[] : [];
  return template.body_text.replace(/\{\{(\d+)\}\}/g, (_, number: string) => {
    const value = values[Number(number) - 1];
    return typeof value === 'string' && value.trim() ? value : `Exemplo ${number}`;
  });
}

/** WhatsApp usa marcação simples. Renderizamos como elementos React; nunca como HTML fornecido pela Meta. */
function formatted(text: string) {
  return text.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|```[^`]+```)/g).map((part, index) => {
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <strong key={index}>{part.slice(1, -1)}</strong>;
    if (part.startsWith('_') && part.endsWith('_') && part.length > 2) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith('~') && part.endsWith('~') && part.length > 2) return <s key={index}>{part.slice(1, -1)}</s>;
    if (part.startsWith('```') && part.endsWith('```') && part.length > 6) return <code key={index}>{part.slice(3, -3)}</code>;
    return <span key={index}>{part}</span>;
  });
}

export function WhatsAppTemplatePreview({ template, bodyOverride, mediaPreviewUrl, filename, compact = false }: {
  template: TemplatePreviewData;
  bodyOverride?: string;
  mediaPreviewUrl?: string | null;
  filename?: string | null;
  compact?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const header = component(template, 'HEADER');
  const format = template.header_format.toUpperCase();
  const textHeader = typeof header?.text === 'string' ? header.text : '';
  const buttonsComponent = component(template, 'BUTTONS');
  const buttons = template.buttons?.length ? template.buttons : Array.isArray(buttonsComponent?.buttons) ? buttonsComponent.buttons as Array<Record<string, unknown>> : [];
  const body = useMemo(() => bodyOverride ?? exampleBody(template), [bodyOverride, template]);
  const imageSrc = mediaPreviewUrl || `/api/transmissoes/templates/${encodeURIComponent(template.id)}/preview-media`;

  return <div style={{ background: '#e8e3dc', border: '1px solid #d3d1c9', borderRadius: 15, overflow: 'hidden', color: '#202c33', maxWidth: compact ? 370 : 430, width: '100%' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', background: '#f0f2f5', borderBottom: '1px solid #d9dde0' }}>
      <span style={{ width: 33, height: 33, borderRadius: '50%', background: '#355e51', color: 'white', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>B</span>
      <div><strong style={{ fontSize: 12, display: 'block' }}>Bossa Empreendimentos</strong><span style={{ fontSize: 10, color: '#667781' }}>Conta comercial · prévia</span></div>
    </div>
    <div style={{ padding: compact ? '12px 10px' : 16, backgroundColor: '#e9e4dc', backgroundImage: 'radial-gradient(#d5d0c8 0.65px, transparent 0.65px)', backgroundSize: '15px 15px' }}>
      <div style={{ background: '#fff', borderRadius: '3px 11px 11px 11px', boxShadow: '0 1px 2px #00000018', overflow: 'hidden', fontSize: compact ? 11 : 13 }}>
        {format === 'TEXT' && Boolean(textHeader) && <strong style={{ display: 'block', padding: '12px 12px 0', fontSize: 13 }}>{textHeader}</strong>}
        {format === 'IMAGE' && <div style={{ background: '#eceff1', minHeight: compact ? 120 : 165, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
          {!imageFailed ? <img key={imageSrc} src={imageSrc} alt={`Imagem de exemplo de ${template.name}`} loading="lazy" onError={() => setImageFailed(true)} style={{ display: 'block', width: '100%', maxHeight: compact ? 210 : 260, objectFit: 'contain' }} /> : <div style={{ padding: 22, textAlign: 'center', color: '#667781' }}>▧<br />Imagem de exemplo indisponível<br /><small>O arquivo anexado à transmissão aparecerá aqui.</small></div>}
        </div>}
        {format === 'VIDEO' && <div style={{ padding: 24, textAlign: 'center', background: '#e6e9eb', color: '#54646e' }}>▶<br />Vídeo do cabeçalho<br /><small>Prévia de reprodução não disponível</small></div>}
        {format === 'DOCUMENT' && <div style={{ margin: 8, padding: 11, display: 'flex', alignItems: 'center', gap: 10, background: '#f0f2f5', borderRadius: 7 }}><span style={{ fontSize: 26, color: '#bd4747' }}>▤</span><div style={{ overflow: 'hidden' }}><strong style={{ display: 'block', fontSize: 12, wordBreak: 'break-word' }}>{filename || 'Documento PDF / arquivo do modelo'}</strong><span style={{ color: '#667781', fontSize: 10 }}>Documento anexado · cabeçalho</span></div></div>}
        <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.42, padding: '9px 11px 5px' }}>{formatted(body || 'Mensagem sem texto')}</div>
        {template.footer_text && <div style={{ padding: '1px 11px 8px', fontSize: 10, color: '#667781', whiteSpace: 'pre-wrap' }}>{template.footer_text}</div>}
        <div style={{ textAlign: 'right', padding: '0 9px 5px', fontSize: 9, color: '#667781' }}>12:00</div>
      </div>
      {buttons.map((button, index) => <div key={index} style={{ background: 'white', marginTop: 3, borderRadius: 8, textAlign: 'center', padding: '9px 7px', color: '#027eb5', fontWeight: 650, fontSize: 12, boxShadow: '0 1px 2px #00000012' }}>{button.type === 'URL' ? '↗ ' : button.type === 'PHONE_NUMBER' ? '☎ ' : '↪ '}{String(button.text ?? 'Botão')}</div>)}
    </div>
    <div style={{ fontSize: 10, color: '#667781', padding: '7px 10px', background: '#f0f2f5' }}>Simulação visual — a apresentação pode variar conforme o aparelho.</div>
  </div>;
}
