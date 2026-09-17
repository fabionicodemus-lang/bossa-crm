'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function ChangeOwnNameForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    const cleaned = name.trim().replace(/\s+/g, ' ');
    if (cleaned.length < 2 || cleaned.length > 100) {
      setError('O nome deve ter entre 2 e 100 caracteres.');
      return;
    }
    if (cleaned === savedName) {
      setNotice('Seu nome já está atualizado.');
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error('Sua sessão expirou. Entre novamente no sistema.');

      // A política RLS profiles_update_self permite alterar somente o próprio cadastro.
      const { data: profile, error: updateError } = await supabase
        .from('profiles')
        .update({ full_name: cleaned })
        .eq('id', user.id)
        .select('full_name')
        .single();
      if (updateError || !profile) throw new Error(updateError?.message || 'Não foi possível localizar seu perfil.');

      setName(profile.full_name);
      setSavedName(profile.full_name);
      setNotice('Nome atualizado com sucesso. A alteração aparecerá no menu e nas telas do CRM.');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar seu nome.');
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={(event) => void submit(event)} className="card-body">
    <div className="field">
      <label htmlFor="my-account-full-name">Nome do usuário</label>
      <input
        id="my-account-full-name"
        className="input"
        type="text"
        autoComplete="name"
        value={name}
        minLength={2}
        maxLength={100}
        required
        disabled={saving}
        onChange={(event) => { setName(event.target.value); setError(''); setNotice(''); }}
        placeholder="Seu nome completo"
      />
      <small className="faint">Altere o nome exibido no CRM. Seu e-mail de acesso e sua senha não serão modificados.</small>
    </div>
    {error && <div className="error-box" role="alert">{error}</div>}
    {notice && <div className="success-box" role="status">{notice}</div>}
    <button className="btn btn-primary" type="submit" disabled={saving || !name.trim() || name.trim().replace(/\s+/g, ' ') === savedName}>
      {saving ? 'Salvando…' : 'Salvar nome'}
    </button>
  </form>;
}
