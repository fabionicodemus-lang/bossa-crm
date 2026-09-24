'use client';

import { useCallback, useEffect, useState } from 'react';

type InitialConnection = {
  pageName: string | null;
  pageId: string | null;
  status: string | null;
  lastTestedAt: string | null;
  lastError: string | null;
};

type FacebookLoginResponse = {
  authResponse?: {
    accessToken?: string;
  };
};

type FacebookSdk = {
  init: (options: Record<string, unknown>) => void;
  login: (callback: (response: FacebookLoginResponse) => void, options: Record<string, unknown>) => void;
};

function fbWindow() {
  return window as unknown as { FB?: FacebookSdk; fbAsyncInit?: () => void };
}

export function MetaLeadAdsConnection({ initial }: { initial: InitialConnection }) {
  const [connection, setConnection] = useState(initial);
  const [sdkReady, setSdkReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const graphVersion = process.env.NEXT_PUBLIC_META_GRAPH_VERSION;

  const initializeFacebook = useCallback(() => {
    if (!appId || !graphVersion || !fbWindow().FB) return;
    fbWindow().FB?.init({
      appId,
      autoLogAppEvents: true,
      xfbml: false,
      version: graphVersion,
      cookie: true,
    });
    setSdkReady(true);
  }, [appId, graphVersion]);

  useEffect(() => {
    if (!appId || !graphVersion) return;
    const scriptId = 'facebook-jssdk';
    const markReady = () => initializeFacebook();
    fbWindow().fbAsyncInit = markReady;

    if (fbWindow().FB) {
      markReady();
      return;
    }

    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      document.body.appendChild(script);
    }
    script.addEventListener('load', markReady);
    return () => script?.removeEventListener('load', markReady);
  }, [appId, graphVersion, initializeFacebook]);

  async function sendToken(accessToken: string) {
    const response = await fetch('/api/meta/lead-ads/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken }),
    });
    const payload = await response.json().catch(() => ({})) as {
      error?: string;
      pageId?: string;
      pageName?: string;
      latestLeadReadable?: boolean;
      leadTestError?: string | null;
      status?: string;
    };
    if (!response.ok) throw new Error(payload.error || 'Não foi possível conectar o Meta Lead Ads.');

    setConnection({
      pageId: payload.pageId ?? null,
      pageName: payload.pageName ?? null,
      status: payload.status ?? 'connected',
      lastTestedAt: new Date().toISOString(),
      lastError: payload.leadTestError ?? null,
    });

    if (payload.latestLeadReadable) {
      setSuccess('Meta Lead Ads conectado. O CRM já conseguiu ler o lead de teste da Página da Bossa.');
    } else {
      setSuccess('Meta Lead Ads conectado. Agora recrie um lead na ferramenta de testes da Meta para validar a entrada completa.');
    }
  }

  function connect() {
    setError('');
    setSuccess('');

    if (!appId || !graphVersion) {
      setError('Configuração Meta incompleta no CRM.');
      return;
    }
    if (!fbWindow().FB || !sdkReady) {
      setError('O login da Meta ainda está carregando. Aguarde alguns segundos e tente novamente.');
      return;
    }

    setLoading(true);
    fbWindow().FB?.login((response) => {
      const accessToken = response.authResponse?.accessToken;
      if (!accessToken) {
        setLoading(false);
        setError('A autorização foi cancelada ou a Meta não devolveu o token.');
        return;
      }
      void sendToken(accessToken)
        .catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível conectar o Meta Lead Ads.'))
        .finally(() => setLoading(false));
    }, {
      scope: 'leads_retrieval,pages_show_list,pages_read_engagement,pages_manage_metadata',
      auth_type: 'rerequest',
      return_scopes: true,
    });
  }

  const connected = connection.status === 'connected';

  return <section className="card" style={{ marginTop: 14 }}>
    <div className="card-head">
      <h3>Meta Lead Ads · Formulários instantâneos</h3>
      <span className={`connection-pill ${connected ? '' : 'off'}`}>
        {connected ? 'Conectado' : 'Não conectado'}
      </span>
    </div>
    <div className="card-body">
      <p className="muted">
        Autoriza o Bossa CRM a buscar nome, telefone, e-mail e respostas dos leads enviados pelos formulários instantâneos da Página da Bossa.
      </p>

      {connected && <div className="info-list" style={{ marginBottom: 12 }}>
        <div className="info-row"><span>Página</span><strong>{connection.pageName || 'Bossa Empreendimentos'}</strong></div>
        <div className="info-row"><span>Page ID</span><strong>{connection.pageId || '—'}</strong></div>
        <div className="info-row"><span>Status</span><strong>Lead Ads autorizado</strong></div>
      </div>}

      <button className="btn btn-primary" type="button" onClick={connect} disabled={loading || !sdkReady}>
        <span style={{ fontWeight: 900 }}>f</span>{' '}
        {loading ? 'Autorizando…' : connected ? 'Reconectar Meta Lead Ads' : sdkReady ? 'Conectar Meta Lead Ads' : 'Carregando Facebook…'}
      </button>

      {connection.lastError && <div className="info-box" style={{ marginTop: 12 }}>
        A conexão foi salva, mas o último lead de teste ainda não pôde ser relido: {connection.lastError}
      </div>}
      {error && <div className="error-box" style={{ marginTop: 12 }}>{error}</div>}
      {success && <div className="success-box" style={{ marginTop: 12 }}>{success}</div>}
    </div>
  </section>;
}
