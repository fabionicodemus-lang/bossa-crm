'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { campaignRecipientSummary, type BrowserCampaignMedia, type BrowserRecipientStatus } from '@/lib/browser-campaigns';
import styles from './BrowserCampaignManager.module.css';

type Contact = { id: string; name: string; phone: string; stage: string; company: string | null; enterprise: string | null };
type Campaign = {
  id: string; name: string; sender_phone: string; base_text: string; variants: string[];
  media: BrowserCampaignMedia[]; status: string; recipient_count: number; created_at: string;
  consent_confirmed_at: string | null;
};
type Recipient = {
  id: string; lead_name: string; phone: string; stage: string; message_text: string;
  status: BrowserRecipientStatus; next_item_index: number; detail: string | null; position: number;
};
type Claim = {
  recipient_id: string; lead_name: string; phone: string; message_text: string;
  next_item_index: number; item_count: number; media: BrowserCampaignMedia[];
};
type BridgeOutcome = { state: 'observed' | 'uncertain' | 'skipped'; detail: string };

const API = '/api/transmissoes/navegador';
const MAX_RECIPIENTS = 600;
const MIN_REVIEW_DELAY_MS = 15000;
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const statusLabels: Record<string, string> = {
  draft: 'Rascunho', ready: 'Aprovada', running: 'Em andamento', paused: 'Pausada',
  completed: 'Concluída', cancelled: 'Cancelada',
  queued: 'Na fila', claimed: 'Reservado', sent: 'Observado na tela', uncertain: 'Conferir', skipped: 'Ignorado',
};

async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return data;
}

function mutation<T>(url: string, payload: Record<string, unknown>, method = 'POST') {
  return jsonRequest<T>(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

function bridgeCommand(type: 'PING' | 'SEND_ITEM', payload: Record<string, unknown> = {}, timeoutMs = 12000): Promise<BridgeOutcome> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('A extensão não respondeu. Confira o Chrome e o WhatsApp Web.'));
    }, timeoutMs);
    function handler(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data as Record<string, unknown> | null;
      if (data?.source !== 'bossa-chrome-extension' || data.requestId !== requestId) return;
      window.clearTimeout(timeout);
      window.removeEventListener('message', handler);
      if (data.error) reject(new Error(String(data.error)));
      else resolve(data.result as BridgeOutcome);
    }
    window.addEventListener('message', handler);
    window.postMessage({ source: 'bossa-crm-page', type, requestId, payload }, window.location.origin);
  });
}

export function BrowserCampaignManager({ organizationId, canEdit }: { organizationId: string; canEdit: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<'list' | 'create' | 'detail'>('list');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [contactsTruncated, setContactsTruncated] = useState(false);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [senderBlocked, setSenderBlocked] = useState(false);
  const [name, setName] = useState('Tabela de empreendimentos');
  const [senderPhone, setSenderPhone] = useState('');
  const [baseText, setBaseText] = useState('Olá, {{nome}}! Segue a tabela atualizada dos empreendimentos da Bossa. Se precisar de alguma informação, fico à disposição.');
  const [variants, setVariants] = useState<string[]>([]);
  const [media, setMedia] = useState<BrowserCampaignMedia[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [stage, setStage] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extension, setExtension] = useState<'checking' | 'connected' | 'missing'>('checking');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [progress, setProgress] = useState('');
  const [batchLimit, setBatchLimit] = useState<1 | 5 | 25>(1);
  const stopRef = useRef(false);
  const mountedRef = useRef(true);
  const runningRef = useRef(false);
  const workerIdRef = useRef(crypto.randomUUID());

  const refreshList = useCallback(async () => {
    const result = await jsonRequest<{ campaigns: Campaign[] }>(API);
    if (mountedRef.current) setCampaigns(result.campaigns);
  }, []);

  const refreshDetail = useCallback(async (id: string) => {
    const result = await jsonRequest<{ campaign: Campaign; recipients: Recipient[]; senderBlocked: boolean }>(`${API}?campaign=${id}`);
    if (mountedRef.current) {
      setCampaign(result.campaign);
      setRecipients(result.recipients);
      setSenderBlocked(result.senderBlocked);
    }
    return result;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refreshList().catch((cause) => setError(String(cause)));
    void bridgeCommand('PING').then(() => setExtension('connected')).catch(() => setExtension('missing'));
    return () => { mountedRef.current = false; stopRef.current = true; };
  }, [refreshList]);

  const stages = useMemo(() => [...new Set(contacts.map((row) => row.stage))].sort(), [contacts]);
  const visible = useMemo(() => contacts.filter((row) => {
    const term = filter.trim().toLocaleLowerCase('pt-BR');
    return (!stage || row.stage === stage)
      && (!term || [row.name, row.phone, row.company, row.enterprise].some((value) => String(value ?? '').toLocaleLowerCase('pt-BR').includes(term)));
  }), [contacts, filter, stage]);
  const summary = useMemo(() => campaignRecipientSummary(recipients), [recipients]);

  async function openCreate() {
    setMode('create'); setError(''); setNotice('');
    if (contacts.length) return;
    setBusy(true);
    try {
      const result = await jsonRequest<{ contacts: Contact[]; total: number; truncated: boolean }>(`${API}?mode=contacts`);
      setContacts(result.contacts); setContactsTotal(result.total); setContactsTruncated(result.truncated);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar contatos.'); }
    finally { setBusy(false); }
  }

  async function openDetail(id: string) {
    setError(''); setNotice(''); setConsent(false); setBusy(true);
    try { await refreshDetail(id); setMode('detail'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao abrir campanha.'); }
    finally { setBusy(false); }
  }

  function toggleContact(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_RECIPIENTS) next.add(id);
      return next;
    });
  }

  function toggleVisible() {
    setSelected((current) => {
      const next = new Set(current);
      const allChecked = visible.every((row) => next.has(row.id));
      if (allChecked) visible.forEach((row) => next.delete(row.id));
      else for (const row of visible) {
        if (next.size >= MAX_RECIPIENTS) break;
        next.add(row.id);
      }
      return next;
    });
  }

  async function uploadFile(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (!files.length) return;
    if (media.length + files.length > 3) { setError('Limite de três PDFs por campanha.'); return; }
    setUploading(true); setError('');
    try {
      const uploaded: BrowserCampaignMedia[] = [];
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 8 * 1024 * 1024 || file.size < 1)
          throw new Error(`“${file.name}”: selecione um PDF de até 8 MB.`);
        const raw = await file.arrayBuffer();
        const signature = new Uint8Array(raw.slice(0, 5));
        if (String.fromCharCode(...signature) !== '%PDF-') throw new Error(`“${file.name}” não parece um PDF válido.`);
        const hash = await crypto.subtle.digest('SHA-256', raw);
        const sha256 = [...new Uint8Array(hash)].map((part) => part.toString(16).padStart(2, '0')).join('');
        const filename = file.name.slice(0, 160);
        const safeName = filename.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9._-]/g, '-');
        const path = `${organizationId}/${crypto.randomUUID()}-${safeName}`;
        const { error: storageError } = await supabase.storage.from('broadcast-media')
          .upload(path, file, { contentType: 'application/pdf', upsert: false });
        if (storageError) throw storageError;
        uploaded.push({ bucket: 'broadcast-media', path, filename, mime: 'application/pdf', size: file.size, sha256 });
      }
      setMedia((current) => [...current, ...uploaded]);
      setNotice(`${uploaded.length} arquivo(s) enviado(s) para a área privada da organização.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha no upload.'); }
    finally { setUploading(false); }
  }

  async function generateVariations() {
    setBusy(true); setError('');
    try {
      const result = await mutation<{ variants: string[] }>(`${API}/variacoes`, { baseText });
      setVariants(result.variants);
      setNotice('Quatro versões criadas. Leia todas antes de preparar a campanha.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'A IA não respondeu.'); }
    finally { setBusy(false); }
  }

  async function createCampaign() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await mutation<{ id: string }>(API, {
        name, senderPhone, baseText, variants, media, leadIds: [...selected],
      });
      await refreshList();
      await openDetail(result.id);
      setNotice('Rascunho criado. Revise os destinatários, os textos e os anexos antes de aprovar.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao criar campanha.'); }
    finally { setBusy(false); }
  }

  async function changeStatus(action: 'approve' | 'start' | 'pause' | 'cancel') {
    if (!campaign) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await mutation(API, { campaignId: campaign.id, action, consentConfirmed: consent }, 'PATCH');
      await Promise.all([refreshDetail(campaign.id), refreshList()]);
      if (action === 'approve') setNotice('Campanha aprovada. A equipe pode iniciar pelo Chrome.');
      if (action === 'pause') { stopRef.current = true; setNotice('Pausa solicitada após a etapa atual.'); }
      if (action === 'start') setNotice('Campanha liberada para o navegador. Clique em “Executar neste Chrome”.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o estado.'); }
    finally { setBusy(false); }
  }

  async function workerRequest<T>(payload: Record<string, unknown>) {
    return mutation<T>(`${API}/worker`, payload);
  }

  async function executeInChrome() {
    if (!campaign || runningRef.current) return;
    if (!window.confirm(`Você conferiu que este Chrome está conectado ao WhatsApp do remetente +${campaign.sender_phone}? Esta execução poderá enviar para até ${batchLimit} destinatário(s) aprovados e registrará cada etapa.`)) return;
    const id = campaign.id;
    setError(''); setNotice(''); setProgress('Verificando a extensão...');
    try { await bridgeCommand('PING'); setExtension('connected'); }
    catch { setExtension('missing'); setError('A extensão Bossa não está conectada. Instale-a no Chrome e recarregue a página.'); return; }
    runningRef.current = true; stopRef.current = false; setRunning(true);
    const workerId = workerIdRef.current;
    try {
      let waiting = 0;
      for (let count = 0; count < batchLimit && !stopRef.current; count++) {
        const { recipient } = await workerRequest<{ recipient: Claim | null }>({ action: 'claim', campaignId: id, workerId });
        if (!recipient) {
          const current = await refreshDetail(id);
          const remaining = current.recipients.filter((row) => row.status === 'queued').length;
          if (!remaining || ++waiting >= 5) {
            setNotice(remaining ? 'O remetente está ocupado em outro computador. Tente de novo quando a sessão liberar.' : 'Sem novos destinatários. Verifique os itens pendentes de conferência.');
            break;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 6000));
          count--;
          continue;
        }
        waiting = 0;
        let index = recipient.next_item_index;
        const heartbeat = window.setInterval(() => {
          void workerRequest({ action: 'heartbeat', campaignId: id, workerId, recipientId: recipient.recipient_id })
            .catch(() => { stopRef.current = true; });
        }, 20000);
        try {
          while (index < recipient.item_count) {
            if (stopRef.current) {
              await workerRequest({ action: 'ack', campaignId: id, workerId,
                recipientId: recipient.recipient_id, itemIndex: index,
                result: 'uncertain', detail: 'Operador pausou após uma etapa; conferir antes de recomeçar.' });
              break;
            }
            setProgress(`${recipient.lead_name} (${recipient.phone}) · ${index + 1}/${recipient.item_count}`);
            let outcome: BridgeOutcome;
            try {
              if (index === 0) {
                outcome = await bridgeCommand('SEND_ITEM', {
                  phone: recipient.phone, kind: 'text', text: recipient.message_text,
                }, 120000);
              } else {
                const file = recipient.media[index - 1];
                if (!file) throw new Error('Anexo não encontrado no rascunho aprovado.');
                const { data: blob, error: downloadError } = await supabase.storage.from(file.bucket).download(file.path);
                if (downloadError || !blob || blob.size !== file.size) throw downloadError || new Error('O anexo foi alterado.');
                const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
                const hash = [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
                if (hash !== file.sha256) throw new Error('O PDF difere do aprovado. O envio foi interrompido.');
                const base64 = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onerror = () => reject(new Error('Falha ao abrir o PDF.'));
                  reader.onload = () => resolve(String(reader.result).split(',')[1]);
                  reader.readAsDataURL(blob);
                });
                outcome = await bridgeCommand('SEND_ITEM', {
                  phone: recipient.phone, kind: 'file', base64,
                  filename: file.filename, size: file.size,
                }, 180000);
              }
            } catch (cause) {
              outcome = { state: 'uncertain', detail: cause instanceof Error ? cause.message : 'Erro inesperado na interface.' };
            }
            const { status } = await workerRequest<{ status: string }>({
              action: 'ack', campaignId: id, workerId, recipientId: recipient.recipient_id,
              itemIndex: index, result: outcome.state, detail: outcome.detail,
            });
            if (status !== 'claimed') {
              if (status === 'uncertain') {
                // Não iniciar outra conversa enquanto há um clique cujo
                // resultado pode ter chegado depois do timeout do navegador.
                stopRef.current = true;
                setNotice(`Execução interrompida. Conferir manualmente: ${recipient.lead_name}. ${outcome.detail}`);
              }
              break;
            }
            index++;
          }
        } finally { window.clearInterval(heartbeat); }
        if ((count + 1) % 5 === 0) await refreshDetail(id);
        if (count + 1 === batchLimit) setNotice(`Lote supervisionado de ${batchLimit} destinatário(s) concluído. Confira os estados antes de executar o próximo lote.`);
        else if (!stopRef.current) {
          // Intervalo de revisão operacional: dá tempo para o responsável
          // perceber uma falha e pausar antes de abrir a próxima conversa.
          setProgress('Intervalo de revisão antes do próximo destinatário...');
          await new Promise((resolve) => window.setTimeout(resolve, MIN_REVIEW_DELAY_MS));
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sessão interrompida. Confira os envios incertos.');
    } finally {
      runningRef.current = false; setRunning(false); setProgress('');
      await Promise.allSettled([refreshDetail(id), refreshList()]);
    }
  }

  async function reconcile(recipient: Recipient, resolution: 'sent' | 'skipped') {
    if (!campaign) return;
    if (!window.confirm(`Você conferiu a conversa de ${recipient.lead_name} no WhatsApp Web? Marcar como ${resolution === 'sent' ? 'enviada' : 'não enviada'}?`)) return;
    setBusy(true); setError('');
    try {
      await mutation(`${API}/reconcile`, { campaignId: campaign.id, recipientId: recipient.id, resolution });
      await refreshDetail(campaign.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha na conferência.'); }
    finally { setBusy(false); }
  }

  async function releaseSender() {
    if (!campaign) return;
    if (!window.confirm(`Você conferiu que o WhatsApp +${campaign.sender_phone} não está enviando em nenhum outro Chrome? Esta ação libera a fila após uma sessão interrompida.`)) return;
    setBusy(true); setError('');
    try {
      const result = await workerRequest<{ released: boolean }>({ action: 'release-sender',
        campaignId: campaign.id, workerId: workerIdRef.current });
      if (!result.released) throw new Error('O número está em uso ou já foi liberado.');
      await refreshDetail(campaign.id);
      setNotice('Número liberado. Confira os destinatários pendentes antes de continuar.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao liberar remetente.'); }
    finally { setBusy(false); }
  }

  return <div className="page-content">
    <div className={styles.noticeBox}>
      <strong>Chrome aberto e WhatsApp Web conectado.</strong> Esta modalidade depende do computador do operador. A extensão usa a interface visível; mudanças no WhatsApp podem interromper a execução. Envie somente a corretores que concordaram em receber as tabelas.
      <a href="/downloads/bossa-whatsapp-web.zip" download>Baixar extensão para a equipe</a>
      <span className={styles.extensionStatus}>Extensão: {extension === 'connected' ? '● conectada' : extension === 'checking' ? 'verificando...' : '○ não encontrada'}</span>
    </div>
    {error && <div className="error-box" role="alert">{error}</div>}
    {notice && <div className="info-box" role="status">{notice}</div>}

    {mode === 'list' && <section className="card">
      <div className="card-head"><h3>Campanhas pelo navegador</h3>{canEdit && <button className="btn btn-primary btn-sm" onClick={() => void openCreate()}>+ Nova campanha</button>}</div>
      <div className="card-body">
        <p className={styles.muted}>Esta fila é independente das transmissões pela API oficial. Todos os operadores autorizados da Bossa compartilham os mesmos destinatários e estados.</p>
        {campaigns.length === 0 && <p>Nenhuma campanha criada nesta modalidade.</p>}
        <div className={styles.campaignList}>{campaigns.map((item) => <button key={item.id} className={styles.campaignRow} onClick={() => void openDetail(item.id)}>
          <span><strong>{item.name}</strong><small>{dateTime.format(new Date(item.created_at))} · {item.recipient_count} corretores</small></span>
          <span className={styles.pill}>{statusLabels[item.status] || item.status}</span>
        </button>)}</div>
      </div>
    </section>}

    {mode === 'create' && <>
      <div className={styles.titleRow}><h2>Preparar uma transmissão</h2><button className="btn btn-ghost btn-sm" onClick={() => setMode('list')}>Voltar</button></div>
      <section className="card"><div className="card-head"><h3>1. Conteúdo e remetente</h3></div><div className="card-body">
        <div className={styles.twoColumns}>
          <div className="field"><label>Nome interno da campanha</label><input value={name} maxLength={160} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label>Número do WhatsApp aberto no Chrome (com DDI)</label><input value={senderPhone} placeholder="5547999999999" inputMode="tel" onChange={(e) => setSenderPhone(e.target.value)} /></div>
        </div>
        <div className="field"><label>Mensagem para os corretores</label><textarea rows={6} maxLength={4000} value={baseText} onChange={(e) => { setBaseText(e.target.value); setVariants([]); }} />
          <small>Use {'{{nome}}'}, {'{{imobiliaria}}'} ou {'{{empreendimento}}'} para preencher com os dados do CRM.</small></div>
        <div className={styles.actions}><button className="btn btn-secondary btn-sm" disabled={busy || !baseText.trim()} onClick={() => void generateVariations()}>{busy ? 'Aguarde...' : '✨ Gerar 4 variações com IA'}</button>
          {variants.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setVariants([])}>Remover variações</button>}</div>
        {variants.map((value, index) => <div className="field" key={index}><label>Variação {index + 1} — revise e edite</label><textarea rows={4} maxLength={4000} value={value} onChange={(e) => setVariants((old) => old.map((text, position) => position === index ? e.target.value : text))} /></div>)}
      </div></section>
      <section className="card"><div className="card-head"><h3>2. Tabelas e arquivos</h3></div><div className="card-body">
        <label className={styles.uploadButton}>📎 Selecionar PDFs <input type="file" accept="application/pdf,.pdf" multiple disabled={uploading || media.length >= 3} onChange={(e) => void uploadFile(e)} /></label>
        <p className={styles.muted}>Até 3 PDFs de 8 MB cada, máximo de 20 MB no total. O WhatsApp tenta enviar o texto e depois cada arquivo. A seleção automática de PDF depende da versão do WhatsApp Web; quando não puder ser validada, a execução para para conferência manual.</p>
        {media.map((file) => <div className={styles.fileRow} key={file.path}><span>📄 {file.filename} · {(file.size / 1048576).toFixed(1)} MB</span><button className="btn btn-ghost btn-sm" onClick={() => setMedia((old) => old.filter((entry) => entry.path !== file.path))}>Remover</button></div>)}
        {uploading && <span>Enviando arquivos...</span>}
      </div></section>
      <section className="card"><div className="card-head"><h3>3. Corretores autorizados <span className={styles.pill}>{selected.size} selecionados</span></h3></div><div className="card-body">
        <p className={styles.muted}>{contactsTotal} corretores elegíveis no CRM. Contatos sem telefone, com opt-out, pausados ou com identidade conflitante são excluídos.{contactsTruncated && ' A lista exibe os 2.500 primeiros; refine a segmentação da base para ver os demais.'}</p>
        <div className={styles.filters}><input aria-label="Buscar corretor" placeholder="Buscar nome, telefone, imobiliária..." value={filter} onChange={(e) => setFilter(e.target.value)} />
          <select aria-label="Filtrar etapa" value={stage} onChange={(e) => setStage(e.target.value)}><option value="">Todas as etapas</option>{stages.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <button className="btn btn-secondary btn-sm" onClick={toggleVisible}>Selecionar/desmarcar filtro ({visible.length})</button></div>
        <div className={styles.contactList}>{visible.slice(0, 250).map((lead) => <label className={styles.contactRow} key={lead.id}>
          <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleContact(lead.id)} />
          <span><strong>{lead.name}</strong><small>{lead.company || lead.enterprise || lead.stage} · +{lead.phone}</small></span>
        </label>)}</div>
        {visible.length > 250 && <p className={styles.muted}>Exibindo 250 de {visible.length} contatos filtrados. O botão “Selecionar filtro” inclui até 600.</p>}
        <div className={styles.actions}><button className="btn btn-primary" disabled={busy || uploading || !selected.size || !senderPhone || !baseText.trim()} onClick={() => void createCampaign()}>{busy ? 'Preparando...' : `Criar rascunho com ${selected.size} corretores`}</button></div>
      </div></section>
    </>}

    {mode === 'detail' && campaign && <>
      <div className={styles.titleRow}><div><h2>{campaign.name}</h2><p className={styles.muted}>Remetente +{campaign.sender_phone} · {campaign.recipient_count} corretores · {statusLabels[campaign.status]}</p></div><button className="btn btn-ghost btn-sm" onClick={() => { setMode('list'); void refreshList(); }}>Voltar às campanhas</button></div>
      <div className={styles.stats}>{([
        ['Na fila', summary.queued], ['Em uso', summary.claimed], ['Observados', summary.sent],
        ['Conferir', summary.uncertain], ['Ignorados', summary.skipped],
      ] as const).map(([label, count]) => <div className={styles.stat} key={label}><strong>{count}</strong><span>{label}</span></div>)}</div>
      <section className="card"><div className="card-head"><h3>Revisar e controlar</h3></div><div className="card-body">
        {senderBlocked && <div className="error-box">A sessão anterior desse número perdeu conexão. Confira se o outro Chrome parou e revise o contato marcado como “Conferir”.
          {canEdit && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void releaseSender()}>Liberar número após conferência</button>}
        </div>}
        <p><strong>Texto base:</strong> {campaign.base_text}</p>
        {campaign.variants?.length > 0 && <details><summary>{campaign.variants.length} variações aprovadas no rascunho</summary>{campaign.variants.map((item, index) => <p key={index}>{index + 1}. {item}</p>)}</details>}
        <p><strong>Anexos:</strong> {campaign.media.length ? campaign.media.map((file) => file.filename).join(', ') : 'nenhum'}</p>
        {campaign.status === 'draft' && canEdit && <div className={styles.approveBox}>
          <label><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> Confirmo que os corretores selecionados autorizaram este tipo de comunicação, e revisei destinatários, texto e PDFs.</label>
          <button className="btn btn-primary" disabled={!consent || busy} onClick={() => void changeStatus('approve')}>Aprovar campanha</button>
        </div>}
        {canEdit && <div className={styles.actions}>
          {(['ready', 'paused'].includes(campaign.status)) && <button className="btn btn-primary" disabled={busy} onClick={() => void changeStatus('start')}>Liberar fila</button>}
          {campaign.status === 'running' && !running && <label className="field">Destinatários por execução
            <select aria-label="Destinatários por execução" value={batchLimit} disabled={busy} onChange={(e) => setBatchLimit(Number(e.target.value) as 1 | 5 | 25)}>
              <option value={1}>1 — teste inicial</option><option value={5}>5 — lote supervisionado</option><option value={25}>25 — limite máximo</option>
            </select>
          </label>}
          {campaign.status === 'running' && !running && <button className="btn btn-primary" disabled={busy || senderBlocked} onClick={() => void executeInChrome()}>▶ Executar neste Chrome</button>}
          {campaign.status === 'running' && <button className="btn btn-secondary" disabled={busy} onClick={() => { stopRef.current = true; void changeStatus('pause'); }}>⏸ Pausar campanha</button>}
          {running && <span className={styles.pill}>⏳ {progress}</span>}
          {['draft','ready','paused'].includes(campaign.status) && <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => { if (window.confirm('Cancelar esta campanha?')) void changeStatus('cancel'); }}>Cancelar</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => void refreshDetail(campaign.id)}>Atualizar estados</button>
        </div>}
        {extension === 'missing' && <p className={styles.muted}>Para executar: instale a extensão em <code>extensions/bossa-whatsapp-web</code> pelo Chrome → Extensões → Modo do desenvolvedor → Carregar sem compactação, com a tela do CRM aberta.</p>}
        <p className={styles.muted}>“Observado” significa que a interface exibiu o conteúdo após o clique. Não significa entregue ou lido. Erros incertos exigem conferência humana.</p>
        <p className={styles.muted}>Cada execução processa até 25 corretores. Revise os resultados e execute o próximo lote quando estiver pronto.</p>
      </div></section>
      <section className="card"><div className="card-head"><h3>Destinatários e registro</h3></div><div className="card-body"><div className={styles.recipientList}>{recipients.map((row) => <div className={styles.recipientRow} key={row.id}>
        <div><strong>{row.lead_name}</strong><small>+{row.phone} · {row.stage} · etapa {row.next_item_index + 1}</small><p className={styles.preview}>{row.message_text}</p>{row.detail && <p className={styles.muted}>{row.detail}</p>}</div>
        <div className={styles.recipientActions}><span className={styles.pill}>{statusLabels[row.status]}</span>
          {canEdit && row.status === 'uncertain' && <><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void reconcile(row, 'sent')}>Conferi: enviado</button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void reconcile(row, 'skipped')}>Conferi: não enviado</button></>}
        </div>
      </div>)}</div></div></section>
    </>}
  </div>;
}
