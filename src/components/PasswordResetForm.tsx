'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

function friendlyError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes('rate limit') || normalized.includes('too many requests')) {
    return 'O limite temporário de e-mails de autenticação foi atingido. Aguarde cerca de uma hora ou peça ao administrador do CRM para gerar um “Link de senha” na tela Usuários.';
  }
  return message;
}

export function PasswordResetForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/atualizar-senha`,
    });
    if (resetError) setError(friendlyError(resetError.message));
    else setSuccess('Enviamos um link para redefinir sua senha.');
    setLoading(false);
  }

  return (
    <form onSubmit={submit}>
      <div className="field"><label>E-mail do usuário</label><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}
      <button className="btn btn-primary btn-block" disabled={loading}>{loading ? 'Enviando…' : 'Enviar link de recuperação'}</button>
      <p style={{ textAlign: 'center', fontSize: 12, marginTop: 16 }}><Link className="link" href="/login">Voltar ao login</Link></p>
    </form>
  );
}
