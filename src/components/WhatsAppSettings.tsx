'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Channel = 'clientes' | 'corretores';
export interface Connection {
  id: string;
  channel: Channel;
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  status: string;
  connected_at: string;
}

type FacebookLoginResponse = { authResponse?: { code?: string } };
type FacebookSdk = {
  init: (options: Record<string, unknown>) => void;
  login: (callback: (response: FacebookLoginResponse) => void, options: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

export function WhatsAppSettings({ initialConnections }: { initialConnections: Connection[] }) {
  const router = useRouter();
  const [connections, setConnections] = useState(initialConnections);
  const [selected, setSelected] = useState<Channel>('clientes');
  const [sdkReady, setSdkReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const codeRef = useRef<string | null>(null);
  const signupRef = useRef<{ wabaId: string; phoneNumberId: string; businessId?: string } | null>(null);
  const channelRef = useRef<Channel>('clientes');
  const initializedRef = useRef(false);
  const connectingRef = useRef(false);
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;
  const graphVersion = process.env.NEXT_PUBLIC_META_GRAPH_VERSION;

  const initializeFacebook = useCallback(() => {
    if (!appId || !graphVersion || !window.FB) return;
    if (!initializedRef.current) {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: graphVersion });
      initializedRef.current = true;
    }
    setSdkReady(true);
    setError((current) => current.includes('Facebook ainda está carregando') ? '' : current);
  }, [appId, graphVersion]);

  const finishConnection = useCallback(async () => {
    if (!codeRef.current || !signupRef.current || connectingRef.current) return;
    connectingRef.current = true;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/meta/whatsapp/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelRef.current, code: codeRef.current, ...signupRef.current }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; connection?: Connection };
      if (!response.ok || !payload.connection) {
        setError(payload.error || 'Não foi possível concluir a conexão.');
        return;
      }
      setSuccess('WhatsApp conectado em modo de coexistência. O aplicativo continua funcionando no celular.');
      setConnections((current) => [...current.filter((item) => item.channel !== channelRef.current), payload.connection as Connection]);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível concluir a conexão.');
    } finally {
      codeRef.current = null;
      signupRef.current = null;
      connectingRef.current = false;
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (!['https://www.facebook.com', 'https://web.facebook.com'].includes(event.origin)) return;
      let payload: unknown = event.data;
      try { if (typeof payload === 'string') payload = JSON.parse(payload); } catch { return; }
      const data = payload as { type?: string; event?: string; data?: { waba_id?: string; phone_number_id?: string; business_id?: string } };
      if (data.type === 'WA_EMBEDDED_SIGNUP' && data.event === 'FINISH' && data.data?.waba_id && data.data.phone_number_id) {
        signupRef.current = { wabaId: data.data.waba_id, phoneNumberId: data.data.phone_number_id, businessId: data.data.business_id };
        void finishConnection();
      }
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [finishConnection]);

  useEffect(() => {
    if (!appId || !graphVersion) return;

    let active = true;
    const scriptId = 'facebook-jssdk';
    const scriptUrl = 'https://connect.facebook.net/pt_BR/sdk.js';

    const markReady = () => {
      if (!active) return;
      initializeFacebook();
    };
    const markError = () => {
      if (!active) return;
      setSdkReady(false);
      setError('O navegador bloqueou o SDK da Meta. Libere connect.facebook.net, desative o bloqueador de anúncios para este site e atualize a página.');
    };

    window.fbAsyncInit = markReady;

    if (window.FB) {
      markReady();
    } else {
      let script = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.src = scriptUrl;
        script.async = true;
        script.defer = true;
        script.crossOrigin = 'anonymous';
        document.body.appendChild(script);
      }
      script.addEventListener('load', markReady);
      script.addEventListener('error', markError);
    }

    const timeout = window.setTimeout(() => {
      if (active && !window.FB) markError();
    }, 15000);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      const script = document.getElementById(scriptId);
      script?.removeEventListener('load', markReady);
      script?.removeEventListener('error', markError);
      if (window.fbAsyncInit === markReady) window.fbAsyncInit = undefined;
    };
  }, [appId, graphVersion, initializeFacebook]);

  function connect(channel: Channel) {
    channelRef.current = channel;
    setSelected(channel);
    setError('');
    setSuccess('');
    if (!appId || !configId || !graphVersion) {
      setError('Configure NEXT_PUBLIC_META_APP_ID, NEXT_PUBLIC_META_CONFIG_ID e NEXT_PUBLIC_META_GRAPH_VERSION na Vercel antes de conectar.');
      return;
    }
    if (!window.FB || !sdkReady) {
      setError('O login do Facebook ainda está carregando. Aguarde alguns segundos. Se continuar, libere connect.facebook.net e desative o bloqueador de anúncios para este site.');
      return;
    }
    window.FB.login((response) => {
      const code = response.authResponse?.code;
      if (!code) {
        setError('A conexão foi cancelada ou a Meta não devolveu o código temporário.');
        return;
      }
      codeRef.current = code;
      void finishConnection();
    }, {
      config_id: configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: 'whatsapp_business_app_onboarding',
        sessionInfoVersion: '3',
      },
    });
  }

  function connection(channel: Channel) {
    return connections.find((item) => item.channel === channel && item.status === 'connected');
  }

  return <>
    <div className="info-box" style={{ marginBottom: 14 }}>
      <strong>Modo de coexistência.</strong> Os números continuarão funcionando normalmente no aplicativo WhatsApp Business do celular enquanto o CRM recebe mensagens e executa as automações pela API oficial.
    </div>
    <div className="grid grid-2">
      {(['clientes', 'corretores'] as Channel[]).map((channel) => {
        const item = connection(channel);
        return <section className="card" key={channel}>
          <div className="card-head">
            <h3>{channel === 'clientes' ? 'Canal 1 · Clientes finais' : 'Canal 2 · Corretores'}</h3>
            <span className={`connection-pill ${item ? '' : 'off'}`}>{item ? 'Coexistência ativa' : 'Não conectado'}</span>
          </div>
          <div className="card-body">
            <p className="muted">{channel === 'clientes' ? 'Número usado nos anúncios e no atendimento da Nara.' : 'Número dedicado ao relacionamento e plantão dos corretores.'}</p>
            {item
              ? <div className="info-list">
                <div className="info-row"><span>Número</span><strong>{item.display_phone_number || '—'}</strong></div>
                <div className="info-row"><span>Nome verificado</span><strong>{item.verified_name || '—'}</strong></div>
                <div className="info-row"><span>Qualidade</span><strong>{item.quality_rating || '—'}</strong></div>
                <div className="info-row"><span>Status</span><strong>WhatsApp Business + CRM</strong></div>
                <button className="btn btn-ghost btn-sm" onClick={() => connect(channel)}>Trocar ou reconectar número</button>
              </div>
              : <button className="btn btn-primary" onClick={() => connect(channel)} disabled={loading || !sdkReady}>
                <span style={{ fontWeight: 900 }}>f</span> {loading && selected === channel ? 'Conectando…' : sdkReady ? 'Conectar sem sair do WhatsApp Business' : 'Carregando Facebook…'}
              </button>}
          </div>
        </section>;
      })}
    </div>
    {error && <div className="error-box" style={{ marginTop: 14 }}>{error}</div>}
    {success && <div className="success-box" style={{ marginTop: 14 }}>{success}</div>}
    <section className="card" style={{ marginTop: 14 }}>
      <div className="card-head"><h3>Como funciona no sistema real</h3></div>
      <div className="card-body">
        <ol className="muted" style={{ lineHeight: 1.8, paddingLeft: 20 }}>
          <li>O administrador escolhe o canal e entra com o Facebook.</li>
          <li>Na janela da Meta, escolhe conectar o número já usado no WhatsApp Business.</li>
          <li>Confirma a coexistência pelo próprio aplicativo, sem excluir a conta nem perder o uso no celular.</li>
          <li>O backend salva o token criptografado, assina os webhooks e registra as novas mensagens no CRM.</li>
          <li>Quando alguém responde pelo celular, a resposta aparece no histórico e a IA daquele lead é pausada automaticamente.</li>
        </ol>
        <div className="info-box">
          Não exclua a conta do WhatsApp Business, não desinstale o aplicativo e não escolha uma migração definitiva do número para API. O fluxo correto é conectar o aplicativo existente em modo de coexistência.
        </div>
      </div>
    </section>
  </>;
}