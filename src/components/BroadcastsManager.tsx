'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { stagesFor } from '@/lib/stages';
import type { LeadKind } from '@/lib/types';
import { WhatsAppTemplatePreview } from '@/components/WhatsAppTemplatePreview';

type Channel = 'clientes' | 'corretores';
type MappingSource = 'name' | 'enterprise' | 'company' | 'stage' | 'fixed';
type VariableMapping = { source: MappingSource; value?: string };

export type BroadcastConnection = {
  id: string; channel: Channel; display_phone_number: string | null; verified_name: string | null;
  quality_rating: string | null; status: string;
};
export type BroadcastTemplate = {
  id: string; whatsapp_connection_id: string; name: string; language: string;
  category: string; status: string; quality_score: string | null; header_format: string;
  body_text: string; footer_text: string | null; buttons: Array<Record<string, unknown>>;
  components?: Array<Record<string, unknown>>; variable_count: number; last_synced_at: string;
};
export type Broadcast = {
  id: string; channel: Channel; name: string; stages: string[]; template_name: string;
  template_language: string; template_category: string; status: string;
  recipient_count: number; queued_count: number; sent_count: number; delivered_count: number;
  read_count: number; failed_count: number; skipped_count: number;
  created_at: string; completed_at: string | null;
};
export type AudienceDiagnostics = {
  total: number; withoutPhone: number; optOut: number; paused: number; duplicates: number; eligible: number;
};
export type StageAudienceCount = AudienceDiagnostics;

const statusLabels: Record<string, string> = {
  draft: 'Rascunho', ready: 'Pronta para enviar', running: 'Em envio', paused: 'Pausada',
  completed: 'Concluída', cancelled: 'Cancelada', failed: 'Falhou',
};
const mappingLabels: Record<MappingSource, string> = {
  name: 'Nome do contato', enterprise: 'Empreendimento', company: 'Imobiliária',
  stage: 'Etapa do CRM', fixed: 'Texto fixo',
};
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function emptyAudience(): AudienceDiagnostics {
  return { total: 0, withoutPhone: 0, optOut: 0, paused: 0, duplicates: 0, eligible: 0 };
}
function safeFileName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-160);
}
function mediaRule(header: string) {
  if (header === 'IMAGE') return { accept: 'image/jpeg,image/png', max: 5 * 1024 * 1024, label: 'JPG ou PNG, até 5 MB' };
  if (header === 'VIDEO') return { accept: 'video/mp4,video/3gpp', max: 16 * 1024 * 1024, label: 'MP4 ou 3GP, até 16 MB' };
  return { accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv', max: 100 * 1024 * 1024, label: 'PDF, Word, Excel, PowerPoint, TXT ou CSV, até 100 MB' };
}
function previewText(template: BroadcastTemplate, mappings: VariableMapping[]) {
  return mappings.reduce((text, mapping, index) => text.replaceAll(`{{${index + 1}}}`, mapping.source === 'fixed' ? mapping.value || '[texto fixo]' : `[${mappingLabels[mapping.source]}]`), template.body_text);
}

export function BroadcastsManager({
  organizationId, canEdit, initialBroadcasts, initialTemplates, connections,
  stageCounts, audienceDiagnostics, onOpenTemplates,
}: {
  organizationId: string; canEdit: boolean; initialBroadcasts: Broadcast[];
  initialTemplates: BroadcastTemplate[]; connections: BroadcastConnection[];
  stageCounts: Record<string, StageAudienceCount>;
  audienceDiagnostics: Record<'cliente' | 'corretor', AudienceDiagnostics>;
  onOpenTemplates?: () => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const stopRef = useRef(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const templateIdRef = useRef('');
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
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [showMediaChoices, setShowMediaChoices] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); }, []);
  const kind: LeadKind = channel === 'clientes' ? 'cliente' : 'corretor';
  const stages = stagesFor(kind);
  const connection = connections.find((item) => item.channel === channel && item.status === 'connected') ?? null;
  const channelTemplates = templates.filter((item) => item.whatsapp_connection_id === connection?.id);
  const approvedTemplates = channelTemplates.filter((item) => item.status.toUpperCase() === 'APPROVED' && item.category.toUpperCase() === 'MARKETING');
  const selectedTemplate = approvedTemplates.find((item) => item.id === templateId) ?? null;
  const mediaType = selectedTemplate?.header_format.toUpperCase() || 'NONE';
  const mediaRequired = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(mediaType);
  const mediaTemplates = approvedTemplates.filter((item) => ['IMAGE', 'DOCUMENT', 'VIDEO'].includes(item.header_format.toUpperCase()));
  const allStagesSelected = stages.length > 0 && stages.every((stage) => selectedStages.includes(stage.id));
  const selectedDiagnostics = allStagesSelected ? audienceDiagnostics[kind] ?? emptyAudience() : selectedStages.reduce((acc, stage) => {
    const count = stageCounts[`${kind}:${stage}`] ?? emptyAudience();
    acc.total += count.total; acc.withoutPhone += count.withoutPhone; acc.optOut += count.optOut;
    acc.paused += count.paused; acc.duplicates += count.duplicates; acc.eligible += count.eligible;
    return acc;
  }, emptyAudience());
  const baseDiagnostics = audienceDiagnostics[kind] ?? emptyAudience();
  const allRecipients = broadcasts.reduce((sum, item) => sum + Number(item.recipient_count || 0), 0);
  const allSent = broadcasts.reduce((sum, item) => sum + Number(item.sent_count || 0) + Number(item.delivered_count || 0) + Number(item.read_count || 0), 0);
  const allRead = broadcasts.reduce((sum, item) => sum + Number(item.read_count || 0), 0);

  function clearMedia() {
    setMediaPath(''); setMediaMimeType(''); setMediaFilename(''); setMediaPreviewUrl(null);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    if (uploadInputRef.current) uploadInputRef.current.value = '';
  }
  function resetForm(nextChannel: Channel = 'clientes') {
    setChannel(nextChannel); setName(''); setSelectedStages(['futuro']);
    setTemplateId(''); templateIdRef.current = ''; setMappings([]); clearMedia();
    setShowMediaChoices(false); setError(''); setNotice('');
  }
  function chooseTemplate(id: string) {
    const template = templates.find((item) => item.id === id);
    setTemplateId(id); templateIdRef.current = id;
    setMappings(Array.from({ length: Number(template?.variable_count || 0) }, () => ({ source: 'name' as const })));
    clearMedia(); setShowMediaChoices(false); setError('');
  }
  function setMapping(index: number, source: MappingSource, value = '') {
    setMappings((current) => current.map((item, position) => position === index ? { source, value: source === 'fixed' ? value : undefined } : item));
  }
  async function syncTemplates() {
    if (!connection) { setError('Conecte primeiro o número em Canais WhatsApp.'); return; }
    setSyncing(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/transmissoes/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível sincronizar modelos.');
      const synced = (payload.templates ?? []) as BroadcastTemplate[];
      setTemplates((current) => [...current.filter((item) => item.whatsapp_connection_id !== connection.id), ...synced]);
      setNotice(`${payload.synced ?? synced.length} modelo(s) consultado(s) na Meta.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível sincronizar.'); }
    finally { setSyncing(false); }
  }

  async function uploadMedia(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedTemplate || !mediaRequired) return;
    const currentTemplateId = selectedTemplate.id;
    const rule = mediaRule(mediaType);
    if (file.size > rule.max) { setError(`Arquivo acima do limite: ${rule.label}.`); event.target.value = ''; return; }
    const accepted = rule.accept.split(',').some((part) => part.startsWith('.') ? file.name.toLowerCase().endsWith(part) : file.type === part);
    if (!accepted) { setError(`Formato incompatível: use ${rule.label}.`); event.target.value = ''; return; }
    setUploading(true); setError(''); setNotice('');
    const path = `${organizationId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    try {
      const { error: uploadError } = await supabase.storage.from('broadcast-media').upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      if (templateIdRef.current !== currentTemplateId) return;
      clearMedia();
      setMediaPath(path); setMediaMimeType(file.type); setMediaFilename(file.name);
      if (mediaType === 'IMAGE') {
        const url = URL.createObjectURL(file);
        objectUrlRef.current = url; setMediaPreviewUrl(url);
      }
      setNotice(`📎 Arquivo “${file.name}” anexado. Será enviado dentro do cabeçalho do modelo.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao anexar o arquivo.'); }
    finally { setUploading(false); }
  }

  async function createBroadcast() {
    if (!canEdit) return;
    setError(''); setNotice('');
    if (!connection) { setError('O número deste público não está conectado.'); return; }
    if (!name.trim() || !selectedTemplate || !selectedStages.length) { setError('Informe o nome, selecione etapas e escolha um modelo aprovado.'); return; }
    if (mediaRequired && !mediaPath) { setError('Clique em 📎 Anexar arquivo e escolha o arquivo do cabeçalho antes de preparar.'); return; }
    if (mappings.some((mapping) => mapping.source === 'fixed' && !mapping.value?.trim())) { setError('Preencha os textos fixos das variáveis.'); return; }
    if (!window.confirm(`Preparar a transmissão “${name.trim()}” para ${selectedDiagnostics.eligible} contatos elegíveis? O envio ainda não começará.`)) return;
    setSaving(true);
    try {
      const response = await fetch('/api/transmissoes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), channel, stages: selectedStages, templateId: selectedTemplate.id, variableMappings: mappings,
          mediaBucket: mediaRequired && mediaPath ? 'broadcast-media' : null,
          mediaPath: mediaRequired ? mediaPath || null : null,
          mediaMimeType: mediaRequired ? mediaMimeType || null : null,
          mediaFilename: mediaRequired ? mediaFilename || null : null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível criar a transmissão.');
      setBroadcasts((current) => [payload.broadcast as Broadcast, ...current]);
      setNotice(`Transmissão preparada para ${payload.eligible} contatos. ${payload.skipped ? `${payload.skipped} excluídos por opt-out, pausa, duplicidade ou telefone inválido.` : ''}`);
      setMode('list'); resetForm(channel); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível criar a transmissão.'); }
    finally { setSaving(false); }
  }

  async function runBroadcast(item: Broadcast) {
    if (!canEdit || runningId) return;
    const continuing = item.status === 'running';
    if (!continuing && !window.confirm(`Iniciar o envio de “${item.name}” para ${item.recipient_count} contatos?`)) return;
    stopRef.current = false; setRunningId(item.id); setError(''); setNotice('');
    try {
      while (!stopRef.current) {
        const response = await fetch(`/api/transmissoes/${item.id}/send`, { method: 'POST' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Falha durante o envio da transmissão.');
        const completed = Boolean(payload.done);
        setBroadcasts((current) => current.map((broadcast) => broadcast.id === item.id ? {
          ...broadcast, status: completed ? 'completed' : 'running',
          queued_count: payload.counts?.queued ?? broadcast.queued_count,
          sent_count: payload.counts?.sent ?? broadcast.sent_count,
          delivered_count: payload.counts?.delivered ?? broadcast.delivered_count,
          read_count: payload.counts?.read ?? broadcast.read_count,
          failed_count: payload.counts?.failed ?? broadcast.failed_count,
        } : broadcast));
        if (completed) {
          setNotice(`Transmissão “${item.name}” concluída.`);
          router.refresh();
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
      setNotice('Envio pausado após o lote atual. Clique em Continuar para retomar.');
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha durante o envio.'); }
    finally { setRunningId(null); }
  }

  return <div className="page-content">
    {error && <div className="error-box">{error}</div>}
    {notice && <div className="success-box">{notice}</div>}
    {mode === 'list' ? <>
      <div className="page-head"><div><h2>Transmissões pelo WhatsApp</h2><p>Use modelos aprovados, escolha o público e confira os anexos antes de enviar.</p></div><div className="page-actions"><button className="btn btn-ghost" onClick={() => router.refresh()}>↻ Atualizar resultados</button>{canEdit && <button className="btn btn-primary" onClick={() => { resetForm('clientes'); setMode('new'); }}>+ Nova transmissão</button>}</div></div>
      <div className="kpis">
        <div className="kpi"><div className="kpi-label">Transmissões</div><div className="kpi-value">{broadcasts.length}</div><div className="kpi-note">histórico geral</div></div>
        <div className="kpi"><div className="kpi-label">Destinatários</div><div className="kpi-value">{allRecipients}</div><div className="kpi-note">selecionados</div></div>
        <div className="kpi"><div className="kpi-label">Enviadas</div><div className="kpi-value">{allSent}</div><div className="kpi-note">aceitas pela Meta</div></div>
        <div className="kpi"><div className="kpi-label">Lidas</div><div className="kpi-value">{allRead}</div><div className="kpi-note">confirmação do WhatsApp</div></div>
      </div>
      <section className="card"><div className="card-head"><h3>Histórico de transmissões</h3></div><div className="table-wrap"><table><thead><tr><th>Transmissão</th><th>Público</th><th>Modelo Meta</th><th>Progresso</th><th>Entrega</th><th>Status</th><th></th></tr></thead><tbody>
        {!broadcasts.length && <tr><td colSpan={7}><div className="empty-state">Nenhuma transmissão criada.</div></td></tr>}
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
      </tbody></table></div></section>
    </> : <>
      <div className="page-head"><div><h2>Nova transmissão</h2><p>Prepare primeiro. O envio exige uma segunda confirmação.</p></div><button className="btn btn-ghost" onClick={() => setMode('list')}>← Voltar</button></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          <section className="card"><div className="card-head"><h3>1. Público e segmentação</h3></div><div className="card-body">
            <div className="grid grid-2"><div className="field"><label>Nome da transmissão</label><input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Tabela atualizada · Flow" /></div><div className="field"><label>Público / número remetente</label><select className="select" value={channel} onChange={(event) => resetForm(event.target.value as Channel)}><option value="clientes">Clientes finais · WhatsApp Clientes</option><option value="corretores">Corretores · WhatsApp Corretores</option></select></div></div>
            <div className="field"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 9, marginBottom: 7 }}><label style={{ marginBottom: 0 }}>Etapas que receberão</label><button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedStages(allStagesSelected ? [] : stages.map((item) => item.id))}>{allStagesSelected ? 'Limpar seleção' : 'Selecionar todas'}</button></div><div className="grid grid-3">{stages.map((stage) => { const count = stageCounts[`${kind}:${stage.id}`] ?? emptyAudience(); return <label key={stage.id} className="card" style={{ padding: 10, cursor: 'pointer', borderColor: selectedStages.includes(stage.id) ? 'var(--orange)' : undefined }}><input type="checkbox" checked={selectedStages.includes(stage.id)} onChange={() => setSelectedStages((current) => current.includes(stage.id) ? current.filter((item) => item !== stage.id) : [...current, stage.id])} /> <strong>{stage.label}</strong><br /><small className="faint">{count.eligible} elegíveis de {count.total}</small></label>; })}</div></div>
            <div className="info-box"><strong>{selectedDiagnostics.eligible} elegíveis</strong> em {selectedDiagnostics.total} registros · {selectedDiagnostics.withoutPhone} sem telefone · {selectedDiagnostics.optOut} opt-out · {selectedDiagnostics.paused} pausados · {selectedDiagnostics.duplicates} duplicados.</div>
            <div className="info-box" style={{ marginTop: 10 }}><strong>Base completa:</strong> {baseDiagnostics.total} registros, {baseDiagnostics.eligible} elegíveis. Arquivados não participam. A campanha revalida os contatos antes do envio.</div>
          </div></section>

          <section className="card"><div className="card-head"><h3>2. Modelo aprovado pela Meta</h3><button className="btn btn-ghost btn-sm" disabled={syncing || !connection} onClick={() => void syncTemplates()}>{syncing ? 'Sincronizando…' : '↻ Sincronizar Meta'}</button></div><div className="card-body" style={{ display: 'grid', gap: 13 }}>
            {!connection && <div className="error-box">O WhatsApp deste público ainda não está conectado.</div>}
            {connection && <div className="info-box"><strong>{connection.verified_name || 'WhatsApp conectado'}</strong> · {connection.display_phone_number || 'número não informado'} · Qualidade {connection.quality_rating || 'não informada'}</div>}
            <div className="field"><label>Modelo Marketing aprovado</label><select className="select" value={templateId} onChange={(event) => chooseTemplate(event.target.value)} disabled={!connection}><option value="">Selecione um modelo</option>{approvedTemplates.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.language} · {item.header_format}</option>)}</select></div>
            {connection && !approvedTemplates.length && <div className="info-box">Nenhum modelo Marketing aprovado neste canal. Crie na aba Modelos da Meta, aguarde aprovação e sincronize.{onOpenTemplates && <><br /><button className="btn btn-ghost btn-sm" onClick={onOpenTemplates}>Ir para Modelos da Meta</button></>}</div>}
            {selectedTemplate && <div className="field"><label>Variáveis do corpo</label>{!mappings.length ? <div className="faint">Este modelo não possui variáveis.</div> : <div className="grid grid-2">{mappings.map((mapping, index) => <div className="card" style={{ padding: 9 }} key={index}><label style={{ fontSize: 11, fontWeight: 800 }}>{`{{${index + 1}}}`}</label><select className="select" value={mapping.source} onChange={(event) => setMapping(index, event.target.value as MappingSource)}>{Object.entries(mappingLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>{mapping.source === 'fixed' && <input className="input" style={{ marginTop: 7 }} value={mapping.value || ''} onChange={(event) => setMapping(index, 'fixed', event.target.value)} placeholder="Texto fixo" />}</div>)}</div>}</div>}
          </div></section>

          <section className="card"><div className="card-head"><h3>3. 📎 Anexar PDF ou imagem</h3><span className="chip">{mediaRequired ? `Cabeçalho ${mediaType}` : 'Modelos Meta'}</span></div><div className="card-body" style={{ display: 'grid', gap: 12 }}>
            {!selectedTemplate && <div className="info-box">Escolha primeiro um modelo aprovado. Depois, clique em 📎 para selecionar a imagem ou PDF.</div>}
            {selectedTemplate && !mediaRequired && <>
              <div className="info-box">Este modelo foi aprovado <strong>sem imagem ou documento</strong>. A Meta não permite anexar um PDF ou imagem avulsa a esse modelo em uma transmissão fora da janela de 24 horas. Escolha um modelo aprovado com cabeçalho de imagem ou documento.</div>
              <button type="button" className="btn btn-primary" onClick={() => setShowMediaChoices((value) => !value)}>📎 Escolher modelo com anexo</button>
              {showMediaChoices && <div className="field"><label>Modelos que aceitam arquivos</label>{mediaTemplates.length ? <select className="select" value="" onChange={(event) => chooseTemplate(event.target.value)}><option value="">Selecione o modelo correto</option>{mediaTemplates.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.header_format === 'IMAGE' ? 'Imagem' : item.header_format === 'DOCUMENT' ? 'PDF/documento' : 'Vídeo'}</option>)}</select> : <div className="info-box">Ainda não há modelo com anexo aprovado neste canal.</div>}{onOpenTemplates && <button className="btn btn-ghost btn-sm" onClick={onOpenTemplates}>+ Criar modelo com cabeçalho IMAGE ou DOCUMENT</button>}</div>}
            </>}
            {selectedTemplate && mediaRequired && <>
              <div className="info-box">O modelo <strong>{selectedTemplate.name}</strong> exige um arquivo do tipo <strong>{mediaType === 'IMAGE' ? 'imagem' : mediaType === 'DOCUMENT' ? 'documento' : 'vídeo'}</strong>. Escolha o arquivo que cada destinatário receberá; pode ser diferente da amostra usada na aprovação, mas deve manter o mesmo formato.</div>
              <button className="btn btn-primary" type="button" disabled={uploading} onClick={() => uploadInputRef.current?.click()}>{uploading ? 'Enviando anexo…' : mediaPath ? '📎 Trocar arquivo anexado' : '📎 Anexar arquivo agora'}</button>
              <input ref={uploadInputRef} type="file" accept={mediaRule(mediaType).accept} style={{ display: 'none' }} disabled={uploading} onChange={(event) => void uploadMedia(event)} aria-label="Selecionar arquivo para transmissão" />
              <small className="faint">{mediaRule(mediaType).label}. O formato precisa corresponder ao cabeçalho aprovado.</small>
              {mediaPath && <div className="success-box" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><span>✓ Anexo pronto: <strong>{mediaFilename}</strong></span><button className="btn btn-ghost btn-sm" type="button" onClick={clearMedia}>Remover</button></div>}
            </>}
          </div></section>
        </div>
        <aside style={{ display: 'grid', gap: 14, minWidth: 0 }}>
          {selectedTemplate && <section className="card"><div className="card-head"><h3>Prévia — tela do WhatsApp</h3></div><div className="card-body"><WhatsAppTemplatePreview key={`${selectedTemplate.id}-${mediaPreviewUrl || ''}`} template={selectedTemplate} bodyOverride={previewText(selectedTemplate, mappings)} mediaPreviewUrl={mediaPreviewUrl} filename={mediaFilename || null} /><small className="faint" style={{ display: 'block', marginTop: 8 }}>{mediaRequired && !mediaPath ? 'Anexe o arquivo acima para ver a mídia que será enviada.' : 'Prévia ilustrativa; as variáveis mudam para cada destinatário.'}</small></div></section>}
          <section className="card"><div className="card-head"><h3>Resumo</h3></div><div className="card-body info-list">
            <div className="info-row"><span>Público</span><strong>{channel === 'clientes' ? 'Clientes finais' : 'Corretores'}</strong></div>
            <div className="info-row"><span>Etapas</span><strong>{selectedStages.length}</strong></div>
            <div className="info-row"><span>Elegíveis</span><strong>{selectedDiagnostics.eligible}</strong></div>
            <div className="info-row"><span>Modelo</span><strong>{selectedTemplate?.name || '—'}</strong></div>
            <div className="info-row"><span>Anexo</span><strong>{mediaRequired ? mediaFilename || 'Obrigatório — clique em 📎' : 'Modelo sem anexo'}</strong></div>
          </div></section>
          <section className="card"><div className="card-body"><div className="info-box"><strong>Proteções ativas</strong><br />Somente modelos Marketing aprovados; exclusão de opt-outs; arquivo compatível; dupla confirmação de envio.</div><button className="btn btn-primary btn-block" disabled={saving || uploading || !selectedDiagnostics.eligible || !selectedTemplate || (mediaRequired && !mediaPath)} onClick={() => void createBroadcast()}>{saving ? 'Preparando…' : mediaRequired && !mediaPath ? '📎 Anexe o arquivo para continuar' : 'Preparar transmissão'}</button></div></section>
          <section className="card"><div className="card-head"><h3>Arquivos aceitos</h3></div><div className="card-body muted" style={{ fontSize: 12, lineHeight: 1.7 }}><strong>Imagem:</strong> JPG/PNG até 5 MB.<br /><strong>Vídeo:</strong> MP4/3GP até 16 MB.<br /><strong>Documento:</strong> PDF, Word, Excel, PowerPoint, TXT ou CSV até 100 MB.<br />O tipo depende do cabeçalho já aprovado pela Meta.</div></section>
        </aside>
      </div>
    </>}
  </div>;
}
