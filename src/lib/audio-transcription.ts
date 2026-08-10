type OpenAiTranscriptionResponse = {
  text?: string;
  error?: { message?: string } | null;
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

function audioExtension(mimeType: string) {
  const mime = mimeType.toLowerCase().split(';')[0].trim();
  if (mime === 'audio/ogg') return 'ogg';
  if (mime === 'audio/mpeg' || mime === 'audio/mp3') return 'mp3';
  if (mime === 'audio/mp4') return 'mp4';
  if (mime === 'audio/x-m4a' || mime === 'audio/m4a') return 'm4a';
  if (mime === 'audio/wav' || mime === 'audio/x-wav') return 'wav';
  if (mime === 'audio/webm') return 'webm';
  if (mime === 'audio/flac') return 'flac';
  return 'ogg';
}

export async function transcribeAudio(input: {
  bytes: ArrayBuffer;
  mimeType: string;
  language?: string;
}) {
  const model = process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || 'gpt-4o-mini-transcribe';
  const mimeType = input.mimeType || 'audio/ogg';
  const blob = new Blob([input.bytes], { type: mimeType });
  const form = new FormData();
  form.append('file', blob, `whatsapp-audio.${audioExtension(mimeType)}`);
  form.append('model', model);
  form.append('language', input.language || 'pt');
  form.append('response_format', 'json');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${required('OPENAI_API_KEY')}` },
    body: form,
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({})) as OpenAiTranscriptionResponse;
  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI transcrição: HTTP ${response.status}`);
  }

  const text = String(data.text ?? '').trim();
  if (!text) throw new Error('A OpenAI não devolveu texto para o áudio recebido.');
  return { text, model };
}
