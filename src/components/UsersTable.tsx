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
  const [loadingId, setLoadingId] = useState('');

  async function changeRole(id: string, role: MembershipItem['role']) {
    setLoadingId(id);
    setError('');
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
    const response = await fetch('/api/users/membership', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ membershipId: id }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'Não foi possível remover o usuário.');
    else {
      setItems((current) => current.filter((item) => item.id !== id));
      router.refresh();
    }
    setLoadingId('');
  }

  return <>{error && <div className="error-box" style={{ margin: 14 }}>{error}</div>}<div className="table-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Permissão</th><th>Desde</th><th></th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.profiles?.full_name || 'Usuário'}</strong>{item.user_id === currentUserId && <span className="chip chip-green" style={{ marginLeft: 7 }}>Você</span>}</td><td>{item.profiles?.email || '—'}</td><td><select className="select" style={{ width: 150, padding: '7px 9px' }} value={item.role} disabled={loadingId === item.id} onChange={(event) => void changeRole(item.id, event.target.value as MembershipItem['role'])}><option value="admin">Administrador</option><option value="comercial">Comercial</option><option value="viewer">Somente leitura</option></select></td><td>{formatDateTime(item.created_at)}</td><td style={{ textAlign: 'right' }}>{item.user_id !== currentUserId && <button className="btn btn-ghost btn-sm" disabled={loadingId === item.id} onClick={() => void remove(item.id)}>Remover</button>}</td></tr>)}</tbody></table></div></>;
}
