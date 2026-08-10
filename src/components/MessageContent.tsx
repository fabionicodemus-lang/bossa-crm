'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { Message } from '@/lib/types';

type RawMedia = {
  id?: string;
  caption?: string;
  mime_type?: string;
};

type TranscriptionState = 'idle' | 'loading' | 'error';

function rawPayload(message: Message) {
  return message.raw_payload && typeof message.raw_payload === 'object'
    ? message.raw_payload
    : null;
}

function mediaValue(message: Message, type: string): RawMedia | null {
  const raw = rawPayload(message);
  if (!raw || raw.type !== type) return null;
  const value = raw[type];
  return value && typeof value === 'object' ? value as RawMedia : null;
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

export function MessageContent({ message }: { message: Message }) {
  const image = mediaValue(message, 'image');
  const audio = mediaValue(message, 'audio');
  const initialTranscript = audio ? audioTranscript(message) : null;
  const [transcript, setTranscript] = useState<string | null>(initialTranscript);
  const [transcriptionState, setTranscriptionState] = useState<TranscriptionState>('idle');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!audio?.id || transcript) return;
    let active = true;
    const controller = new AbortController();

    setTranscriptionState('loading');
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
  }, [audio?.id, message.id, retry, transcript]);

  useEffect(() => {
    const next = audio ? audioTranscript(message) : null;
    if (next) setTranscript(next);
  }, [audio, message]);

  if (image?.id) {
    const src = `/api/messages/${message.id}/media`;
    const caption = image.caption?.trim() || (message.body !== '[Imagem]' ? message.body.trim() : '');
    return <div style={{ display: 'grid', gap: 7 }}>
      <a href={src} target="_blank" rel="noreferrer" style={{ display: 'block', lineHeight: 0 }}>
        <Image
          src={src}
          alt={caption || 'Imagem recebida pelo WhatsApp'}
          width={480}
          height={360}
          unoptimized
          style={{ width: 'min(360px, 100%)', height: 'auto', maxHeight: 420, objectFit: 'contain', borderRadius: 10 }}
        />
      </a>
      {caption && <span style={{ whiteSpace: 'pre-wrap' }}>{caption}</span>}
    </div>;
  }

  if (audio?.id) {
    return <div style={{ display: 'grid', gap: 8, minWidth: 250 }}>
      <audio controls preload="metadata" src={`/api/messages/${message.id}/media`} style={{ width: 'min(340px, 100%)' }} />
      {transcript
        ? <div style={{ whiteSpace: 'pre-wrap' }}><strong style={{ fontSize: 11 }}>Transcrição</strong><br />{transcript}</div>
        : transcriptionState === 'error'
          ? <div className="faint" style={{ fontSize: 11 }}>Não foi possível transcrever automaticamente. <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button></div>
          : <div className="faint" style={{ fontSize: 11 }}>Transcrevendo áudio…</div>}
    </div>;
  }

  return <span style={{ whiteSpace: 'pre-wrap' }}>{message.body}</span>;
}
