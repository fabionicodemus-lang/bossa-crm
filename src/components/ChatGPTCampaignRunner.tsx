'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { campaignRecipientSummary, type BrowserCampaignMedia, type BrowserRecipientStatus } from '@/lib/browser-campaigns';
import { chatGPTBatchLimit, validChatGPTCampaignId, type ChatGPTBatchLimit } from '@/lib/chatgpt-browser-campaign';
import styles from './ChatGPTCampaignRunner.module.css';

type Campaign = {
  id: string; name: string; status: string; sender_phone: string;
  recipient_count: number; media: BrowserCampaignMedia[];
};
type RecipientRow = { status: BrowserRecipientStatus };
type Claim = {
  recipient_id: string; lead_name: string; phone: string; message_text: string;
  next_item_index: number; item_count: number; media: BrowserCampaignMedia[];
};
type View = { campaign: Campaign; recipients: RecipientRow[]; senderBlocked: boolean };
type StoredSession = { workerId: string; claimedCount: number; activeRecipientId: string | null };

const API = '/api/transmissoes/navegador';
const MIN_REVIEW_DELAY_MS = 15000;

async function request<T>(url: string, payload?: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, payload ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  } : { cache: 'no-store' });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return data;
}

export function ChatGPTCampaignRunner({ canEdit }: { canEdit: boolean }) {
  const [campaignId, setCampaignId] = useState('');
  const [runId, setRunId] = useState('');
  const [limit, setLimit] = useState<ChatGPTBatchLimit>(2);
  const [view, setView] = useState<View | null>(null);
  const [current, setCurrent] = useState<Claim | null>(null);
  const [itemIndex, setItemIndex] = useState(0);
  const [claimedCount, setClaimedCount] = useState(0);
  const [reviewPending, setReviewPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const storageKey = useRef('');
  const sessionRef = useRef<StoredSession>({ workerId: '', claimedCount: 0, activeRecipientId: null });
  const requestInFlight = useRef(false);
  const reviewTimerRef = useRef<number | null>(null);

  const persistSession = useCallback((changes: Partial<StoredSession>) => {
    sessionRef.current = { ...sessionRef.current, ...changes };
    if (storageKey.current) sessionStorage.setItem(storageKey.current, JSON.stringify(sessionRef.current));
  }, []);

  const refresh = useCallback(async (id: string) => {
    const data = await request<View>(`${API}?campaign=${encodeURIComponent(id)}`);
    setView(data);
    return data;
  }, []);

  useEffect(() => {
    let active = true;
    // Ler parâmetros e sessionStorage após montar; evita reidratação divergente.
    void Promise.resolve().then(() => {
    if (!active) return;
    const query = new URLSearchParams(window.location.search);
    const id = query.get('campaign') ?? '';
    const run = query.get('run') ?? '';
    if (!validChatGPTCampaignId(id) || !validChatGPTCampaignId(run)) {
      setError('Este link de execução é inválido. Abra a campanha no CRM e clique em “Executar com ChatGPT”.');
      return;
    }
    const count = chatGPTBatchLimit(query.get('limit'));
    setCampaignId(id); setRunId(run); setLimit(count);
    const key = `bossa-chatgpt-run:${run}`;
    storageKey.current = key;
    const saved = sessionStorage.getItem(key);
    try {
      const parsed = saved ? JSON.parse(saved) as StoredSession : null;
      if (parsed && (!validChatGPTCampaignId(parsed.workerId)
        || !Number.isInteger(parsed.claimedCount) || parsed.claimedCount < 0 || parsed.claimedCount > count
        || (parsed.activeRecipientId !== null && !validChatGPTCampaignId(parsed.activeRecipientId))))
        throw new Error('Estado local inválido.');
      sessionRef.current = parsed ?? { workerId: crypto.randomUUID(), claimedCount: 0, activeRecipientId: null };
      sessionStorage.setItem(key, JSON.stringify(sessionRef.current));
      setClaimedCount(sessionRef.current.claimedCount);
      if (sessionRef.current.activeRecipientId) {
        setStopped(true);
        setError('Este lote foi interrompido com um contato reservado. Confira a conversa e resolva a pendência na tela principal antes de iniciar outro lote. Não reenvie.');
      }
    } catch {
      setStopped(true);
      setError('O estado desta execução não pode ser recuperado com segurança. Confira os envios no CRM antes de recomeçar.');
    }
    setReady(true);
    void refresh(id).catch((cause) => { setStopped(true); setError(cause instanceof Error ? cause.message : 'Falha ao abrir a campanha.'); });
    });
    return () => { active = false; if (reviewTimerRef.current !== null) window.clearTimeout(reviewTimerRef.current); };
  }, [refresh]);

  // A mesma sessão deve continuar viva durante inspeções longas do WhatsApp Web.
  useEffect(() => {
    if (!campaignId || !current || stopped) return;
    const timer = window.setInterval(() => {
      void request<{ active: boolean }>(`${API}/worker`, {
        action: 'heartbeat', campaignId, workerId: sessionRef.current.workerId,
        recipientId: current.recipient_id,
      }).then(({ active }) => {
        if (!active) {
          setStopped(true);
          setError('A reserva do contato perdeu validade. Pare, confira a conversa e resolva a pendência no CRM; não repita o envio.');
        }
      }).catch(() => {
        setStopped(true);
        setError('Não foi possível renovar a reserva do contato. Pare para conferência; não repita o envio.');
      });
    }, 20000);
    return () => window.clearInterval(timer);
  }, [campaignId, current, stopped]);

  const summary = campaignRecipientSummary(view?.recipients ?? []);
  const campaign = view?.campaign;
  const senderBlocked = view?.senderBlocked ?? false;
  const limitReached = claimedCount >= limit;
  const awaitingReview = reviewPending;
  const canClaim = canEdit && ready && !busy && !stopped && !senderBlocked && !!campaign
    && campaign.status === 'running' && !current && !limitReached && !awaitingReview;

  async function claimNext() {
    if (!canClaim || requestInFlight.current || !campaign) return;
    requestInFlight.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      // Antes de reservar, confirme o status e o bloqueio do remetente no servidor.
      const state = await refresh(campaign.id);
      if (state.campaign.status !== 'running' || state.senderBlocked)
        throw new Error('Campanha pausada ou remetente bloqueado para conferência.');
      const result = await request<{ recipient: Claim | null }>(`${API}/worker`, {
        action: 'claim', campaignId: campaign.id, workerId: sessionRef.current.workerId,
      });
      if (!result.recipient) {
        setNotice('Nenhum corretor disponível: fila encerrada ou o remetente está em uso. Confira os estados da campanha.');
        return;
      }
      const next = result.recipient;
      // Guardar a reserva antes de exibir o conteúdo: recarregar nunca deve repetir um envio incerto.
      persistSession({ activeRecipientId: next.recipient_id, claimedCount: sessionRef.current.claimedCount + 1 });
      setCurrent(next); setItemIndex(next.next_item_index); setClaimedCount(sessionRef.current.claimedCount);
    } catch (cause) {
      setStopped(true);
      setError(cause instanceof Error ? cause.message : 'Falha ao reservar contato. Confira a campanha.');
    } finally { setBusy(false); requestInFlight.current = false; }
  }

  async function ack(result: 'observed' | 'uncertain') {
    if (!current || !campaign || busy || stopped || requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true); setError(''); setNotice('');
    const step = itemIndex === 0 ? 'texto' : `PDF ${itemIndex}`;
    try {
      const answer = await request<{ status: string }>(`${API}/worker`, {
        action: 'ack', campaignId: campaign.id, workerId: sessionRef.current.workerId,
        recipientId: current.recipient_id, itemIndex,
        result, detail: result === 'observed'
          ? `${step} de ${current.lead_name} observado na conversa correspondente via ChatGPT Chrome.`
          : `Execução ChatGPT interrompida em ${step}; conferir a conversa antes de liberar o remetente.`,
      });
      if (result === 'uncertain' || answer.status === 'uncertain') {
        persistSession({ activeRecipientId: null });
        setCurrent(null); setStopped(true);
        setError('Envio marcado como “Conferir”. A execução foi interrompida. Resolva na campanha principal antes de qualquer novo contato.');
      } else if (answer.status === 'claimed' && itemIndex + 1 < current.item_count) {
        setItemIndex(itemIndex + 1);
        setNotice(`Etapa ${itemIndex + 1}/${current.item_count} registrada. Prossiga com a próxima etapa para o MESMO corretor.`);
      } else if (answer.status === 'sent') {
        persistSession({ activeRecipientId: null });
        setCurrent(null); setItemIndex(0);
        setReviewPending(true);
        if (reviewTimerRef.current !== null) window.clearTimeout(reviewTimerRef.current);
        reviewTimerRef.current = window.setTimeout(() => setReviewPending(false), MIN_REVIEW_DELAY_MS);
        setNotice(`Etapas de ${current.lead_name} observadas. ${sessionRef.current.claimedCount} de ${limit} contato(s) neste lote. Revise antes de continuar.`);
      } else {
        throw new Error('Estado inesperado na fila. O resultado precisa ser conferido antes de prosseguir.');
      }
      await refresh(campaign.id);
    } catch (cause) {
      // Sem repetir um ACK incerto: o servidor pode tê-lo processado.
      setStopped(true);
      setError(cause instanceof Error ? cause.message : 'Falha ao registrar a etapa. Confira a conversa e o CRM antes de continuar.');
    } finally { setBusy(false); requestInFlight.current = false; }
  }

  const currentFile = current && itemIndex > 0 ? current.media[itemIndex - 1] : null;
  const fileUrl = `${API}/arquivo?campaign=${encodeURIComponent(campaignId)}&index=${itemIndex - 1}`;
  const whatsappUrl = current && /^\d{8,15}$/.test(current.phone)
    ? `https://web.whatsapp.com/send?phone=${current.phone}` : null;

  return <div className="page-content">
    <section className={`card ${styles.mainCard}`}>
      <div className="card-head"><h3>Execução acompanhada pelo ChatGPT</h3><span className={styles.pill}>Lote: {claimedCount}/{limit}</span></div>
      <div className="card-body">
        <p className={styles.explainer}>Esta tela fornece ao ChatGPT um corretor por vez, sem revelar toda a lista. O ChatGPT usa a extensão oficial no Chrome para operar o WhatsApp Web e volta aqui para registrar o que <strong>observou na tela</strong>. Isso não comprova entrega ou leitura.</p>
        <div className={styles.campaignInfo}>
          <div><span>Campanha</span><strong>{campaign?.name ?? 'Carregando...'}</strong></div>
          <div><span>Remetente autorizado</span><strong>+{campaign?.sender_phone ?? '—'}</strong></div>
          <div><span>Fila</span><strong>{summary.queued} pendente(s) · {summary.sent} observado(s) · {summary.uncertain} conferir</strong></div>
        </div>
        <div className={styles.actions}>
          <a className="btn btn-secondary btn-sm" href="/transmissoes/navegador">← Voltar às transmissões</a>
          {campaignId && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void refresh(campaignId).catch((cause) => setError(String(cause)))}>Atualizar registro</button>}
        </div>
        {!canEdit && <div className="error-box">Este usuário não tem permissão para operar transmissões.</div>}
        {senderBlocked && <div className="error-box">Remetente bloqueado até conferência na campanha original. Não envie mensagens.</div>}
        {error && <div className="error-box" role="alert">{error}</div>}
        {notice && <div className="info-box" role="status">{notice}</div>}
        {runId && <p className={styles.runId}>Sessão {runId.slice(0, 8)} · somente contatos autorizados · sem repetição automática</p>}
      </div>
    </section>

    {!current && <section className="card"><div className="card-head"><h3>{limitReached ? 'Lote encerrado' : 'Próximo corretor'}</h3></div><div className="card-body">
      {limitReached ? <p>Você chegou ao limite de {limit} destinatário(s) nesta execução. Confira os registros e só abra outro lote mediante nova autorização.</p>
        : stopped ? <p>Esta execução está parada para conferência. Não reabra a conversa nem repita o envio automaticamente.</p>
          : awaitingReview ? <p>Intervalo de revisão operacional: aguarde ao menos 15 segundos entre os contatos, confira os estados e clique em “Reservar próximo corretor”.</p>
            : <p>Reserve somente um corretor. Antes do primeiro clique de envio, confirme que o número conectado no WhatsApp é o remetente autorizado.</p>}
      <button className="btn btn-primary" disabled={!canClaim} onClick={() => void claimNext()}>{busy ? 'Verificando a fila...' : 'Reservar próximo corretor'}</button>
    </div></section>}

    {current && <section className="card"><div className="card-head"><h3>Corretor {claimedCount} de {limit}</h3><span className={styles.pill}>Etapa {itemIndex + 1} de {current.item_count}</span></div><div className="card-body">
      <div className={styles.recipientHeader}>
        <div><span>Contato autorizado</span><h2>{current.lead_name}</h2><strong>+{current.phone}</strong></div>
        {whatsappUrl && <a className="btn btn-secondary" href={whatsappUrl} target="_blank" rel="noopener noreferrer">Abrir conversa no WhatsApp Web ↗</a>}
      </div>
      <div className={styles.warning}><strong>Confira antes de enviar:</strong> remetente +{campaign?.sender_phone}, conversa individual do telefone +{current.phone}, nenhum grupo, nenhum texto duplicado. Se não conseguir confirmar, pare.</div>
      {itemIndex === 0 ? <div className={styles.stage}>
        <h3>1. Mensagem de texto aprovada</h3>
        <p>Copie ou transcreva exatamente este texto, incluindo o primeiro nome já personalizado:</p>
        <pre className={styles.message}>{current.message_text}</pre>
        <button className="btn btn-secondary btn-sm" disabled={stopped} onClick={() => void navigator.clipboard.writeText(current.message_text).then(() => setNotice('Texto copiado.')).catch(() => setError('Copie o texto diretamente da caixa.'))}>Copiar mensagem aprovada</button>
      </div> : <div className={styles.stage}>
        <h3>{itemIndex + 1}. Documento PDF aprovado</h3>
        {currentFile ? <><div className={styles.file}><strong>📄 {currentFile.filename}</strong><span>{(currentFile.size / 1048576).toFixed(2)} MB · anexe como Documento</span></div>
          <a className="btn btn-secondary btn-sm" href={fileUrl} download={currentFile.filename}>Baixar PDF verificado para anexar</a>
          <p>O arquivo vem do armazenamento privado da campanha. No WhatsApp Web, anexe como <strong>Documento</strong>, envie uma única vez e confirme o nome na mensagem de saída. Se o Chrome impedir o anexo, verifique a opção <strong>Permitir acesso a URLs de arquivo</strong> nos detalhes da extensão oficial do ChatGPT; não tente repetir um envio incerto.</p></>
          : <div className="error-box">Anexo não encontrado. Pare para conferência.</div>}
      </div>}
      <div className={styles.actions}>
        <button className="btn btn-primary" disabled={busy || stopped || (itemIndex > 0 && !currentFile)} onClick={() => void ack('observed')}>
          {busy ? 'Registrando...' : itemIndex === 0 ? 'Confirmar texto observado' : 'Confirmar PDF observado'}
        </button>
        <button className="btn btn-danger" disabled={busy || stopped} onClick={() => void ack('uncertain')}>Parar e marcar para conferir</button>
      </div>
      <p className={styles.confirmHint}>Confirme apenas se a mensagem NOVA estiver visível como enviada na conversa correta. Caso tenha ficado dúvida ou o WhatsApp tenha travado, clique em “Parar e marcar para conferir”.</p>
    </div></section>}
  </div>;
}
