import Image from 'next/image';
import type { Message } from '@/lib/types';

type RawMedia = {
  id?: string;
  caption?: string;
  mime_type?: string;
};

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

  const audio = mediaValue(message, 'audio');
  if (audio?.id) {
    const transcript = audioTranscript(message);
    const transcriptionFailed = Boolean(rawPayload(message)?.bossa_transcription_error);
    return <div style={{ display: 'grid', gap: 8, minWidth: 250 }}>
      <audio controls preload="metadata" src={`/api/messages/${message.id}/media`} style={{ width: 'min(340px, 100%)' }} />
      {transcript
        ? <div style={{ whiteSpace: 'pre-wrap' }}><strong style={{ fontSize: 11 }}>Transcrição</strong><br />{transcript}</div>
        : <div className="faint" style={{ fontSize: 11 }}>{transcriptionFailed ? 'Transcrição indisponível.' : 'Transcrevendo áudio…'}</div>}
    </div>;
  }

  return <span style={{ whiteSpace: 'pre-wrap' }}>{message.body}</span>;
}
