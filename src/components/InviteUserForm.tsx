'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export function InviteUserForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('comercial');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    const response = await fetch('/api/users/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'Não foi possível convidar o usuário.');
    else {
      setSuccess(payload.message || 'Convite enviado.');
      setEmail('');
      router.refresh();
    }
    setLoading(false);
  }

  return <form onSubmit={submit} className="grid grid-3"><div className="field"><label>E-mail</label><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@bossaempreendimentos.com.br" /></div><div className="field"><label>Permissão</label><select className="select" value={role} onChange={(e) => setRole(e.target.value)}><option value="admin">Administrador</option><option value="comercial">Comercial</option><option value="viewer">Somente leitura</option></select></div><div style={{ alignSelf: 'end', marginBottom: 15 }}><button className="btn btn-primary btn-block" disabled={loading}>{loading ? 'Enviando…' : 'Convidar usuário'}</button></div>{error && <div className="error-box" style={{ gridColumn: '1 / -1' }}>{error}</div>}{success && <div className="success-box" style={{ gridColumn: '1 / -1' }}>{success}</div>}</form>;
}
