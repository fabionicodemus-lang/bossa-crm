'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

function safeNext(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';
}

function readableError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes('expired') || normalized.includes('invalid')) {
    return 'O link do convite é inválido ou expirou. Peça ao administrador para reenviar o convite.';
  }
  if (normalized.includes('code verifier')) {
    return 'Não foi possível validar este link neste navegador. Peça um novo convite e abra-o no mesmo navegador.';
  }
  return message || 'Não foi possível validar o link de acesso.';
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function finishAuthentication() {
      const url = new URL(window.location.href);
      const next = safeNext(url.searchParams.get('next'));
      const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
      const oauthError = hash.get('error_description') || url.searchParams.get('error_description');
      if (oauthError) throw new Error(oauthError);

      const supabase = createClient();
      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');
      const code = url.searchParams.get('code');
      const tokenHash = url.searchParams.get('token_hash');
      const type = url.searchParams.get('type') as EmailOtpType | null;

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) throw sessionError;
      } else if (tokenHash && type) {
        const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (verifyError) throw verifyError;
      } else if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
      } else {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!data.session) throw new Error('Auth session missing!');
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw userError ?? new Error('Auth session missing!');

      window.history.replaceState({}, document.title, url.pathname);
      if (!active) return;
      router.replace(next);
      router.refresh();
    }

    void finishAuthentication().catch((cause) => {
      if (!active) return;
      setError(readableError(cause instanceof Error ? cause.message : 'Não foi possível validar o link de acesso.'));
    });

    return () => { active = false; };
  }, [router]);

  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
    <section className="auth-card">
      <h2>{error ? 'Não foi possível abrir o convite' : 'Validando seu acesso'}</h2>
      <p className="intro">{error ? 'O acesso não foi concluído.' : 'Estamos confirmando o convite e preparando a definição da sua senha.'}</p>
      {error ? <>
        <div className="error-box">{error}</div>
        <button className="btn btn-primary btn-block" onClick={() => router.replace('/login')}>Voltar para o login</button>
      </> : <div className="info-box">Aguarde alguns segundos…</div>}
    </section>
  </main>;
}
