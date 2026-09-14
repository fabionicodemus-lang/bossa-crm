'use client';

import Image from 'next/image';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { displayPhone, initials } from '@/lib/format';

type Channel = {
  id: string;
  label: string;
  display_phone_number: string | null;
  verified_name: string | null;
  status: string;
  connection_mode: string;
};

type InboxMedia = {
  available: boolean;
  mimeType: string | null;
  filename: string | null;
  historicalPlaceholder: boolean;
} | null;

type InboxMessage = {
  id: string;
  conversationId: string;
  direction: 'in' | 'out' | 'system' | string;
  senderKind: string;
  type: string;
  body: string | null;
  status: string | null;
  sentAt: string | null;
  createdAt: string;
  media?: InboxMedia;
};

type Conversation = {
  id: string;
  contactWaId: string;
  leadId: string | null;
  name: string;
  phone: string;
  company: string | null;
  creci: string | null;
  stage: string | null;
  lastInboundAt: string | null;
  windowExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessage: InboxMessage | null;
};

type InboxPayload = {
  channel: Channel | null;
  conversations: Conversation[];
  selectedConversationId: string | null;
  messages: InboxMessage[];
  error?: string;
};

function compactTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
  }
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date);
}

function messageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function previewText(message: InboxMessage | null) {
  if (!message) return 'Conversa iniciada';
  const prefix = message.direction === 'out' ? 'Você: ' : '';
  const type = message.type.toLowerCase();
  if (type === 'image') return `${prefix}📷 ${message.body && message.body !== '[Imagem]' ? message.body : 'Imagem'}`;
  if (type === 'audio') return `${prefix}🎙️ Áudio`;
  if (type === 'video') return `${prefix}🎥 ${message.body && message.body !== '[Vídeo]' ? message.body : 'Vídeo'}`;
  if (type === 'document') return `${prefix}📎 ${message.body || 'Arquivo'}`;
  if (type === 'media_placeholder') return `${prefix}📎 Mídia do histórico`;
  return `${prefix}${message.body || `[${message.type}]`}`;
}

function statusMark(status: string | null) {
  if (status === 'read') return '✓✓';
  if (status === 'delivered') return '✓✓';
  if (status === 'failed') return '!';
  return '✓';
}

function meaningfulMediaBody(message: InboxMessage) {
  const body = (message.body || '').trim();
  if (!body) return '';
  if (/^\[(Imagem|Áudio|Vídeo|Mídia histórica)\]$/i.test(body)) return '';
  if (/^\[Documento:.*\]$/i.test(body)) return '';
  if (body.startsWith('📎 ') && message.media?.filename) return '';
  return body;
}

function mediaKind(message: InboxMessage) {
  const mime = message.media?.mimeType?.toLowerCase() || '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  const type = message.type.toLowerCase();
  if (['image', 'audio', 'video', 'document', 'sticker'].includes(type)) return type;
  return 'document';
}

function BrokerMessageContent({ message }: { message: InboxMessage }) {
  const media = message.media;
  if (media?.historicalPlaceholder) {
    return <div style={{ fontSize: 12, lineHeight: 1.45, color: '#756d65', display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: 20 }}>📎</span>
      <span><strong>Mídia do histórico</strong><br />A Meta trouxe o registro da mensagem, mas não disponibilizou o arquivo antigo.</span>
    </div>;
  }

  if (!media?.available) {
    return <div className="broker-message-body">{message.body || `[${message.type}]`}</div>;
  }

  const src = `/api/messages/${message.id}/media`;
  const kind = mediaKind(message);
  const caption = meaningfulMediaBody(message);

  if (kind === 'image' || kind === 'sticker') {
    return <div style={{ display: 'grid', gap: 7 }}>
      <a href={src} target="_blank" rel="noreferrer" style={{ display: 'block', lineHeight: 0 }}>
        <Image
          src={src}
          alt={caption || media.filename || 'Imagem do WhatsApp'}
          width={720}
          height={540}
          unoptimized
          style={{ width: 'min(380px, 100%)', height: 'auto', maxHeight: 460, objectFit: 'contain', borderRadius: 7 }}
        />
      </a>
      {caption && <div style={{ fontSize: 13, lineHeight: 1.42, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{caption}</div>}
    </div>;
  }

  if (kind === 'audio') {
    return <div style={{ display: 'grid', gap: 7, minWidth: 260 }}>
      <audio controls preload="metadata" src={src} style={{ width: 'min(360px, 100%)', height: 38 }} />
      {caption && <div style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{caption}</div>}
    </div>;
  }

  if (kind === 'video') {
    return <div style={{ display: 'grid', gap: 7 }}>
      <video controls preload="metadata" src={src} style={{ width: 'min(420px, 100%)', maxHeight: 460, borderRadius: 7, background: '#111' }} />
      {caption && <div style={{ fontSize: 13, lineHeight: 1.42, whiteSpace: 'pre-wrap' }}>{caption}</div>}
    </div>;
  }

  const filename = media.filename || message.body?.replace(/^\[Documento:\s*/i, '').replace(/\]$/, '') || 'Arquivo do WhatsApp';
  return <div style={{ display: 'grid', gap: 7, minWidth: 230 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, background: 'rgba(255,255,255,.5)', border: '1px solid rgba(70,60,50,.12)' }}>
      <span style={{ fontSize: 26 }}>📄</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <strong style={{ display: 'block', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filename}</strong>
        {media.mimeType && <span style={{ display: 'block', marginTop: 2, color: '#817970', fontSize: 9 }}>{media.mimeType}</span>}
      </div>
    </div>
    <div style={{ display: 'flex', gap: 8 }}>
      <a href={src} target="_blank" rel="noreferrer" style={{ fontSize: 11, fontWeight: 800, color: '#176c52', textDecoration: 'none' }}>Abrir arquivo</a>
      <a href={`${src}?download=1`} style={{ fontSize: 11, fontWeight: 800, color: '#176c52', textDecoration: 'none' }}>Baixar</a>
    </div>
    {caption && <div style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{caption}</div>}
  </div>;
}

export function WhatsAppBrokerInbox() {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const previousSelected = useRef<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = selectedId ? `?conversationId=${encodeURIComponent(selectedId)}` : '';
      const response = await fetch(`/api/whatsapp/corretores${params}`, { cache: 'no-store' });
      const payload = await response.json() as InboxPayload;
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar as conversas.');
      setChannel(payload.channel);
      setConversations(payload.conversations || []);
      const nextSelected = payload.selectedConversationId;
      if (nextSelected && nextSelected !== selectedId) setSelectedId(nextSelected);
      setMessages(payload.messages || []);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as conversas.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void load(false);
    const timer = window.setInterval(() => void load(true), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const node = messagesRef.current;
    if (!node) return;
    const changedConversation = previousSelected.current !== selectedId;
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
    if (changedConversation || nearBottom) {
      requestAnimationFrame(() => node.scrollTo({ top: node.scrollHeight, behavior: changedConversation ? 'auto' : 'smooth' }));
    }
    previousSelected.current = selectedId;
  }, [messages, selectedId]);

  const selected = conversations.find((item) => item.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return conversations;
    return conversations.filter((item) => [
      item.name,
      item.phone,
      item.company,
      item.creci,
      item.lastMessage?.body,
    ].some((value) => String(value || '').toLowerCase().includes(needle)));
  }, [conversations, search]);

  const windowOpen = Boolean(selected?.windowExpiresAt && new Date(selected.windowExpiresAt).getTime() > Date.now());

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selected?.leadId || !text.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: selected.leadId, body: text.trim() }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível enviar a mensagem.');
      setText('');
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  }

  if (loading && !channel) {
    return <div className="broker-inbox-loading">Carregando WhatsApp dos corretores…</div>;
  }

  if (!channel) {
    return <div className="broker-inbox-empty">
      <div className="broker-empty-icon">💬</div>
      <h3>Canal de corretores não conectado</h3>
      <p>Conecte o número dos corretores em Configurações → Canais WhatsApp para começar a receber as conversas aqui.</p>
    </div>;
  }

  return <div className="broker-inbox-shell">
    <aside className="broker-chat-list">
      <div className="broker-list-head">
        <div>
          <strong>WhatsApp Corretores</strong>
          <span><i /> {displayPhone(channel.display_phone_number)}</span>
        </div>
        <button className="broker-refresh" onClick={() => void load(false)} title="Atualizar">↻</button>
      </div>
      <div className="broker-search-wrap">
        <span>⌕</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar conversa" />
      </div>
      <div className="broker-conversations">
        {filtered.length === 0 && <div className="broker-no-conversations">
          {conversations.length === 0 ? 'Ainda não há conversas sincronizadas.' : 'Nenhuma conversa encontrada.'}
        </div>}
        {filtered.map((conversation) => <button
          key={conversation.id}
          className={`broker-conversation ${conversation.id === selectedId ? 'active' : ''}`}
          onClick={() => setSelectedId(conversation.id)}
        >
          <div className="broker-avatar">{initials(conversation.name)}</div>
          <div className="broker-conversation-main">
            <div className="broker-conversation-title">
              <strong>{conversation.name}</strong>
              <time>{compactTime(conversation.lastMessage?.createdAt || conversation.updatedAt)}</time>
            </div>
            <div className="broker-conversation-preview">
              <span>{previewText(conversation.lastMessage)}</span>
            </div>
            {(conversation.company || conversation.creci) && <small>{[conversation.company, conversation.creci].filter(Boolean).join(' · ')}</small>}
          </div>
        </button>)}
      </div>
    </aside>

    <section className="broker-chat-panel">
      {!selected ? <div className="broker-chat-placeholder">
        <div className="broker-placeholder-phone">💬</div>
        <h2>Mensagens dos corretores</h2>
        <p>As conversas recebidas e enviadas pelo WhatsApp Business aparecerão aqui.</p>
        <small>Sincronização automática a cada poucos segundos.</small>
      </div> : <>
        <header className="broker-chat-head">
          <div className="broker-avatar">{initials(selected.name)}</div>
          <div className="broker-chat-contact">
            <strong>{selected.name}</strong>
            <span>{displayPhone(selected.phone)}{selected.company ? ` · ${selected.company}` : ''}{selected.creci ? ` · ${selected.creci}` : ''}</span>
          </div>
          <div className={`broker-window-pill ${windowOpen ? 'open' : ''}`}>{windowOpen ? 'Janela 24h aberta' : 'Janela 24h fechada'}</div>
        </header>

        <div className="broker-messages" ref={messagesRef}>
          {messages.length === 0 && <div className="broker-day-chip">Nenhuma mensagem sincronizada nesta conversa.</div>}
          {messages.map((message) => <div key={message.id} className={`broker-message-row ${message.direction === 'out' ? 'out' : 'in'}`}>
            <div className="broker-message-bubble">
              <BrokerMessageContent message={message} />
              <div className="broker-message-meta">
                <span>{messageTime(message.createdAt)}</span>
                {message.direction === 'out' && <span className={message.status === 'read' ? 'read' : ''}>{statusMark(message.status)}</span>}
              </div>
            </div>
          </div>)}
        </div>

        {error && <div className="broker-chat-error">{error}</div>}
        <form className="broker-composer" onSubmit={send}>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={windowOpen ? 'Digite uma mensagem' : 'A janela de atendimento pela API está fechada'}
            disabled={!windowOpen || !selected.leadId || sending}
            rows={1}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button type="submit" disabled={!windowOpen || !selected.leadId || !text.trim() || sending}>{sending ? '…' : '➤'}</button>
        </form>
        {!windowOpen && <div className="broker-window-note">Para responder por aqui fora da janela de 24h, é necessário usar um modelo aprovado. Pelo aplicativo WhatsApp Business você continua podendo atender normalmente.</div>}
      </>}
    </section>

    <style jsx>{`
      .broker-inbox-shell{display:grid;grid-template-columns:360px minmax(0,1fr);height:calc(100vh - 150px);min-height:620px;border:1px solid #ded9d1;border-radius:14px;overflow:hidden;background:#f7f4ef;box-shadow:0 8px 28px rgba(56,45,35,.08)}
      .broker-chat-list{display:flex;flex-direction:column;min-width:0;background:#fff;border-right:1px solid #e4dfd7}
      .broker-list-head{height:68px;padding:0 16px;display:flex;align-items:center;justify-content:space-between;background:#f5f3ef;border-bottom:1px solid #e8e4de}
      .broker-list-head>div{display:flex;flex-direction:column;gap:4px}.broker-list-head strong{font-size:16px;color:#27231f}.broker-list-head span{font-size:11px;color:#70685f;display:flex;align-items:center;gap:5px}.broker-list-head i{width:7px;height:7px;border-radius:50%;background:#28a745;display:inline-block}
      .broker-refresh{border:0;background:transparent;font-size:22px;color:#6d665e;cursor:pointer;width:36px;height:36px;border-radius:50%}.broker-refresh:hover{background:#eae6e0}
      .broker-search-wrap{margin:10px 12px;display:flex;align-items:center;gap:8px;background:#f3f1ee;border-radius:9px;padding:0 11px;color:#8f877f}.broker-search-wrap input{border:0;outline:0;background:transparent;width:100%;height:38px;font-size:13px;color:#302b26}
      .broker-conversations{overflow:auto;flex:1}.broker-conversation{width:100%;display:flex;gap:11px;padding:12px 13px;border:0;border-bottom:1px solid #f0ece7;background:#fff;text-align:left;cursor:pointer}.broker-conversation:hover,.broker-conversation.active{background:#f3f1ed}.broker-avatar{width:42px;height:42px;flex:0 0 42px;border-radius:50%;display:grid;place-items:center;background:#d9ddd5;color:#3d4d41;font-weight:800;font-size:13px}.broker-conversation-main{min-width:0;flex:1}.broker-conversation-title{display:flex;gap:8px;justify-content:space-between;align-items:center}.broker-conversation-title strong{font-size:13px;color:#28231f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.broker-conversation-title time{font-size:10px;color:#8b837b;white-space:nowrap}.broker-conversation-preview{margin-top:4px;font-size:12px;color:#756d65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.broker-conversation-preview span{display:block;overflow:hidden;text-overflow:ellipsis}.broker-conversation small{display:block;margin-top:4px;font-size:10px;color:#a09890;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.broker-no-conversations{padding:28px 18px;color:#8b837b;font-size:12px;text-align:center}
      .broker-chat-panel{min-width:0;display:flex;flex-direction:column;background:#efeae2;position:relative}.broker-chat-panel:before{content:'';position:absolute;inset:0;opacity:.18;pointer-events:none;background-image:radial-gradient(#a79e92 1px,transparent 1px);background-size:22px 22px}.broker-chat-head{position:relative;z-index:1;height:68px;background:#f5f3ef;border-bottom:1px solid #dfdad3;display:flex;align-items:center;padding:0 16px;gap:11px}.broker-chat-contact{min-width:0;flex:1;display:flex;flex-direction:column}.broker-chat-contact strong{font-size:14px;color:#2e2924}.broker-chat-contact span{font-size:11px;color:#7b736b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.broker-window-pill{font-size:10px;padding:5px 8px;border-radius:999px;background:#eee2d0;color:#8b5b1d;font-weight:700}.broker-window-pill.open{background:#dff1e3;color:#28753b}
      .broker-messages{position:relative;z-index:1;flex:1;overflow:auto;padding:22px 6% 16px}.broker-message-row{display:flex;margin:3px 0}.broker-message-row.in{justify-content:flex-start}.broker-message-row.out{justify-content:flex-end}.broker-message-bubble{max-width:min(76%,720px);min-width:90px;padding:8px 9px 5px;border-radius:8px;background:#fff;box-shadow:0 1px 1px rgba(50,40,30,.12);color:#2e2a26}.broker-message-row.out .broker-message-bubble{background:#d9fdd3}.broker-message-body{font-size:13px;line-height:1.42;white-space:pre-wrap;overflow-wrap:anywhere;padding-right:14px}.broker-message-meta{display:flex;justify-content:flex-end;gap:4px;align-items:center;margin-top:4px;font-size:9px;color:#857e76}.broker-message-meta .read{color:#42a5c8}.broker-day-chip{width:max-content;max-width:80%;margin:20px auto;padding:6px 10px;border-radius:7px;background:#fff7e8;color:#7b6e5f;font-size:11px;box-shadow:0 1px 1px rgba(50,40,30,.08)}
      .broker-composer{position:relative;z-index:1;display:flex;align-items:flex-end;gap:10px;padding:10px 14px;background:#f3f0eb;border-top:1px solid #ddd7cf}.broker-composer textarea{resize:none;min-height:42px;max-height:110px;flex:1;border:1px solid #e0dbd4;border-radius:10px;background:#fff;padding:11px 13px;outline:0;font:inherit;font-size:13px;line-height:1.35}.broker-composer textarea:focus{border-color:#b6aca0}.broker-composer button{width:42px;height:42px;border-radius:50%;border:0;background:#167c5a;color:#fff;font-size:18px;cursor:pointer}.broker-composer button:disabled{background:#aaa39a;cursor:not-allowed}.broker-window-note{position:relative;z-index:1;padding:7px 14px;background:#fff4df;color:#7e5a24;font-size:10px;text-align:center}.broker-chat-error{position:relative;z-index:2;margin:0 14px 8px;padding:8px 10px;border-radius:7px;background:#fde8e7;color:#9b322c;font-size:11px}
      .broker-chat-placeholder,.broker-inbox-empty,.broker-inbox-loading{display:grid;place-items:center;align-content:center;text-align:center;min-height:520px;padding:28px;color:#746c63}.broker-chat-placeholder{position:relative;z-index:1;flex:1}.broker-chat-placeholder h2,.broker-inbox-empty h3{margin:10px 0 4px;color:#413b35}.broker-chat-placeholder p,.broker-inbox-empty p{max-width:520px;margin:0;font-size:13px}.broker-chat-placeholder small{margin-top:8px;color:#978e84}.broker-placeholder-phone,.broker-empty-icon{font-size:48px;opacity:.55}
      @media(max-width:980px){.broker-inbox-shell{grid-template-columns:300px minmax(0,1fr)}.broker-window-pill{display:none}.broker-message-bubble{max-width:86%}}
      @media(max-width:760px){.broker-inbox-shell{display:block;height:auto;min-height:0}.broker-chat-list{height:420px;border-right:0;border-bottom:1px solid #ddd}.broker-chat-panel{height:620px}.broker-message-bubble{max-width:92%}}
    `}</style>
  </div>;
}
