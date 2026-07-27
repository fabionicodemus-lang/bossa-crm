'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmation) {
      setError('As duas senhas precisam ser iguais.');
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }
    router.replace('/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <div className="field"><label>Nova senha</label><input className="input" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <div className="field"><label>Confirmar nova senha</label><input className="input" type="password" minLength={8} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></div>
      {error && <div className="error-box">{error}</div>}
      <button className="btn btn-primary btn-block" disabled={loading}>{loading ? 'Salvando…' : 'Salvar nova senha'}</button>
    </form>
  );
}
