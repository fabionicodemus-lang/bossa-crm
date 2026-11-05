const INLINE_MEDIA_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/bmp',
  'audio/aac', 'audio/aiff', 'audio/flac', 'audio/mpeg', 'audio/mp4', 'audio/ogg',
  'audio/webm', 'audio/wav', 'audio/x-wav', 'audio/x-m4a', 'audio/opus',
  'video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm', 'video/3gpp',
]);

function filenames(value: string | null, fallback: string) {
  // Normalize lone surrogates and remove control/path/header characters.
  const normalized = new TextDecoder().decode(new TextEncoder().encode(value || fallback))
    .replace(/[\u0000-\u001f\u007f"\\/]/g, '_').trim();
  const name = Array.from(normalized).slice(0, 180).join('') || fallback;
  const ascii = name.replace(/[^\x20-\x7e]/g, '_');
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return { ascii, encoded };
}

export function crmMediaHeaders(input: {
  mimeType: string | null;
  type: string;
  filename: string | null;
  download: boolean;
}) {
  const mimeType = (input.mimeType || '').split(';', 1)[0].trim().toLowerCase();
  const canRenderInline = INLINE_MEDIA_TYPES.has(mimeType);
  const fallback = input.type === 'image' ? 'imagem-whatsapp'
    : input.type === 'audio' ? 'audio-whatsapp'
      : input.type === 'video' ? 'video-whatsapp' : 'arquivo-whatsapp';
  const { ascii, encoded } = filenames(input.filename, fallback);
  const mode = input.download || !canRenderInline ? 'attachment' : 'inline';

  return new Headers({
    'Content-Type': canRenderInline ? mimeType : 'application/octet-stream',
    'Content-Disposition': `${mode}; filename="${ascii}"; filename*=UTF-8''${encoded}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    // Attachments are untrusted documents even when a media/PDF preview is allowed.
    // No allow-scripts or allow-same-origin: a document cannot access the CRM session.
    'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
}
