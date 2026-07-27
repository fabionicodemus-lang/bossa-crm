'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function OnboardingForm({ suggestedName }: { suggestedName: string }) {
  const router = useRouter();
  const [name, setName] = useState(suggestedName || 'Bossa Empreendimentos');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc('create_workspace', { workspace_name: name });
    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }
    router.replace('/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <div className="field"><label>Nome da empresa</label><input className="input" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="info-box">Você será o administrador da empresa e poderá convidar os demais usuários depois.</div>
      {error && <div className="error-box">{error}</div>}
      <button className="btn btn-primary btn-block" disabled={loading}>{loading ? 'Criando ambiente…' : 'Criar ambiente do CRM'}</button>
    </form>
  );
}
