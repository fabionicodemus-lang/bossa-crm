'use client';

import { FormEvent, useMemo, useState } from 'react';

export type MetaTemplateConnection = {
  id: string;
  channel: 'clientes' | 'corretores';
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  status: string;
};

export type MetaTemplateRow = {
  id: string;
  whatsapp_connection_id: string;
  meta_template_id: string | null;
  name: string;
  language: string;
  category: string;
  status: string;
  quality_score: string | null;
  rejected_reason?: string | null;
  header_format: string;
  body_text: string;
  footer_text: string | null;
  components: Array<Record<string, unknown>>;
  buttons: Array<Record<string, unknown>>;
  variable_count: number;
  source?: string;
  submitted_at?: string | null;
  last_synced_at: string;
};

type ButtonDraft = {
  id: string;
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  value: string;
  example: string;
};

type HeaderFormat = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';

type ApiError = { error?: string };

const statusLabels: Record<string, string> = {
  APPROVED: 'Aprovado',
  PENDING: 'Em análise',
  REJECTED: 'Rejeitado',
  PAUSED: 'Pausado',
  DISABLED: 'Desativado',
  IN_APPEAL: 'Em recurso',
  PENDING_DELETION: 'Exclusão pendente',
};

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Erro inesperado.';
}

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 512);
}

function countVariables(value: string) {
  const values = [...value.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  return values.length ? Math.max(...values) : 0;
}

function renderPreview(text: string, examples: string[]) {
  return examples.reduce((current, example, index) => current.replaceAll(`{{${index + 1}}}`, example || `Exemplo ${index + 1}`), text);
}

function dateTime(value: string | null | undefined) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('pt-BR');
}

function buttonLabel(type: ButtonDraft['type']) {
  if (type === 'URL') return 'Abrir site';
  if (type === 'PHONE_NUMBER') return 'Ligar';
  return 'Resposta rápida';
}

export function MetaTemplatesManager({
  initialTemplates,
  connections,
  canEdit,
}: {
  initialTemplates: MetaTemplateRow[];
  connections: MetaTemplateConnection[];
  canEdit: boolean;
}) {
  const connected = connections.filter((connection) => connection.status === 'connected');
  const [templates, setTemplates] = useState(initialTemplates);
  const [connectionId, setConnectionId] = useState(connected[0]?.id ?? '');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('pt_BR');
  const [category, setCategory] = useState<'MARKETING' | 'UTILITY'>('MARKETING');
  const [headerFormat, setHeaderFormat] = useState<HeaderFormat>('NONE');
  const [headerText, setHeaderText] = useState('');
  const [headerFile, setHeaderFile] = useState<File | null>(null);
  const [bodyText, setBodyText] = useState('Olá {{1}}, esta é uma mensagem da Bossa Empreendimentos.');
  const [bodyExamples, setBodyExamples] = useState<string[]>(['Fábio']);
  const [footerText, setFooterText] = useState('Bossa Empreendimentos');
  const [buttons, setButtons] = useState<ButtonDraft[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedConnection = connected.find((connection) => connection.id === connectionId) ?? null;
  const variableCount = countVariables(bodyText);
  const visibleTemplates = useMemo(
    () => templates.filter((template) => template.whatsapp_connection_id === connectionId),
    [connectionId, templates],
  );

  const visibleBodyExamples = useMemo(
    () => Array.from({ length: variableCount }, (_, index) => bodyExamples[index] ?? ''),
    [bodyExamples, variableCount],
  );

  function resetForm() {
    setName('');
    setLanguage('pt_BR');
    setCategory('MARKETING');
    setHeaderFormat('NONE');
    setHeaderText('');
    setHeaderFile(null);
    setBodyText('Olá {{1}}, esta é uma mensagem da Bossa Empreendimentos.');
    setBodyExamples(['Fábio']);
    setFooterText('Bossa Empreendimentos');
    setButtons([]);
    setError('');
  }

  async function syncTemplates() {
    if (!selectedConnection) return;
    setSyncing(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/transmissoes/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: selectedConnection.channel }),
      });
      const data = await response.json() as { templates?: MetaTemplateRow[]; synced?: number } & ApiError;
      if (!response.ok) throw new Error(data.error || 'Não foi possível sincronizar.');
      setTemplates((current) => [
        ...current.filter((template) => template.whatsapp_connection_id !== selectedConnection.id),
        ...(data.templates ?? []),
      ]);
      setNotice(`${data.synced ?? 0} modelo(s) consultado(s) na Meta.`);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setSyncing(false);
    }
  }

  function addButton() {
    setButtons((current) => current.length >= 3 ? current : [
      ...current,
      { id: crypto.randomUUID(), type: 'QUICK_REPLY', text: '', value: '', example: '' },
    ]);
  }

  function updateButton(id: string, patch: Partial<ButtonDraft>) {
    setButtons((current) => current.map((button) => button.id === id ? { ...button, ...patch } : button));
  }

  function removeButton(id: string) {
    setButtons((current) => current.filter((button) => button.id !== id));
  }

  async function submitTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConnection) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const form = new FormData();
      form.set('connection_id', selectedConnection.id);
      form.set('name', normalizeName(name));
      form.set('language', language);
      form.set('category', category);
      form.set('header_format', headerFormat);
      form.set('header_text', headerText);
      if (headerFile) form.set('header_file', headerFile);
      form.set('body_text', bodyText);
      form.set('body_examples', JSON.stringify(visibleBodyExamples));
      form.set('footer_text', footerText);
      form.set('buttons', JSON.stringify(buttons.map(({ type, text, value, example }) => ({ type, text, value, example }))));

      const response = await fetch('/api/modelos-meta', { method: 'POST', body: form });
      const data = await response.json() as { template?: MetaTemplateRow } & ApiError;
      if (!response.ok || !data.template) throw new Error(data.error || 'Não foi possível enviar o modelo.');

      setTemplates((current) => [
        data.template!,
        ...current.filter((template) => template.id !== data.template!.id),
      ]);
      setNotice(`Modelo ${data.template.name} enviado para a Meta com status ${statusLabels[data.template.status] ?? data.template.status}.`);
      resetForm();
      setShowForm(false);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setSaving(false);
    }
  }

  const previewBody = renderPreview(bodyText, visibleBodyExamples);
  const fileAccept = headerFormat === 'IMAGE'
    ? 'image/jpeg,image/png'
    : headerFormat === 'VIDEO'
      ? 'video/mp4,video/3gpp'
      : headerFormat === 'DOCUMENT'
        ? '.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx'
        : undefined;

  return <div className="page-content">
    <div className="page-head">
      <div>
        <h2>Modelos de mensagem</h2>
        <p>Crie modelos pela API oficial da Meta e acompanhe a aprovação antes de usá-los nas campanhas.</p>
      </div>
      <div className="page-actions">
        <button type="button" className="btn btn-ghost" onClick={() => void syncTemplates()} disabled={!selectedConnection || syncing}>{syncing ? 'Sincronizando…' : '↻ Sincronizar Meta'}</button>
        {canEdit && <button type="button" className="btn btn-primary" onClick={() => { setShowForm((value) => !value); setError(''); }} disabled={!selectedConnection}>+ Novo modelo</button>}
      </div>
    </div>

    {error && <div className="error-box">{error}</div>}
    {notice && <div className="success-box">{notice}</div>}
    {!connected.length && <div className="error-box">Conecte um canal em <strong>Canais WhatsApp</strong> antes de criar modelos.</div>}

    <section className="card">
      <div className="card-head"><h3>Canal da Meta</h3></div>
      <div className="card-body grid grid-2">
        <div className="field"><label>Número conectado</label><select className="select" value={connectionId} onChange={(event) => { setConnectionId(event.target.value); setError(''); setNotice(''); }}><option value="">Selecione…</option>{connected.map((connection) => <option value={connection.id} key={connection.id}>{connection.channel === 'clientes' ? 'Clientes finais' : 'Corretores'} · {connection.display_phone_number || connection.verified_name || connection.id}</option>)}</select></div>
        <div className="info-box">Os modelos pertencem à conta do WhatsApp vinculada a este canal. O token não é exibido nem enviado ao navegador.</div>
      </div>
    </section>

    {canEdit && showForm && selectedConnection && <form onSubmit={submitTemplate} className="card" style={{ marginTop: 14 }}>
      <div className="card-head"><h3>Novo modelo para aprovação</h3><span className="chip">{category === 'MARKETING' ? 'Marketing' : 'Utilidade'}</span></div>
      <div className="card-body" style={{ display: 'grid', gap: 16 }}>
        <div className="grid grid-3">
          <div className="field"><label>Nome do modelo</label><input className="input mono" value={name} onChange={(event) => setName(normalizeName(event.target.value))} placeholder="ex.: revisao_app_bossa_2026" required /><small className="faint">Somente letras minúsculas, números e _.</small></div>
          <div className="field"><label>Categoria</label><select className="select" value={category} onChange={(event) => setCategory(event.target.value as 'MARKETING' | 'UTILITY')}><option value="MARKETING">Marketing</option><option value="UTILITY">Utilidade</option></select></div>
          <div className="field"><label>Idioma</label><select className="select" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="pt_BR">Português (Brasil)</option><option value="en_US">Inglês (EUA)</option><option value="es">Espanhol</option></select></div>
        </div>

        <div className="grid grid-2">
          <div className="field"><label>Tipo de cabeçalho</label><select className="select" value={headerFormat} onChange={(event) => { setHeaderFormat(event.target.value as HeaderFormat); setHeaderFile(null); }}><option value="NONE">Sem cabeçalho</option><option value="TEXT">Texto</option><option value="IMAGE">Imagem</option><option value="VIDEO">Vídeo</option><option value="DOCUMENT">Documento</option></select></div>
          {headerFormat === 'TEXT' && <div className="field"><label>Texto do cabeçalho</label><input className="input" maxLength={60} value={headerText} onChange={(event) => setHeaderText(event.target.value)} required /></div>}
          {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat) && <div className="field"><label>Arquivo de exemplo</label><input className="input" type="file" accept={fileAccept} onChange={(event) => setHeaderFile(event.target.files?.[0] ?? null)} required /><small className="faint">Este arquivo é enviado à Meta apenas como amostra do cabeçalho.</small></div>}
        </div>

        <div className="field"><label>Corpo da mensagem</label><textarea className="textarea" value={bodyText} maxLength={1024} rows={5} onChange={(event) => setBodyText(event.target.value)} required /><small className="faint">Use variáveis sequenciais: {'{{1}}'}, {'{{2}}'}, {'{{3}}'}. {bodyText.length}/1024 caracteres.</small></div>

        {variableCount > 0 && <div className="card" style={{ boxShadow: 'none' }}><div className="card-head"><h3>Exemplos das variáveis</h3><span className="chip">Obrigatórios para análise</span></div><div className="card-body grid grid-3">{visibleBodyExamples.map((example, index) => <div className="field" key={index}><label>{`{{${index + 1}}}`}</label><input className="input" value={example} onChange={(event) => setBodyExamples((current) => Array.from({ length: variableCount }, (_, itemIndex) => itemIndex === index ? event.target.value : current[itemIndex] ?? ''))} placeholder={`Exemplo ${index + 1}`} required /></div>)}</div></div>}

        <div className="field"><label>Rodapé opcional</label><input className="input" maxLength={60} value={footerText} onChange={(event) => setFooterText(event.target.value)} /><small className="faint">{footerText.length}/60 caracteres.</small></div>

        <div className="card" style={{ boxShadow: 'none' }}>
          <div className="card-head"><h3>Botões opcionais</h3><button type="button" className="btn btn-ghost btn-sm" onClick={addButton} disabled={buttons.length >= 3}>+ Adicionar botão</button></div>
          <div className="card-body" style={{ display: 'grid', gap: 12 }}>
            {!buttons.length && <div className="faint">Nenhum botão configurado.</div>}
            {buttons.map((button) => <div className="grid grid-3" key={button.id}>
              <div className="field"><label>Tipo</label><select className="select" value={button.type} onChange={(event) => updateButton(button.id, { type: event.target.value as ButtonDraft['type'], value: '', example: '' })}><option value="QUICK_REPLY">Resposta rápida</option><option value="URL">Abrir site</option><option value="PHONE_NUMBER">Ligar</option></select></div>
              <div className="field"><label>Texto do botão</label><input className="input" maxLength={25} value={button.text} onChange={(event) => updateButton(button.id, { text: event.target.value })} placeholder={buttonLabel(button.type)} required /></div>
              <div className="field"><label>{button.type === 'URL' ? 'URL HTTPS' : button.type === 'PHONE_NUMBER' ? 'Telefone com DDI' : 'Ação'}</label>{button.type === 'QUICK_REPLY' ? <button type="button" className="btn btn-ghost" onClick={() => removeButton(button.id)}>Remover</button> : <div style={{ display: 'flex', gap: 8 }}><input className="input" value={button.value} onChange={(event) => updateButton(button.id, { value: event.target.value })} placeholder={button.type === 'URL' ? 'https://...' : '+5547999999999'} required /><button type="button" className="btn btn-ghost" onClick={() => removeButton(button.id)}>×</button></div>}</div>
              {button.type === 'URL' && button.value.includes('{{1}}') && <div className="field"><label>Exemplo da variável da URL</label><input className="input" value={button.example} onChange={(event) => updateButton(button.id, { example: event.target.value })} required /></div>}
            </div>)}
          </div>
        </div>

        <div className="card" style={{ boxShadow: 'none' }}>
          <div className="card-head"><h3>Prévia</h3><span className="chip">WhatsApp</span></div>
          <div className="card-body"><div style={{ maxWidth: 430, background: '#dcf8c6', borderRadius: 10, padding: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {headerFormat === 'TEXT' && headerText && <strong style={{ display: 'block', marginBottom: 6 }}>{headerText}</strong>}
            {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat) && <div className="faint" style={{ marginBottom: 8 }}>[{headerFormat === 'IMAGE' ? 'Imagem' : headerFormat === 'VIDEO' ? 'Vídeo' : 'Documento'}]</div>}
            <div>{previewBody || 'Corpo da mensagem'}</div>
            {footerText && <small className="faint" style={{ display: 'block', marginTop: 8 }}>{footerText}</small>}
            {buttons.map((button) => <div key={button.id} style={{ borderTop: '1px solid rgba(0,0,0,.12)', marginTop: 9, paddingTop: 8, textAlign: 'center', fontWeight: 700 }}>{button.text || buttonLabel(button.type)}</div>)}
          </div></div>
        </div>

        <div className="page-actions" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn btn-ghost" onClick={() => { resetForm(); setShowForm(false); }}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enviando à Meta…' : 'Enviar para aprovação da Meta'}</button></div>
      </div>
    </form>}

    <section className="card" style={{ marginTop: 14 }}>
      <div className="card-head"><h3>Modelos do canal</h3><span className="chip">{visibleTemplates.length}</span></div>
      <div className="table-wrap"><table><thead><tr><th>Modelo</th><th>Categoria</th><th>Idioma</th><th>Cabeçalho</th><th>Status</th><th>Qualidade</th><th>Última sincronização</th></tr></thead><tbody>
        {!visibleTemplates.length && <tr><td colSpan={7}><div className="empty-state">Nenhum modelo sincronizado neste canal.</div></td></tr>}
        {visibleTemplates.map((template) => <tr key={template.id}><td><strong>{template.name}</strong><div className="faint">{template.body_text}</div>{template.rejected_reason && <div className="error-box" style={{ marginTop: 6 }}>{template.rejected_reason}</div>}</td><td>{template.category}</td><td>{template.language}</td><td>{template.header_format || 'NONE'}</td><td><span className="chip">{statusLabels[template.status] ?? template.status}</span></td><td>{template.quality_score || '—'}</td><td>{dateTime(template.last_synced_at)}</td></tr>)}
      </tbody></table></div>
    </section>
  </div>;
}
