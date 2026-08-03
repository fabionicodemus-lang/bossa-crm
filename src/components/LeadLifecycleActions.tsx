'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import type { AppRole, LeadKind } from '@/lib/types';

type DialogMode = 'archive' | 'delete' | null;

function normalizedName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

export function LeadLifecycleActions({
  leadId,
  leadName,
  leadKind,
  role,
  archivedAt,
}: {
  leadId: string;
  leadName: string;
  leadKind: LeadKind;
  role: AppRole;
  archivedAt: string | null;
}) {
  const router = useRouter();
  const confirmInputRef = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [reason, setReason] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canEdit = role === 'admin' || role === 'comercial';
  const canDelete = role === 'admin';
  const returnPath = leadKind === 'cliente' ? '/clientes' : '/corretores';
  const portalTarget = typeof document === 'undefined' ? null : document.body;

  useEffect(() => {
    if (dialog !== 'delete') return;
    const frame = window.requestAnimationFrame(() => confirmInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [dialog]);

  async function request(url: string, method: string, body: unknown) {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a ação.');
    return payload;
  }

  async function archiveLead() {
    setLoading(true);
    setError('');
    try {
      await request(`/api/leads/${leadId}/lifecycle`, 'PATCH', { action: 'archive', reason });
      router.push('/arquivados');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível arquivar o lead.');
      setLoading(false);
    }
  }

  async function restoreLead() {
    setLoading(true);
    setError('');
    try {
      await request(`/api/leads/${leadId}/lifecycle`, 'PATCH', { action: 'restore' });
      router.push(returnPath);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível restaurar o lead.');
      setLoading(false);
    }
  }

  async function deleteLead() {
    setLoading(true);
    setError('');
    try {
      await request(`/api/leads/${leadId}/lifecycle`, 'DELETE', { confirmName });
      router.push(returnPath);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível excluir o lead.');
      setLoading(false);
    }
  }

  function closeDialog() {
    if (loading) return;
    setDialog(null);
    setReason('');
    setConfirmName('');
    setError('');
  }

  const nameConfirmed = normalizedName(confirmName) === normalizedName(leadName);

  const dialogContent = dialog ? <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="lead-lifecycle-dialog-title"
    style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(43,38,34,.48)', display: 'grid', placeItems: 'center', padding: 20, pointerEvents: 'auto' }}
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeDialog();
    }}
    onKeyDown={(event) => {
      if (event.key === 'Escape') closeDialog();
    }}
  >
    <section
      className="card"
      style={{ width: 'min(520px, 100%)', boxShadow: '0 18px 60px rgba(0,0,0,.24)', pointerEvents: 'auto' }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="card-head">
        <h3 id="lead-lifecycle-dialog-title">{dialog === 'archive' ? 'Arquivar lead' : 'Excluir lead permanentemente'}</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={closeDialog}>Fechar</button>
      </div>
      <div className="card-body">
        {dialog === 'archive' ? <>
          <div className="info-box" style={{ marginTop: 0 }}>O lead <strong>{leadName}</strong> sairá das pipelines ativas. O histórico, as mensagens e as propostas serão preservados, e o contato poderá ser restaurado.</div>
          <div className="field"><label htmlFor="archive-reason">Motivo do arquivamento</label><textarea id="archive-reason" className="textarea" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: lead de teste, cadastro duplicado ou contato sem interesse." /></div>
          {error && <div className="error-box">{error}</div>}
          <div className="page-actions" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn btn-ghost" onClick={closeDialog}>Cancelar</button><button type="button" className="btn btn-primary" disabled={loading} onClick={() => void archiveLead()}>{loading ? 'Arquivando…' : 'Confirmar arquivamento'}</button></div>
        </> : <>
          <div className="error-box" style={{ marginTop: 0 }}><strong>Ação irreversível.</strong><br />Mensagens, tarefas e histórico vinculados ao lead serão apagados. Propostas existentes serão preservadas, mas perderão o vínculo com o contato.</div>
          <div className="field">
            <label htmlFor="delete-lead-confirmation">Digite exatamente o nome para confirmar</label>
            <div className="faint" style={{ marginBottom: 7 }}>{leadName}</div>
            <input
              ref={confirmInputRef}
              id="delete-lead-confirmation"
              name="deleteLeadConfirmation"
              type="text"
              className="input"
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
              autoComplete="off"
              autoFocus
              disabled={loading}
            />
          </div>
          {error && <div className="error-box">{error}</div>}
          <div className="page-actions" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn btn-ghost" onClick={closeDialog}>Cancelar</button><button type="button" className="btn btn-danger" disabled={loading || !nameConfirmed} onClick={() => void deleteLead()}>{loading ? 'Excluindo…' : 'Excluir permanentemente'}</button></div>
        </>}
      </div>
    </section>
  </div> : null;

  return <>
    {canEdit && archivedAt && <button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => void restoreLead()}>↩ Restaurar lead</button>}
    {canEdit && !archivedAt && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog('archive')}>🗄️ Arquivar</button>}
    {canDelete && <button type="button" className="btn btn-danger btn-sm" onClick={() => setDialog('delete')}>🗑️ Excluir</button>}
    {portalTarget && dialogContent ? createPortal(dialogContent, portalTarget) : null}
  </>;
}
