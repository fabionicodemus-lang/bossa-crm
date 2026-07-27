'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (password !== confirmation) {
      setError('As duas senhas precisam ser iguais.');
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const origin = window.location.origin;
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      router.replace('/onboarding');
      router.refresh();
      return;
    }

    setSuccess('Cadastro criado. Confirme o e-mail recebido e depois entre no CRM.');
    setLoading(false);
  }

  return (
    <form onSubmit={submit}>
      <div className="field"><label>Nome completo</label><input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Fábio Nicodemus" /></div>
      <div className="field"><label>E-mail</label><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@bossaempreendimentos.com.br" /></div>
      <div className="field"><label>Senha</label><input className="input" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo de 8 caracteres" /></div>
      <div className="field"><label>Confirmar senha</label><input className="input" type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></div>
      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}
      <button className="btn btn-primary btn-block" disabled={loading}>{loading ? 'Criando…' : 'Criar meu acesso'}</button>
      <p style={{ textAlign: 'center', fontSize: 12, marginTop: 16 }}>Já possui usuário? <Link className="link" href="/login">Entrar</Link></p>
    </form>
  );
}
