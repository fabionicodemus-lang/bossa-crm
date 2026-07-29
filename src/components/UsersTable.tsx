'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDateTime } from '@/lib/format';

export interface MembershipItem {
  id: string;
  user_id: string;
  role: 'admin' | 'comercial' | 'viewer';
  created_at: string;
  profiles: { full_name: string; email: string } | null;
}

export function UsersTable({ initialItems, currentUserId }: { initialItems: MembershipItem[]; currentUserId: string }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loadingId, setLoadingId] = useState('');
  const [passwordLink, setPasswordLink] = useState('');
  const [linkUserName, setLinkUserName] = useState('');

  async function changeRole(id: string, role: MembershipItem['role']) {
    setLoadingId(id);
    setError('');
    setNotice('');
    const response = await fetch('/api/users/membership', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ membershipId: id, role }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'Não foi possível alterar a permissão.');
    else {
      setItems((current) => current.map((item) => item.id === id ? { ...item, role } : item));
      router.refresh();
    }
    setLoadingId('');
  }

  async function remove(id: string) {
    if (!window.confirm('Remover o acesso deste usuário à empresa?')) return;
    setLoadingId(id);
    setError('');
    setNotice('');
    const response = await fetch('/api/users/membership', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ membershipId: id }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'Não foi possível remover o usuário.');
    else {
      setItems((current) => current.filter((item) => item.id !== id));
      router.refresh();
    }
    setLoadingId('');
  }

  async function generatePasswordLink(item: MembershipItem) {
    const email = item.profiles?.email;
    if (!email) {
      setError('Este usuário não possui e-mail cadastrado.');
      return;
    }
    setLoadingId(item.id);
    setError('');
    setNotice('');
    const response = await fetch('/api/users/password-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string; link?: string };
    if (!response.ok || !payload.link) {
      setError(payload.error || 'Não foi possível gerar o link de senha.');
    } else {
      setPasswordLink(payload.link);
      setLinkUserName(item.profiles?.full_name || email);
    }
    setLoadingId('');
  }

  async function copyPasswordLink() {
    try {
      await navigator.clipboard.writeText(passwordLink);
      setNotice('Link copiado. Envie diretamente para o usuário pelo WhatsApp ou e-mail.');
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione o link e copie manualmente.');
    }
  }

  function closeLink() {
    setPasswordLink('');
    setLinkUserName('');
  }

  return <>
    {error && <div className="error-box" style={{ margin: 14 }}>{error}</div>}
    {notice && <div className="success-box" style={{ margin: 14 }}>{notice}</div>}
    <div className="table-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Permissão</th><th>Desde</th><th></th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.profiles?.full_name || 'Usuário'}</strong>{item.user_id === currentUserId && <span className="chip chip-green" style={{ marginLeft: 7 }}>Você</span>}</td><td>{item.profiles?.email || '—'}</td><td><select className="select" style={{ width: 150, padding: '7px 9px' }} value={item.role} disabled={loadingId === item.id} onChange={(event) => void changeRole(item.id, event.target.value as MembershipItem['role'])}><option value="admin">Administrador</option><option value="comercial">Comercial</option><option value="viewer">Somente leitura</option></select></td><td>{formatDateTime(item.created_at)}</td><td style={{ textAlign: 'right' }}><div className="page-actions" style={{ justifyContent: 'flex-end' }}><button className="btn btn-ghost btn-sm" disabled={loadingId === item.id || !item.profiles?.email} onClick={() => void generatePasswordLink(item)}>{loadingId === item.id ? 'Gerando…' : '🔗 Link de senha'}</button>{item.user_id !== currentUserId && <button className="btn btn-ghost btn-sm" disabled={loadingId === item.id} onClick={() => void remove(item.id)}>Remover</button>}</div></td></tr>)}</tbody></table></div>

    {passwordLink && <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(43,38,34,.48)', display: 'grid', placeItems: 'center', padding: 20 }} onMouseDown={(event) => { if (event.target === event.currentTarget) closeLink(); }}>
      <section className="card" style={{ width: 'min(680px, 100%)', boxShadow: '0 18px 60px rgba(0,0,0,.24)' }}>
        <div className="card-head"><h3>Link seguro de definição de senha</h3><button type="button" className="btn btn-ghost btn-sm" onClick={closeLink}>Fechar</button></div>
        <div className="card-body">
          <div className="info-box" style={{ marginTop: 0 }}>Envie este link somente para <strong>{linkUserName}</strong>. Ele permite definir uma nova senha e deve ser tratado como informação confidencial.</div>
          <div className="field"><label>Link de acesso</label><textarea className="textarea" readOnly value={passwordLink} style={{ minHeight: 115, fontFamily: 'monospace', fontSize: 12 }} onFocus={(event) => event.currentTarget.select()} /></div>
          <div className="page-actions" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn btn-primary" onClick={() => void copyPasswordLink()}>Copiar link</button></div>
        </div>
      </section>
    </div>}
  </>;
}
