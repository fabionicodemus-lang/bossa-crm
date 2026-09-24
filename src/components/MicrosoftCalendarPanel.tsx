'use client';

import { useCallback, useEffect, useState } from 'react';

type Connection = { user_id: string; microsoft_email: string; last_synced_at: string | null; last_error: string | null };
type Status = { configured: boolean; own: Connection | null; team: Array<{ user_id: string; connected: boolean }> };
const messages: Record<string, string> = {
  connected: 'Conta conectada. Clique em Sincronizar agora para importar os compromissos do Outlook.',
  setup: 'A integração aguarda a configuração segura do aplicativo Microsoft 365 no servidor.',
  denied: 'A Microsoft não autorizou o acesso ao calendário. Verifique o consentimento do administrador.',
  invalid_state: 'Sessão de conexão expirada. Tente conectar novamente.',
  wrong_account: 'Entre com o mesmo endereço de e-mail cadastrado no BOSSA CRM.',
  error: 'Não foi possível concluir a conexão Microsoft. Confira o cadastro do aplicativo e tente novamente.',
  forbidden: 'Este perfil não tem permissão para conectar a agenda.',
};
export function MicrosoftCalendarPanel({ canEdit }: { canEdit: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(() => {
    if (typeof window === 'undefined') return '';
    const value = new URLSearchParams(window.location.search).get('microsoft');
    return value ? messages[value] ?? '' : '';
  });
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/microsoft/calendar', { cache: 'no-store' });
      const data = await response.json() as Status & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Falha ao consultar a conexão.');
      setStatus(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Erro ao consultar Microsoft.'); }
  }, []);
  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  async function sync() {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/microsoft/calendar', { method: 'POST' });
      const data = await response.json() as { imported?: number; updated?: number; skipped?: number; error?: string };
      if (!response.ok) throw new Error(data.error || 'Falha ao sincronizar.');
      setNotice(`Sincronização concluída: ${data.imported || 0} importados, ${data.updated || 0} atualizados${data.skipped ? `, ${data.skipped} não importados por conflito` : ''}.`);
      await load();
      window.dispatchEvent(new Event('bossa-agenda-synced'));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Erro ao sincronizar.'); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    if (!window.confirm('Desconectar sua conta Microsoft? Os eventos criados pelo CRM continuarão no Outlook.')) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/microsoft/calendar', { method: 'DELETE' });
      if (!response.ok) throw new Error('Falha ao desconectar.');
      await load(); setNotice('Conta desconectada. Os compromissos pessoais importados foram retirados do CRM.');
      window.dispatchEvent(new Event('bossa-agenda-synced'));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Erro.'); }
    finally { setBusy(false); }
  }
  return <section className="card" style={{ marginBottom: 16 }}>
    <div className="card-head"><h3>Microsoft 365 · Outlook</h3><span className="chip">Sincronização por usuário</span></div>
    <div className="card-body" style={{ display: 'grid', gap: 12 }}>
      {notice && <div className="info-box">{notice}</div>}
      {error && <div className="error-box">{error}</div>}
      {!status ? <div className="muted">Verificando conexão...</div> : !status.configured ?
        <div className="info-box">Aguardando configuração do aplicativo Microsoft Entra pelo administrador. Nenhuma conta é conectada sem autorização.</div>
      : status.own ? <>
        <div><strong>Conectado:</strong> {status.own.microsoft_email}
          <div className="muted" style={{ fontSize: 12 }}>Última sincronização: {status.own.last_synced_at ? new Date(status.own.last_synced_at).toLocaleString('pt-BR') : 'Ainda não executada'}.</div>
        </div>
        {status.own.last_error && <div className="error-box">Atenção: {status.own.last_error}</div>}
        {canEdit && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={busy} onClick={() => void sync()}>{busy ? 'Sincronizando...' : 'Sincronizar agora'}</button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => void disconnect()}>Desconectar</button>
        </div>}
      </> : canEdit ? <div>
        <p className="muted" style={{ marginBottom: 10 }}>Conecte seu e-mail corporativo Microsoft 365 para incluir os horários ocupados e sincronizar os novos compromissos.</p>
        <a className="btn btn-primary" href="/api/microsoft/connect">Conectar meu Outlook</a>
      </div> : <div className="muted">Peça ao administrador para habilitar sua integração.</div>}
      {status && <div className="muted" style={{ fontSize: 12 }}>
        {status.team.length} usuário(s) conectado(s). A IA verifica o Outlook do responsável em tempo real antes de reservar; cada usuário precisa conectar a própria conta.
      </div>}
    </div>
  </section>;
}
