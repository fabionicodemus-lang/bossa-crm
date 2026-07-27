'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function LoginForm({ allowSignup }: { allowSignup: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message === 'Invalid login credentials' ? 'E-mail ou senha inválidos.' : authError.message);
      setLoading(false);
      return;
    }
    const requestedNext = params.get('next') || '/dashboard';
    const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/dashboard';
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <div className="field"><label>E-mail</label><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@bossaempreendimentos.com.br" /></div>
      <div className="field"><label>Senha</label><input className="input" type="password" autoComplete="current-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Sua senha" /></div>
      {error && <div className="error-box">{error}</div>}
      <button className="btn btn-primary btn-block" disabled={loading}>{loading ? 'Entrando…' : 'Entrar no Bossa CRM'}</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontSize: 12 }}>
        {allowSignup ? <Link className="link" href="/cadastro">Criar usuário</Link> : <span className="faint">Acesso somente por convite</span>}
        <Link className="link" href="/recuperar-senha">Esqueci minha senha</Link>
      </div>
    </form>
  );
}
