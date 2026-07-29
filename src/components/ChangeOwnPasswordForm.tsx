'use client';

import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

function friendlyError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes('invalid login credentials')) return 'A senha atual está incorreta.';
  if (normalized.includes('same password')) return 'A nova senha precisa ser diferente da senha atual.';
  if (normalized.includes('password should be at least')) return 'A nova senha precisa ter pelo menos oito caracteres.';
  if (normalized.includes('session')) return 'Sua sessão expirou. Entre novamente no sistema e repita a alteração.';
  return message || 'Não foi possível alterar a senha.';
}

export function ChangeOwnPasswordForm({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');

    if (newPassword.length < 8) {
      setError('A nova senha precisa ter pelo menos oito caracteres.');
      return;
    }
    if (newPassword !== confirmation) {
      setError('A confirmação precisa ser igual à nova senha.');
      return;
    }
    if (currentPassword === newPassword) {
      setError('A nova senha precisa ser diferente da senha atual.');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      const { error: authenticationError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (authenticationError) throw authenticationError;

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setNotice('Senha alterada com sucesso. A mudança é imediata e não exige confirmação por e-mail.');
    } catch (cause) {
      setError(friendlyError(cause instanceof Error ? cause.message : 'Não foi possível alterar a senha.'));
    } finally {
      setLoading(false);
    }
  }

  return <form onSubmit={submit} className="card-body">
    <div className="info-box" style={{ marginTop: 0 }}>
      Confirme sua senha atual e escolha a nova senha. Nenhum link será enviado por e-mail.
    </div>
    <div className="field">
      <label>E-mail de acesso</label>
      <input className="input" value={email} readOnly style={{ background: 'var(--bg)' }} />
    </div>
    <div className="field">
      <label>Senha atual</label>
      <input className="input" type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
    </div>
    <div className="grid grid-2">
      <div className="field">
        <label>Nova senha</label>
        <input className="input" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
      </div>
      <div className="field">
        <label>Confirmar nova senha</label>
        <input className="input" type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
      </div>
    </div>
    <div className="faint" style={{ marginBottom: 14 }}>Use pelo menos oito caracteres. Uma combinação de letras, números e símbolos aumenta a segurança.</div>
    {error && <div className="error-box">{error}</div>}
    {notice && <div className="success-box">{notice}</div>}
    <button className="btn btn-primary" disabled={loading}>{loading ? 'Alterando senha…' : 'Alterar minha senha'}</button>
  </form>;
}
