'use client';

import { useEffect, useRef, useState } from 'react';
import type { RecoveryKind, RecoveryView } from '@/lib/commercial/recovery';

/** No automatic retry: checking an uncertain command must not perform a write. */
export function CommercialSaveRecovery({ kind, busy }: { kind: RecoveryKind; busy: boolean }) {
  const [pending, setPending] = useState<RecoveryView | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [working, setWorking] = useState(false);
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (lock.current || busy) return;
      const ticket = ++generation.current;
      void fetch(`/api/commercial/recovery?type=${kind}`, { cache: 'no-store' })
        .then(async (result) => {
          const body = await result.json();
          if (!result.ok) throw new Error(body.error || 'Recuperação indisponível.');
          if (active && ticket === generation.current && !lock.current) { setPending(body.request); setError(''); setConfirmed(false); }
        }).catch((cause) => { if (active && ticket === generation.current) setError(cause instanceof Error ? cause.message : 'Recuperação indisponível.'); });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, [kind, busy, revision]);
  async function act(action: 'retry' | 'acknowledge' | 'abandon') {
    if (!pending || !confirmed || lock.current || busy) return;
    lock.current = true; generation.current++; setWorking(true); setError(''); setNotice('');
    try {
      const result = await fetch('/api/commercial/recovery', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: pending.requestId, action, confirmed: true }) });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error || 'Resposta incerta; confira novamente a tentativa.');
      const next = body.request as RecoveryView;
      if (!next || next.requestId !== pending.requestId) throw new Error('Resposta não confirmada. Confira novamente.');
      setPending(next); setConfirmed(false);
      if (['acknowledged', 'abandoned'].includes(next.state)) {
        // Explicit finish navigates to a fresh list; it cannot create another record.
        window.location.assign(kind === 'proposals' ? '/propostas' : '/agenda');
      } else setNotice(body.warning || (action === 'abandon'
        ? 'A gravação já foi confirmada. Nada foi apagado; confira o registro e conclua a revisão.'
        : 'Estado atualizado. Confira o registro antes de concluir a revisão.'));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar.'); }
    finally { lock.current = false; setWorking(false); }
  }
  if (!pending && !error) return null;
  const committed = pending && ['committed', 'committed_unavailable'].includes(pending.state);
  return <section className="card card-body" style={{ marginBottom: 16 }} aria-label="Recuperação de salvamento">
    <h3>Conferir salvamento anterior</h3>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {pending && <>
      <p>{pending.summary}</p>
      <p>Iniciado em {new Date(pending.createdAt).toLocaleString('pt-BR')} · referência {pending.requestId}.</p>
      <p>{committed ? 'A gravação foi confirmada no CRM.' : 'Ainda não há confirmação. Isso não prova que o pedido falhou: ele pode estar em andamento.'}</p>
      {pending.recordId && <p>{pending.recordLabel} · {pending.kind === 'proposals'
        ? <a href={`/api/propostas/${pending.recordId}/pdf`} target="_blank" rel="noopener noreferrer">Conferir PDF atual</a>
        : <a href="/agenda" target="_blank" rel="noopener noreferrer">Conferir agenda em outra aba</a>}</p>}
      {pending.state === 'committed_unavailable' && <p role="alert">O recibo existe, mas o registro está removido ou sem acesso. Não será criado outro automaticamente.</p>}
      <p>A tentativa fica no servidor para o seu usuário, inclusive após recarregar ou trocar de dispositivo. Nenhum reenvio é automático.</p>
      <label><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={working || busy} /> Conferi o resumo e autorizo a ação escolhida abaixo.</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <button type="button" className="btn btn-ghost" disabled={working || busy} onClick={() => setRevision((v) => v + 1)}>Conferir novamente</button>
        {pending.state === 'pending' && <>
          <button type="button" className="btn btn-primary" disabled={!confirmed || working || busy} onClick={() => void act('retry')}>Retomar exatamente esta tentativa</button>
          <button type="button" className="btn btn-ghost" disabled={!confirmed || working || busy} onClick={() => void act('abandon')}>Abandonar tentativa não confirmada</button>
        </>}
        {committed && <button type="button" className="btn btn-primary" disabled={!confirmed || working || busy} onClick={() => void act('acknowledge')}>Conferi; concluir revisão</button>}
      </div>
      <small>Abandonar não apaga uma gravação concluída. Uma tentativa abandonada não poderá ser executada depois. No Outlook, conferir o convite continua sendo necessário.</small>
    </>}
    {!pending && error && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setRevision((v) => v + 1)}>Tentar conferir novamente</button>}
  </section>;
}
