'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { Message } from '@/lib/types';

type RawMedia = {
  id?: string;
  caption?: string;
  mime_type?: string;
  filename?: string;
};

type ResolvedMedia = {
  type: string;
  id: string | null;
  caption: string;
  mimeType: string | null;
  filename: string | null;
  available: boolean;
  historicalPlaceholder: boolean;
};

type TranscriptionState = 'idle' | 'error';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function rawPayload(message: Message) {
  return message.raw_payload && typeof message.raw_payload === 'object'
    ? message.raw_payload
    : null;
}

function resolvedMedia(message: Message): ResolvedMedia | null {
  const raw = rawPayload(message);
  if (!raw) return null;

  const crm = asRecord(raw.crm);
  const aiSource = crm ?? raw;
  if (String(aiSource.ai_file_id ?? '').trim()) {
    const mimeType = typeof aiSource.mime_type === 'string' ? aiSource.mime_type : null;
    const type = mimeType?.startsWith('image/')
      ? 'image'
      : mimeType?.startsWith('audio/')
        ? 'audio'
        : mimeType?.startsWith('video/')
          ? 'video'
          : 'document';
    return {
      type,
      id: null,
      caption: '',
      mimeType,
      filename: typeof aiSource.original_name === 'string' ? aiSource.original_name : null,
      available: true,
      historicalPlaceholder: false,
    };
  }

  const envelope = asRecord(raw.message_echo) ?? asRecord(raw.history_message) ?? raw;
  const type = String(envelope.type ?? '').toLowerCase();
  if (type === 'media_placeholder') {
    return {
      type,
      id: null,
      caption: '',
      mimeType: null,
      filename: null,
      available: false,
      historicalPlaceholder: true,
    };
  }
  if (!['image', 'audio', 'video', 'document', 'sticker'].includes(type)) return null;
  const media = asRecord(envelope[type]) as RawMedia | null;
  if (!media) return null;
  const id = String(media.id ?? '').trim() || null;
  return {
    type,
    id,
    caption: typeof media.caption === 'string' ? media.caption.trim() : '',
    mimeType: typeof media.mime_type === 'string' ? media.mime_type : null,
    filename: typeof media.filename === 'string' ? media.filename : null,
    available: Boolean(id),
    historicalPlaceholder: false,
  };
}

function audioTranscript(message: Message) {
  const raw = rawPayload(message);
  const transcript = raw?.bossa_transcription;
  if (typeof transcript === 'string' && transcript.trim()) return transcript.trim();
  if (message.body && message.body !== '[Áudio]') {
    return message.body.replace(/^🎙️\s*/, '').replace(/^\[Áudio transcrito\]\s*/i, '').trim();
  }
  return null;
}

function meaningfulBody(message: Message, media: ResolvedMedia) {
  const body = (message.body || '').trim();
  if (!body) return '';
  if (/^\[(Imagem|Áudio|Vídeo|Mídia histórica)\]$/i.test(body)) return '';
  if (/^\[Documento:.*\]$/i.test(body)) return '';
  if (body.startsWith('📎 ') && media.filename) return '';
  return body;
}

export function MessageContent({ message }: { message: Message }) {
  const media = resolvedMedia(message);
  const initialTranscript = media?.type === 'audio' ? audioTranscript(message) : null;
  const [transcript, setTranscript] = useState<string | null>(initialTranscript);
  const [transcriptionState, setTranscriptionState] = useState<TranscriptionState>('idle');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (media?.type !== 'audio' || !media.id || transcript) return;
    let active = true;
    const controller = new AbortController();

    void fetch(`/api/messages/${message.id}/transcribe`, {
      method: 'POST',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { transcript?: string; error?: string };
        if (!response.ok || !payload.transcript) {
          throw new Error(payload.error || 'Não foi possível transcrever o áudio.');
        }
        if (!active) return;
        setTranscript(payload.transcript);
        setTranscriptionState('idle');
      })
      .catch((cause: unknown) => {
        if (!active || (cause instanceof DOMException && cause.name === 'AbortError')) return;
        setTranscriptionState('error');
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [media?.id, media?.type, message.id, retry, transcript]);

  if (media?.historicalPlaceholder) {
    return <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#756d65', fontSize: 12, lineHeight: 1.45 }}>
      <span style={{ fontSize: 20 }}>📎</span>
      <span><strong>Mídia do histórico</strong><br />A Meta registrou a mensagem antiga, mas não disponibilizou o arquivo.</span>
    </div>;
  }

  if (!media || !media.available) {
    return <span style={{ whiteSpace: 'pre-wrap' }}>{message.body}</span>;
  }

  const src = `/api/messages/${message.id}/media`;
  const caption = media.caption || meaningfulBody(message, media);
  const mime = media.mimeType?.toLowerCase() || '';
  const renderType = mime.startsWith('image/')
    ? 'image'
    : mime.startsWith('audio/')
      ? 'audio'
      : mime.startsWith('video/')
        ? 'video'
        : media.type;

  if (renderType === 'image' || renderType === 'sticker') {
    return <div style={{ display: 'grid', gap: 7 }}>
      <a href={src} target="_blank" rel="noreferrer" style={{ display: 'block', lineHeight: 0 }}>
        <Image
          src={src}
          alt={caption || media.filename || 'Imagem recebida pelo WhatsApp'}
          width={720}
          height={540}
          unoptimized
          style={{ width: 'min(380px, 100%)', height: 'auto', maxHeight: 460, objectFit: 'contain', borderRadius: 10 }}
        />
      </a>
      {caption && <span style={{ whiteSpace: 'pre-wrap' }}>{caption}</span>}
    </div>;
  }

  if (renderType === 'audio') {
    return <div style={{ display: 'grid', gap: 8, minWidth: 250 }}>
      <audio controls preload="metadata" src={src} style={{ width: 'min(340px, 100%)' }} />
      {transcript
        ? <div style={{ whiteSpace: 'pre-wrap' }}><strong style={{ fontSize: 11 }}>Transcrição</strong><br />{transcript}</div>
        : media.id && transcriptionState === 'error'
          ? <div className="faint" style={{ fontSize: 11 }}>Não foi possível transcrever automaticamente. <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setTranscriptionState('idle'); setRetry((value) => value + 1); }}>Tentar novamente</button></div>
          : media.id
            ? <div className="faint" style={{ fontSize: 11 }}>Transcrevendo áudio…</div>
            : null}
    </div>;
  }

  if (renderType === 'video') {
    return <div style={{ display: 'grid', gap: 7 }}>
      <video controls preload="metadata" src={src} style={{ width: 'min(440px, 100%)', maxHeight: 480, borderRadius: 10, background: '#111' }} />
      {caption && <span style={{ whiteSpace: 'pre-wrap' }}>{caption}</span>}
    </div>;
  }

  const filename = media.filename || message.body.replace(/^\[Documento:\s*/i, '').replace(/\]$/, '') || 'Arquivo do WhatsApp';
  return <div style={{ display: 'grid', gap: 8, minWidth: 220 }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 10px', border: '1px solid rgba(0,0,0,.12)', borderRadius: 9, background: 'rgba(255,255,255,.45)' }}>
      <span style={{ fontSize: 27 }}>📄</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <strong style={{ display: 'block', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{filename}</strong>
        {media.mimeType && <span className="faint" style={{ display: 'block', fontSize: 9, marginTop: 2 }}>{media.mimeType}</span>}
      </div>
    </div>
    <div style={{ display: 'flex', gap: 10 }}>
      <a href={src} target="_blank" rel="noreferrer" style={{ fontSize: 11, fontWeight: 800 }}>Abrir arquivo</a>
      <a href={`${src}?download=1`} style={{ fontSize: 11, fontWeight: 800 }}>Baixar</a>
    </div>
    {caption && <span style={{ whiteSpace: 'pre-wrap' }}>{caption}</span>}
  </div>;
}
