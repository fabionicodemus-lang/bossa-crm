'use client';

import Image from 'next/image';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { displayPhone, initials } from '@/lib/format';

type Channel = {
  id: string;
  label: string;
  slotLabel: string | null;
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
  channelId: string;
  channelLabel: string;
  channelDisplayPhone: string | null;
  channelSlotLabel: string | null;
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
  channels?: Channel[];
  channel: Channel | null;
  conversations: Conversation[];
  selectedConversationId: string | null;
  messages: InboxMessage[];
  hasMore?: boolean;
  oldestAt?: string | null;
  error?: string;
};

type CachedMessages = {
  messages: InboxMessage[];
  hasMore: boolean;
  oldestAt: string | null;
  loadedAt: number;
};

const MESSAGE_CACHE_LIMIT = 30;
const MESSAGE_REFRESH_MS = 4_000;
const CONVERSATION_REFRESH_MS = 30_000;

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

function mergeMessages(first: InboxMessage[], second: InboxMessage[]) {
  const map = new Map<string, InboxMessage>();
  for (const message of first) map.set(message.id, message);
  for (const message of second) map.set(message.id, message);
  return [...map.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function WhatsAppBrokerInbox() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelFilter, setChannelFilter] = useState('all');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [oldestAt, setOldestAt] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const previousSelected = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const messageAbort = useRef<AbortController | null>(null);
  const messageCache = useRef(new Map<string, CachedMessages>());

  const putCache = useCallback((conversationId: string, value: CachedMessages) => {
    const cache = messageCache.current;
    cache.delete(conversationId);
    cache.set(conversationId, value);
    while (cache.size > MESSAGE_CACHE_LIMIT) {
      const oldestKey = cache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      cache.delete(oldestKey);
    }
  }, [channelFilter]);

  const applyCachedToScreen = useCallback((conversationId: string, cached: CachedMessages) => {
    if (selectedIdRef.current !== conversationId) return;
    setMessages(cached.messages);
    setHasMoreMessages(cached.hasMore);
    setOldestAt(cached.oldestAt);
  }, []);

  const fetchMessages = useCallback(async (
    conversationId: string,
    options: { silent?: boolean; before?: string | null; prefetch?: boolean } = {},
  ) => {
    const cached = messageCache.current.get(conversationId);
    const isCurrent = selectedIdRef.current === conversationId;
    const isOlder = Boolean(options.before);

    if (!options.silent && isCurrent && !cached && !isOlder) setLoadingMessages(true);

    const controller = new AbortController();
    if (isCurrent && !options.prefetch && !isOlder) {
      messageAbort.current?.abort();
      messageAbort.current = controller;
    }

    try {
      const params = new URLSearchParams({ view: 'messages', conversationId });
      if (options.before) params.set('before', options.before);
      const response = await fetch(`/api/whatsapp/corretores?${params.toString()}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = await response.json() as InboxPayload;
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar as mensagens.');

      const previous = messageCache.current.get(conversationId);
      let nextMessages = payload.messages || [];
      let nextHasMore = Boolean(payload.hasMore);
      let nextOldest: string | null = payload.oldestAt ?? nextMessages[0]?.createdAt ?? null;

      if (isOlder && previous) {
        nextMessages = mergeMessages(nextMessages, previous.messages);
      } else if (previous && previous.messages.length > nextMessages.length) {
        nextMessages = mergeMessages(previous.messages, nextMessages);
        nextHasMore = previous.hasMore;
        nextOldest = previous.oldestAt;
      }

      const nextCache: CachedMessages = {
        messages: nextMessages,
        hasMore: nextHasMore,
        oldestAt: nextOldest,
        loadedAt: Date.now(),
      };
      putCache(conversationId, nextCache);
      applyCachedToScreen(conversationId, nextCache);
      if (isCurrent) setError('');
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      if (isCurrent) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as mensagens.');
    } finally {
      if (isCurrent && !options.prefetch && !isOlder) setLoadingMessages(false);
    }
  }, [applyCachedToScreen, putCache]);

  const loadConversations = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ view: 'conversations', channel: channelFilter });
      const response = await fetch(`/api/whatsapp/corretores?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json() as InboxPayload;
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar as conversas.');
      setChannels(payload.channels ?? (payload.channel ? [payload.channel] : []));
      const nextConversations = payload.conversations || [];
      setConversations(nextConversations);

      const current = selectedIdRef.current;
      const stillExists = current && nextConversations.some((item) => item.id === current);
      if (!stillExists) {
        const nextSelected = payload.selectedConversationId || nextConversations[0]?.id || null;
        selectedIdRef.current = nextSelected;
        setSelectedId(nextSelected);
        if (!nextSelected) {
          setMessages([]);
          setHasMoreMessages(false);
          setOldestAt(null);
        }
      }
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as conversas.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const selectConversation = useCallback((conversationId: string) => {
    if (selectedIdRef.current === conversationId) return;
    selectedIdRef.current = conversationId;
    setSelectedId(conversationId);
    setText('');
    setError('');

    const cached = messageCache.current.get(conversationId);
    if (cached) {
      setMessages(cached.messages);
      setHasMoreMessages(cached.hasMore);
      setOldestAt(cached.oldestAt);
      setLoadingMessages(false);
    } else {
      setMessages([]);
      setHasMoreMessages(false);
      setOldestAt(null);
      setLoadingMessages(true);
    }
  }, []);

  useEffect(() => {
    void loadConversations(false);
    const timer = window.setInterval(() => void loadConversations(true), CONVERSATION_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) return;
    selectedIdRef.current = selectedId;
    const cached = messageCache.current.get(selectedId);
    if (cached) applyCachedToScreen(selectedId, cached);
    void fetchMessages(selectedId, { silent: Boolean(cached) });

    const timer = window.setInterval(() => {
      void fetchMessages(selectedId, { silent: true });
    }, MESSAGE_REFRESH_MS);

    return () => {
      window.clearInterval(timer);
      messageAbort.current?.abort();
    };
  }, [selectedId, applyCachedToScreen, fetchMessages]);

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

  const prefetchConversation = useCallback((conversationId: string) => {
    if (messageCache.current.has(conversationId) || conversationId === selectedIdRef.current) return;
    void fetchMessages(conversationId, { silent: true, prefetch: true });
  }, [fetchMessages]);

  async function loadOlderMessages() {
    if (!selectedId || !oldestAt || !hasMoreMessages || loadingOlder) return;
    const node = messagesRef.current;
    const previousHeight = node?.scrollHeight ?? 0;
    const previousTop = node?.scrollTop ?? 0;
    setLoadingOlder(true);
    try {
      await fetchMessages(selectedId, { silent: true, before: oldestAt });
      requestAnimationFrame(() => {
        if (!node) return;
        node.scrollTop = previousTop + Math.max(0, node.scrollHeight - previousHeight);
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selected?.leadId || !text.trim() || sending) return;
    const body = text.trim();
    setSending(true);
    setError('');
    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: selected.leadId, conversationId: selected.id, body }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível enviar a mensagem.');
      setText('');

      const now = new Date().toISOString();
      setConversations((current) => current.map((conversation) => conversation.id === selected.id ? {
        ...conversation,
        updatedAt: now,
        lastMessage: {
          id: `optimistic-${now}`,
          conversationId: conversation.id,
          direction: 'out',
          senderKind: 'humano',
          type: 'text',
          body,
          status: 'sent',
          sentAt: now,
          createdAt: now,
        },
      } : conversation).sort((a, b) => new Date(b.lastMessage?.createdAt || b.updatedAt).getTime() - new Date(a.lastMessage?.createdAt || a.updatedAt).getTime()));

      await fetchMessages(selected.id, { silent: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  }

  if (loading && channels.length === 0) {
    return <div className="broker-inbox-loading">Carregando WhatsApp dos corretores…</div>;
  }

  if (channels.length === 0) {
    return <div className="broker-inbox-empty">
      <div className="broker-empty-icon">💬</div>
      <h3>Canal de corretores não conectado</h3>
      <p>Conecte o número dos corretores em Configurações → Canais WhatsApp para começar a receber as conversas aqui.</p>
    </div>;
  }

  const selectedChannel = channelFilter === 'all'
    ? null
    : channels.find((item) => item.id === channelFilter) ?? null;
  const channelSubtitle = selectedChannel
    ? `${selectedChannel.slotLabel ?? 'Canal'} · ${displayPhone(selectedChannel.display_phone_number)}`
    : `${channels.length} canais conectados`;

  function chooseChannel(nextChannel: string) {
    if (nextChannel === channelFilter) return;
    selectedIdRef.current = null;
    setSelectedId(null);
    setMessages([]);
    setHasMoreMessages(false);
    setOldestAt(null);
    setConversations([]);
    setSearch('');
    messageCache.current.clear();
    setChannelFilter(nextChannel);
  }

  return <div className="broker-inbox-shell">
    <aside className="broker-chat-list">
      <div className="broker-list-head">
        <div>
          <strong>WhatsApp Corretores</strong>
          <span><i /> {channelSubtitle}</span>
        </div>
        <button className="broker-refresh" onClick={() => void loadConversations(false)} title="Atualizar">↻</button>
      </div>
      <div className="broker-channel-filter" role="group" aria-label="Filtrar canal do WhatsApp">
        <button type="button" className={channelFilter === 'all' ? 'active' : ''} onClick={() => chooseChannel('all')}>Todos</button>
        {channels.map((item) => <button
          key={item.id}
          type="button"
          className={channelFilter === item.id ? 'active' : ''}
          onClick={() => chooseChannel(item.id)}
          title={`${item.label} · ${displayPhone(item.display_phone_number)}`}
        >
          {item.slotLabel ?? item.label}
        </button>)}
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
          onClick={() => selectConversation(conversation.id)}
          onMouseEnter={() => prefetchConversation(conversation.id)}
          onFocus={() => prefetchConversation(conversation.id)}
        >
          <div className="broker-avatar">{initials(conversation.name)}</div>
          <div className="broker-conversation-main">
            <div className="broker-conversation-title">
              <strong>{conversation.name}</strong>
              {channelFilter === 'all' && conversation.channelSlotLabel && <span className="broker-channel-badge">{conversation.channelSlotLabel.replace('Canal ', 'C')}</span>}
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
        <small>Sincronização automática em segundo plano.</small>
      </div> : <>
        <header className="broker-chat-head">
          <div className="broker-avatar">{initials(selected.name)}</div>
          <div className="broker-chat-contact">
            <strong>{selected.name}</strong>
            <span>{displayPhone(selected.phone)}{selected.company ? ` · ${selected.company}` : ''}{selected.creci ? ` · ${selected.creci}` : ''}</span>
            <small>{selected.channelSlotLabel ?? selected.channelLabel} · {displayPhone(selected.channelDisplayPhone)}</small>
          </div>
          <div className={`broker-window-pill ${windowOpen ? 'open' : ''}`}>{windowOpen ? 'Janela 24h aberta' : 'Janela 24h fechada'}</div>
        </header>

        <div className="broker-messages" ref={messagesRef}>
          {hasMoreMessages && <div className="broker-load-older-wrap"><button type="button" className="broker-load-older" disabled={loadingOlder} onClick={() => void loadOlderMessages()}>{loadingOlder ? 'Carregando…' : 'Carregar mensagens anteriores'}</button></div>}
          {loadingMessages && messages.length === 0 && <div className="broker-day-chip broker-loading-chip">Carregando conversa…</div>}
          {!loadingMessages && messages.length === 0 && <div className="broker-day-chip">Nenhuma mensagem sincronizada nesta conversa.</div>}
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
      .broker-channel-filter{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:10px 12px 0;background:#fff}.broker-channel-filter button{border:1px solid #ded9d1;background:#fff;color:#6e665e;border-radius:8px;height:32px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.broker-channel-filter button:hover{background:#f5f2ee}.broker-channel-filter button.active{background:#174A52;color:#fff;border-color:#174A52}
      .broker-refresh{border:0;background:transparent;font-size:22px;color:#6d665e;cursor:pointer;width:36px;height:36px;border-radius:50%}.broker-refresh:hover{background:#eae6e0}
      .broker-search-wrap{margin:10px 12px;display:flex;align-items:center;gap:8px;background:#f3f1ee;border-radius:9px;padding:0 11px;color:#8f877f}.broker-search-wrap input{border:0;outline:0;background:transparent;width:100%;height:38px;font-size:13px;color:#302b26}
      .broker-conversations{overflow:auto;flex:1;overscroll-behavior:contain}.broker-conversation{width:100%;display:flex;gap:11px;padding:12px 13px;border:0;border-bottom:1px solid #f0ece7;background:#fff;text-align:left;cursor:pointer;content-visibility:auto;contain-intrinsic-size:66px}.broker-conversation:hover,.broker-conversation.active{background:#f3f1ed}.broker-avatar{width:42px;height:42px;flex:0 0 42px;border-radius:50%;display:grid;place-items:center;background:#d9ddd5;color:#3d4d41;font-weight:800;font-size:13px}.broker-conversation-main{min-width:0;flex:1}.broker-conversation-title{display:flex;gap:8px;justify-content:space-between;align-items:center}.broker-conversation-title strong{font-size:13px;color:#28231f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}.broker-channel-badge{font-size:9px;font-weight:800;padding:2px 5px;border-radius:999px;background:#e6ecec;color:#174A52;white-space:nowrap}.broker-conversation-title time{font-size:10px;color:#8b837b;white-space:nowrap}.broker-conversation-preview{margin-top:4px;font-size:12px;color:#756d65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.broker-conversation-preview span{display:block;overflow:hidden;text-overflow:ellipsis}.broker-conversation small{display:block;margin-top:4px;font-size:10px;color:#a09890;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.broker-no-conversations{padding:28px 18px;color:#8b837b;font-size:12px;text-align:center}
      .broker-chat-panel{min-width:0;display:flex;flex-direction:column;background:#efeae2;position:relative}.broker-chat-panel:before{content:'';position:absolute;inset:0;opacity:.18;pointer-events:none;background-image:radial-gradient(#a79e92 1px,transparent 1px);background-size:22px 22px}.broker-chat-head{position:relative;z-index:1;height:68px;background:#f5f3ef;border-bottom:1px solid #dfdad3;display:flex;align-items:center;padding:0 16px;gap:11px}.broker-chat-contact{min-width:0;flex:1;display:flex;flex-direction:column}.broker-chat-contact strong{font-size:14px;color:#2e2924}.broker-chat-contact span{font-size:11px;color:#7b736b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.broker-chat-contact small{font-size:9px;color:#8b837b;margin-top:2px}.broker-window-pill{font-size:10px;padding:5px 8px;border-radius:999px;background:#eee2d0;color:#8b5b1d;font-weight:700}.broker-window-pill.open{background:#dff1e3;color:#28753b}
      .broker-messages{position:relative;z-index:1;flex:1;overflow:auto;padding:22px 6% 16px;overscroll-behavior:contain}.broker-message-row{display:flex;margin:3px 0}.broker-message-row.in{justify-content:flex-start}.broker-message-row.out{justify-content:flex-end}.broker-message-bubble{max-width:min(76%,720px);min-width:90px;padding:8px 9px 5px;border-radius:8px;background:#fff;box-shadow:0 1px 1px rgba(50,40,30,.12);color:#2e2a26}.broker-message-row.out .broker-message-bubble{background:#d9fdd3}.broker-message-body{font-size:13px;line-height:1.42;white-space:pre-wrap;overflow-wrap:anywhere;padding-right:14px}.broker-message-meta{display:flex;justify-content:flex-end;gap:4px;align-items:center;margin-top:4px;font-size:9px;color:#857e76}.broker-message-meta .read{color:#42a5c8}.broker-day-chip{width:max-content;max-width:80%;margin:20px auto;padding:6px 10px;border-radius:7px;background:#fff7e8;color:#7b6e5f;font-size:11px;box-shadow:0 1px 1px rgba(50,40,30,.08)}.broker-loading-chip{background:#fff;color:#777}.broker-load-older-wrap{display:flex;justify-content:center;margin:0 0 14px}.broker-load-older{border:0;border-radius:999px;padding:7px 12px;background:#fff;color:#6b635a;font-size:10px;font-weight:700;box-shadow:0 1px 3px rgba(50,40,30,.12);cursor:pointer}.broker-load-older:disabled{opacity:.6;cursor:wait}
      .broker-composer{position:relative;z-index:1;display:flex;align-items:flex-end;gap:10px;padding:10px 14px;background:#f3f0eb;border-top:1px solid #ddd7cf}.broker-composer textarea{resize:none;min-height:42px;max-height:110px;flex:1;border:1px solid #e0dbd4;border-radius:10px;background:#fff;padding:11px 13px;outline:0;font:inherit;font-size:13px;line-height:1.35}.broker-composer textarea:focus{border-color:#b6aca0}.broker-composer button{width:42px;height:42px;border-radius:50%;border:0;background:#167c5a;color:#fff;font-size:18px;cursor:pointer}.broker-composer button:disabled{background:#aaa39a;cursor:not-allowed}.broker-window-note{position:relative;z-index:1;padding:7px 14px;background:#fff4df;color:#7e5a24;font-size:10px;text-align:center}.broker-chat-error{position:relative;z-index:2;margin:0 14px 8px;padding:8px 10px;border-radius:7px;background:#fde8e7;color:#9b322c;font-size:11px}
      .broker-chat-placeholder,.broker-inbox-empty,.broker-inbox-loading{display:grid;place-items:center;align-content:center;text-align:center;min-height:520px;padding:28px;color:#746c63}.broker-chat-placeholder{position:relative;z-index:1;flex:1}.broker-chat-placeholder h2,.broker-inbox-empty h3{margin:10px 0 4px;color:#413b35}.broker-chat-placeholder p,.broker-inbox-empty p{max-width:520px;margin:0;font-size:13px}.broker-chat-placeholder small{margin-top:8px;color:#978e84}.broker-placeholder-phone,.broker-empty-icon{font-size:48px;opacity:.55}
      @media(max-width:980px){.broker-inbox-shell{grid-template-columns:300px minmax(0,1fr)}.broker-window-pill{display:none}.broker-message-bubble{max-width:86%}}
      @media(max-width:760px){.broker-inbox-shell{display:block;height:auto;min-height:0}.broker-chat-list{height:420px;border-right:0;border-bottom:1px solid #ddd}.broker-chat-panel{height:620px}.broker-message-bubble{max-width:92%}}
    `}</style>
  </div>;
}
