import crypto from 'node:crypto';

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

function encryptionKey() {
  const key = Buffer.from(required('WHATSAPP_TOKEN_ENCRYPTION_KEY_BASE64'), 'base64');
  if (key.length !== 32) {
    throw new Error('WHATSAPP_TOKEN_ENCRYPTION_KEY_BASE64 deve representar 32 bytes.');
  }
  return key;
}

export function encryptToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptToken(payload: string) {
  const [ivRaw, tagRaw, dataRaw] = payload.split('.');
  if (!ivRaw || !tagRaw || !dataRaw) throw new Error('Token criptografado inválido.');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivRaw, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function hashRegistrationPin(pin: string) {
  return crypto.createHmac('sha256', encryptionKey()).update(pin, 'utf8').digest('hex');
}

export function verifyMetaSignature(rawBody: string, header: string | null) {
  if (!header?.startsWith('sha256=')) return false;
  const received = header.slice('sha256='.length).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(received)) return false;
  const expected = crypto
    .createHmac('sha256', required('META_APP_SECRET'))
    .update(rawBody, 'utf8')
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
}
