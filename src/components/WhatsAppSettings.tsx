'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
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

declare global {
  interface Window {
    FB?: {
      init: (options: Record<string, unknown>) => void;
      login: (callback: (response: { authResponse?: { code?: string } }) => void, options: Record<string, unknown>) => void;
    };
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
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;
  const graphVersion = process.env.NEXT_PUBLIC_META_GRAPH_VERSION || 'v25.0';

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
  });

  async function finishConnection() {
    if (!codeRef.current || !signupRef.current || loading) return;
    setLoading(true);
    setError('');
    setSuccess('');
    const response = await fetch('/api/meta/whatsapp/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: channelRef.current, code: codeRef.current, ...signupRef.current }),
    });
    const payload = await response.json().catch(() => ({}));
    codeRef.current = null;
    signupRef.current = null;
    if (!response.ok) setError(payload.error || 'Não foi possível concluir a conexão.');
    else {
      setSuccess('WhatsApp conectado com sucesso.');
      setConnections((current) => [...current.filter((item) => item.channel !== channelRef.current), payload.connection]);
      router.refresh();
    }
    setLoading(false);
  }

  function connect(channel: Channel) {
    channelRef.current = channel;
    setSelected(channel);
    setError('');
    setSuccess('');
    if (!appId || !configId) {
      setError('Configure NEXT_PUBLIC_META_APP_ID e NEXT_PUBLIC_META_CONFIG_ID no servidor antes de conectar.');
      return;
    }
    if (!window.FB || !sdkReady) {
      setError('O login do Facebook ainda está carregando. Tente novamente em alguns segundos.');
      return;
    }
    window.FB.login((response) => {
      const code = response.authResponse?.code;
      if (!code) { setError('A conexão foi cancelada ou a Meta não devolveu o código temporário.'); return; }
      codeRef.current = code;
      void finishConnection();
    }, {
      config_id: configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
    });
  }

  function connection(channel: Channel) { return connections.find((item) => item.channel === channel); }

  return <>
    <Script src="https://connect.facebook.net/pt_BR/sdk.js" strategy="afterInteractive" onLoad={() => {
      if (!appId || !window.FB) return;
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: true, version: graphVersion });
      setSdkReady(true);
    }} />
    <div className="grid grid-2">
      {(['clientes', 'corretores'] as Channel[]).map((channel) => {
        const item = connection(channel);
        return <section className="card" key={channel}><div className="card-head"><h3>{channel === 'clientes' ? 'Canal 1 · Clientes finais' : 'Canal 2 · Corretores'}</h3><span className={`connection-pill ${item ? '' : 'off'}`}>{item ? 'Conectado' : 'Não conectado'}</span></div><div className="card-body"><p className="muted">{channel === 'clientes' ? 'Número usado nos anúncios e no atendimento da Nara.' : 'Número dedicado ao relacionamento e plantão dos corretores.'}</p>{item ? <div className="info-list"><div className="info-row"><span>Número</span><strong>{item.display_phone_number || '—'}</strong></div><div className="info-row"><span>Nome verificado</span><strong>{item.verified_name || '—'}</strong></div><div className="info-row"><span>Qualidade</span><strong>{item.quality_rating || '—'}</strong></div><div className="info-row"><span>Status</span><strong>{item.status}</strong></div><button className="btn btn-ghost btn-sm" onClick={() => connect(channel)}>Trocar ou reconectar número</button></div> : <button className="btn btn-primary" onClick={() => connect(channel)} disabled={loading}><span style={{ fontWeight: 900 }}>f</span> {loading && selected === channel ? 'Conectando…' : 'Continuar com o Facebook'}</button>}</div></section>;
      })}
    </div>
    {error && <div className="error-box" style={{ marginTop: 14 }}>{error}</div>}
    {success && <div className="success-box" style={{ marginTop: 14 }}>{success}</div>}
    <section className="card" style={{ marginTop: 14 }}><div className="card-head"><h3>Como funciona no sistema real</h3></div><div className="card-body"><ol className="muted" style={{ lineHeight: 1.8, paddingLeft: 20 }}><li>O administrador escolhe o canal e entra com o Facebook.</li><li>A Meta permite escolher a empresa, conta do WhatsApp e número.</li><li>O backend salva o token criptografado e assina o webhook.</li><li>Novas mensagens passam a aparecer na ficha do cliente ou corretor.</li></ol><div className="info-box">O histórico começa a ser persistido quando a integração está ativa. A disponibilidade de histórico anterior depende do fluxo e das permissões liberadas pela Meta.</div></div></section>
  </>;
}
