'use client';

import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { stagesFor } from '@/lib/stages';
import type { LeadKind } from '@/lib/types';

type Channel = 'clientes' | 'corretores';
type MappingSource = 'name' | 'enterprise' | 'company' | 'stage' | 'fixed';
type VariableMapping = { source: MappingSource; value?: string };

export type BroadcastConnection = {
  id: string;
  channel: Channel;
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  status: string;
};

export type BroadcastTemplate = {
  id: string;
  whatsapp_connection_id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  quality_score: string | null;
  header_format: string;
  body_text: string;
  footer_text: string | null;
  buttons: Array<Record<string, unknown>>;
  variable_count: number;
  last_synced_at: string;
};

export type Broadcast = {
  id: string;
  channel: Channel;
  name: string;
  stages: string[];
  template_name: string;
  template_language: string;
  template_category: string;
  status: string;
  recipient_count: number;
  queued_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  skipped_count: number;
  created_at: string;
  completed_at: string | null;
};

const statusLabels: Record<string, string> = {
  draft: 'Rascunho', ready: 'Pronta para enviar', running: 'Em envio', paused: 'Pausada', completed: 'Concluída', cancelled: 'Cancelada', failed: 'Falhou',
};

const mappingLabels: Record<MappingSource, string> = {
  name: 'Nome do contato', enterprise: 'Empreendimento', company: 'Imobiliária', stage: 'Etapa do CRM', fixed: 'Texto fixo',
};

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function safeFileName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-160);
}

function fileRule(headerType: string) {
  if (headerType === 'IMAGE') return { accept: 'image/jpeg,image/png', max: 5 * 1024 * 1024, label: 'JPG ou PNG, até 5 MB' };
  if (headerType === 'VIDEO') return { accept: 'video/mp4,video/3gpp', max: 16 * 1024 * 1024, label: 'MP4 ou 3GP, até 16 MB' };
  return {
    accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv',
    max: 100 * 1024 * 1024,
    label: 'PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT ou CSV, até 100 MB',
  };
}

function previewValue(mapping: VariableMapping) {
  if (mapping.source === 'fixed') return mapping.value || '[texto fixo]';
  return `[${mappingLabels[mapping.source]}]`;
}

function renderedPreview(template: BroadcastTemplate | null, mappings: VariableMapping[]) {
  if (!template) return '';
  return mappings.reduce((text, mapping, index) => text.replaceAll(`{{${index + 1}}}`, previewValue(mapping)), template.body_text);
}

export function BroadcastsManager({
  organizationId,
  canEdit,
  initialBroadcasts,
  initialTemplates,
  connections,
  stageCounts,
  onOpenTemplates,
}: {
  organizationId: string;
  canEdit: boolean;
  initialBroadcasts: Broadcast[];
  initialTemplates: BroadcastTemplate[];
  onOpenTemplates?: () => void;
  connections: BroadcastConnection[];
  stageCounts: Record<string, { total: number; eligible: number }>;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const stopRef = useRef(false);
  const [broadcasts, setBroadcasts] = useState(initialBroadcasts);
  const [templates, setTemplates] = useState(initialTemplates);
  const [mode, setMode] = useState<'list' | 'new'>('list');
  const [channel, setChannel] = useState<Channel>('clientes');
  const [name, setName] = useState('');
  const [selectedStages, setSelectedStages] = useState<string[]>(['futuro']);
  const [templateId, setTemplateId] = useState('');
  const [mappings, setMappings] = useState<VariableMapping[]>([]);
  const [mediaPath, setMediaPath] = useState('');
  const [mediaMimeType, setMediaMimeType] = useState('');
  const [mediaFilename, setMediaFilename] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const kind: LeadKind = channel === 'clientes' ? 'cliente' : 'corretor';
  const stages = stagesFor(kind);
  const connection = connections.find((item) => item.channel === channel && item.status === 'connected') ?? null;
  const channelTemplates = templates.filter((template) => template.whatsapp_connection_id === connection?.id);
  const approvedTemplates = channelTemplates.filter((template) => template.status.toUpperCase() === 'APPROVED' && template.category.toUpperCase() === 'MARKETING');
  const selectedTemplate = templates.find((template) => template.id === templateId) ?? null;
  const mediaRequired = Boolean(selectedTemplate && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selectedTemplate.header_format));
  const totals = selectedStages.reduce((acc, stage) => {
    const count = stageCounts[`${kind}:${stage}`] ?? { total: 0, eligible: 0 };
    return { total: acc.total + count.total, eligible: acc.eligible + count.eligible };
  }, { total: 0, eligible: 0 });
  const preview = renderedPreview(selectedTemplate, mappings);

  const allRecipients = broadcasts.reduce((sum, item) => sum + Number(item.recipient_count || 0), 0);
  const allSent = broadcasts.reduce((sum, item) => sum + Number(item.sent_count || 0) + Number(item.delivered_count || 0) + Number(item.read_count || 0), 0);
  const allRead = broadcasts.reduce((sum, item) => sum + Number(item.read_count || 0), 0);

  function resetForm(nextChannel: Channel = 'clientes') {
    setChannel(nextChannel);
    setName('');
    setSelectedStages(['futuro']);
    setTemplateId('');
    setMappings([]);
    setMediaPath('');
    setMediaMimeType('');
    setMediaFilename('');
    setError('');
    setNotice('');
  }

  function chooseChannel(value: Channel) {
    resetForm(value);
  }

  function toggleStage(stage: string) {
    setSelectedStages((current) => current.includes(stage) ? current.filter((item) => item !== stage) : [...current, stage]);
  }

  function chooseTemplate(id: string) {
    const template = templates.find((item) => item.id === id);
    setTemplateId(id);
    setMappings(Array.from({ length: Number(template?.variable_count || 0) }, () => ({ source: 'name' as const })));
    setMediaPath('');
    setMediaMimeType('');
    setMediaFilename('');
  }

  function setMapping(index: number, source: MappingSource, value = '') {
    setMappings((current) => current.map((mapping, position) => position === index ? { source, value: source === 'fixed' ? value : undefined } : mapping));
  }

  async function syncTemplates() {
    if (!connection) { setError('Conecte primeiro o número deste público em Canais WhatsApp.'); return; }
    setSyncing(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/transmissoes/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível sincronizar os modelos.');
      const synced = (payload.templates ?? []) as BroadcastTemplate[];
      setTemplates((current) => [...current.filter((item) => item.whatsapp_connection_id !== connection.id), ...synced]);
      setNotice(`${payload.synced ?? synced.length} modelos consultados na Meta.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível sincronizar os modelos.');
    } finally { setSyncing(false); }
  }

  async function uploadMedia(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedTemplate) return;
    const rule = fileRule(selectedTemplate.header_format);
    if (file.size > rule.max) { setError(`O arquivo excede o limite: ${rule.label}.`); event.target.value = ''; return; }
    const accepted = rule.accept.split(',').some((item) => item.startsWith('.') ? file.name.toLowerCase().endsWith(item) : file.type === item);
    if (!accepted) { setError(`Formato incompatível. Use ${rule.label}.`); event.target.value = ''; return; }

    setUploading(true);
    setError('');
    const path = `${organizationId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from('broadcast-media').upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) setError(uploadError.message);
    else {
      setMediaPath(path);
      setMediaMimeType(file.type);
      setMediaFilename(file.name);
      setNotice(`Anexo “${file.name}” carregado.`);
    }
    setUploading(false);
  }

  async function createBroadcast() {
    if (!canEdit) return;
    setError('');
    setNotice('');
    if (!connection) { setError('O número deste público não está conectado.'); return; }
    if (!name.trim() || !templateId || selectedStages.length === 0) { setError('Informe o nome, selecione as etapas e escolha um modelo aprovado.'); return; }
    if (mediaRequired && !mediaPath) { setError(`Anexe o arquivo exigido pelo cabeçalho ${selectedTemplate?.header_format.toLowerCase()}.`); return; }
    if (mappings.some((mapping) => mapping.source === 'fixed' && !mapping.value?.trim())) { setError('Preencha todos os textos fixos das variáveis.'); return; }
    const confirmed = window.confirm(`Preparar a transmissão “${name.trim()}” para ${totals.eligible} contatos elegíveis? O envio ainda não começará.`);
    if (!confirmed) return;

    setSaving(true);
    try {
      const response = await fetch('/api/transmissoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), channel, stages: selectedStages, templateId, variableMappings: mappings,
          mediaBucket: mediaPath ? 'broadcast-media' : null, mediaPath: mediaPath || null,
          mediaMimeType: mediaMimeType || null, mediaFilename: mediaFilename || null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível criar a transmissão.');
      setBroadcasts((current) => [payload.broadcast as Broadcast, ...current]);
      setNotice(`Transmissão preparada para ${payload.eligible} contatos. ${payload.skipped ? `${payload.skipped} foram excluídos por opt-out, pausa, duplicidade ou telefone inválido.` : ''}`);
      setMode('list');
      resetForm(channel);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar a transmissão.');
    } finally { setSaving(false); }
  }

  async function runBroadcast(broadcast: Broadcast) {
    if (!canEdit || runningId) return;
    const continuing = broadcast.status === 'running';
    if (!continuing && !window.confirm(`Iniciar o envio de “${broadcast.name}” para ${broadcast.recipient_count} contatos?`)) return;
    stopRef.current = false;
    setRunningId(broadcast.id);
    setError('');
    setNotice('');
    try {
      const completed = await (async () => {
        while (!stopRef.current) {
          const response = await fetch(`/api/transmissoes/${broadcast.id}/send`, { method: 'POST' });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || 'Falha durante o envio da transmissão.');
          const batchDone = Boolean(payload.done);
          setBroadcasts((current) => current.map((item) => item.id === broadcast.id ? {
            ...item,
            status: batchDone ? 'completed' : 'running',
            queued_count: payload.counts?.queued ?? item.queued_count,
            sent_count: payload.counts?.sent ?? item.sent_count,
            delivered_count: payload.counts?.delivered ?? item.delivered_count,
            read_count: payload.counts?.read ?? item.read_count,
            failed_count: payload.counts?.failed ?? item.failed_count,
          } : item));
          if (batchDone) return true;
          await new Promise((resolve) => window.setTimeout(resolve, 350));
        }
        return false;
      })();
      setNotice(completed ? `Transmissão “${broadcast.name}” concluída.` : `Envio pausado após o lote atual. Clique em Continuar para retomar.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha durante o envio.');
    } finally { setRunningId(null); }
  }

  return <div className="page-content">
    {error && <div className="error-box">{error}</div>}
    {notice && <div className="success-box">{notice}</div>}

    {mode === 'list' ? <>
      <div className="page-head">
        <div><h2>Transmissões pelo WhatsApp</h2><p>Selecione o público e as etapas, use somente modelos aprovados e acompanhe cada envio.</p></div>
        <div className="page-actions"><button className="btn btn-ghost" onClick={() => router.refresh()}>↻ Atualizar resultados</button>{canEdit && <button className="btn btn-primary" onClick={() => { resetForm('clientes'); setMode('new'); }}>+ Nova transmissão</button>}</div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="kpi-label">Transmissões</div><div className="kpi-value">{broadcasts.length}</div><div className="kpi-note">histórico geral</div></div>
        <div className="kpi"><div className="kpi-label">Destinatários</div><div className="kpi-value">{allRecipients}</div><div className="kpi-note">selecionados</div></div>
        <div className="kpi"><div className="kpi-label">Enviadas</div><div className="kpi-value">{allSent}</div><div className="kpi-note">aceitas pela Meta</div></div>
        <div className="kpi"><div className="kpi-label">Lidas</div><div className="kpi-value">{allRead}</div><div className="kpi-note">confirmação do WhatsApp</div></div>
      </div>

      <section className="card">
        <div className="card-head"><h3>Histórico de transmissões</h3></div>
        <div className="table-wrap"><table><thead><tr><th>Transmissão</th><th>Público</th><th>Modelo Meta</th><th>Progresso</th><th>Entrega</th><th>Status</th><th></th></tr></thead><tbody>
          {broadcasts.length === 0 && <tr><td colSpan={7}><div className="empty-state">Nenhuma transmissão criada.</div></td></tr>}
          {broadcasts.map((item) => {
            const handled = Number(item.sent_count) + Number(item.delivered_count) + Number(item.read_count) + Number(item.failed_count);
            return <tr key={item.id}>
              <td><strong>{item.name}</strong><br /><small className="faint">{dateTime.format(new Date(item.created_at))}</small></td>
              <td>{item.channel === 'clientes' ? 'Clientes finais' : 'Corretores'}<br /><small className="faint">{item.recipient_count} destinatários</small></td>
              <td><strong>{item.template_name}</strong><br /><small className="faint">{item.template_language} · {item.template_category}</small></td>
              <td><strong>{handled}/{item.recipient_count}</strong><br /><small className="faint">{item.queued_count} na fila · {item.failed_count} falhas</small></td>
              <td><strong>{item.delivered_count} entregues</strong><br /><small className="faint">{item.read_count} lidas</small></td>
              <td><span className={`chip ${item.status === 'completed' ? 'chip-green' : item.status === 'running' ? 'chip-orange' : ''}`}>{statusLabels[item.status] || item.status}</span></td>
              <td>{canEdit && ['ready', 'running', 'paused'].includes(item.status) && <button className="btn btn-primary btn-sm" disabled={Boolean(runningId)} onClick={() => void runBroadcast(item)}>{runningId === item.id ? 'Enviando…' : item.status === 'ready' ? 'Iniciar envio' : 'Continuar'}</button>}{runningId === item.id && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={() => { stopRef.current = true; }}>Pausar</button>}</td>
            </tr>;
          })}
        </tbody></table></div>
      </section>
    </> : <>
      <div className="page-head">
        <div><h2>Nova transmissão</h2><p>A campanha será preparada primeiro. O envio começa somente após uma segunda confirmação.</p></div>
        <button className="btn btn-ghost" onClick={() => setMode('list')}>← Voltar</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <section className="card"><div className="card-head"><h3>1. Público e segmentação</h3></div><div className="card-body">
            <div className="grid grid-2">
              <div className="field"><label>Nome da transmissão</label><input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Reativação da base antiga · Flow" /></div>
              <div className="field"><label>Público / número remetente</label><select className="select" value={channel} onChange={(event) => chooseChannel(event.target.value as Channel)}><option value="clientes">Clientes finais · WhatsApp Clientes</option><option value="corretores">Corretores · WhatsApp Corretores</option></select></div>
            </div>
            <div className="field"><label>Etapas que receberão a mensagem</label><div className="grid grid-3">{stages.map((stage) => { const count = stageCounts[`${kind}:${stage.id}`] ?? { total: 0, eligible: 0 }; return <label key={stage.id} className="card" style={{ padding: 11, cursor: 'pointer', borderColor: selectedStages.includes(stage.id) ? 'var(--orange)' : undefined }}><input type="checkbox" checked={selectedStages.includes(stage.id)} onChange={() => toggleStage(stage.id)} /> <strong>{stage.label}</strong><br /><small className="faint">{count.eligible} elegíveis de {count.total}</small></label>; })}</div></div>
            <div className="info-box"><strong>{totals.eligible} contatos elegíveis</strong> de {totals.total} registros nas etapas. O sistema exclui arquivados, opt-outs, automações pausadas, telefones inválidos e números duplicados.</div>
          </div></section>

          <section className="card"><div className="card-head"><h3>2. Modelo aprovado pela Meta</h3><button className="btn btn-ghost btn-sm" disabled={syncing || !connection} onClick={() => void syncTemplates()}>{syncing ? 'Sincronizando…' : '↻ Sincronizar Meta'}</button></div><div className="card-body">
            {!connection && <div className="error-box">O WhatsApp deste público ainda não está conectado.</div>}
            {connection && <div className="info-box" style={{ marginTop: 0 }}><strong>{connection.verified_name || 'WhatsApp conectado'}</strong> · {connection.display_phone_number || 'número não informado'} · Qualidade {connection.quality_rating || 'não informada'}</div>}
            <div className="field"><label>Modelo Marketing aprovado</label><select className="select" value={templateId} onChange={(event) => chooseTemplate(event.target.value)} disabled={!connection}><option value="">Selecione um modelo</option>{approvedTemplates.map((template) => <option value={template.id} key={template.id}>{template.name} · {template.language} · {template.header_format}</option>)}</select></div>
            {connection && approvedTemplates.length === 0 && <div className="info-box">Nenhum modelo Marketing aprovado foi encontrado neste canal. Crie o modelo na aba <strong>Modelos da Meta</strong>, aguarde a aprovação e clique em “Sincronizar Meta”.{onOpenTemplates && <><br /><button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 9 }} onClick={onOpenTemplates}>🧩 Ir para Modelos da Meta</button></>}</div>}
            {selectedTemplate && <><div className="field"><label>Variáveis do corpo</label>{mappings.length === 0 ? <div className="faint">Este modelo não possui variáveis.</div> : <div className="grid grid-2">{mappings.map((mapping, index) => <div className="card" style={{ padding: 10 }} key={index}><label style={{ fontSize: 11, fontWeight: 800 }}>{`{{${index + 1}}}`}</label><select className="select" value={mapping.source} onChange={(event) => setMapping(index, event.target.value as MappingSource)}>{Object.entries(mappingLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>{mapping.source === 'fixed' && <input className="input" style={{ marginTop: 7 }} value={mapping.value || ''} onChange={(event) => setMapping(index, 'fixed', event.target.value)} placeholder="Texto que será igual para todos" />}</div>)}</div>}</div>
              <div className="card" style={{ padding: 14, background: 'var(--bg)' }}><div className="faint" style={{ fontSize: 10, marginBottom: 7 }}>PRÉVIA DO WHATSAPP</div><div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{preview || selectedTemplate.body_text}</div>{selectedTemplate.footer_text && <div className="faint" style={{ marginTop: 10 }}>{selectedTemplate.footer_text}</div>}</div></>}
          </div></section>

          {mediaRequired && selectedTemplate && <section className="card"><div className="card-head"><h3>3. Anexo do cabeçalho</h3><span className="chip">{selectedTemplate.header_format}</span></div><div className="card-body"><div className="field"><label>Arquivo obrigatório</label><input className="input" type="file" accept={fileRule(selectedTemplate.header_format).accept} disabled={uploading} onChange={(event) => void uploadMedia(event)} /><small className="faint">{fileRule(selectedTemplate.header_format).label}. O tipo precisa ser exatamente o mesmo aprovado no cabeçalho do modelo.</small></div>{uploading && <div className="info-box">Enviando arquivo…</div>}{mediaPath && <div className="success-box">Anexo pronto: {mediaFilename}</div>}</div></section>}
        </div>

        <aside style={{ position: 'sticky', top: 84, display: 'grid', gap: 14 }}>
          <section className="card"><div className="card-head"><h3>Resumo</h3></div><div className="card-body info-list">
            <div className="info-row"><span>Público</span><strong>{channel === 'clientes' ? 'Clientes finais' : 'Corretores'}</strong></div>
            <div className="info-row"><span>Etapas</span><strong>{selectedStages.length}</strong></div>
            <div className="info-row"><span>Elegíveis</span><strong>{totals.eligible}</strong></div>
            <div className="info-row"><span>Modelo</span><strong>{selectedTemplate?.name || '—'}</strong></div>
            <div className="info-row"><span>Categoria</span><strong>{selectedTemplate?.category || 'MARKETING'}</strong></div>
            <div className="info-row"><span>Anexo</span><strong>{mediaRequired ? mediaFilename || 'Obrigatório' : 'Não exigido'}</strong></div>
          </div></section>
          <section className="card"><div className="card-body"><div className="info-box" style={{ marginTop: 0 }}><strong>Proteções ativas</strong><br />Somente modelo Marketing aprovado, público compatível com o número, exclusão de opt-outs e confirmação dupla antes do disparo.</div><button className="btn btn-primary btn-block" disabled={saving || uploading || totals.eligible === 0 || !selectedTemplate} onClick={() => void createBroadcast()}>{saving ? 'Preparando…' : 'Preparar transmissão'}</button></div></section>
          <section className="card"><div className="card-head"><h3>Anexos aceitos</h3></div><div className="card-body muted" style={{ fontSize: 12, lineHeight: 1.7 }}><strong>Imagem:</strong> JPG/PNG até 5 MB.<br /><strong>Vídeo:</strong> MP4/3GP até 16 MB.<br /><strong>Documento:</strong> PDF, Word, Excel, PowerPoint, TXT ou CSV até 100 MB.<br /><br />Áudio não é permitido como cabeçalho de modelo de transmissão.</div></section>
        </aside>
      </div>
    </>}
  </div>;
}
