/** Opaque API keys are not JWTs. Never put sb_secret_ in Authorization. */
export function preflightAdminHeaders(key: string, remote: boolean): Headers {
  const headers = new Headers({ apikey: key, 'content-type': 'application/json' });
  if (/^sb_secret_[A-Za-z0-9_-]{16,}$/.test(key)) return headers;
  if (remote) {
    const parts = key.split('.');
    if (parts.length !== 3 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) throw new Error('HOMOLOGATION_ADMIN_CREDENTIAL_REQUIRED');
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (claims.role !== 'service_role') throw new Error('HOMOLOGATION_ADMIN_CREDENTIAL_REQUIRED');
  }
  // Legacy service_role JWTs still require a Bearer token; the server validates it.
  headers.set('authorization', `Bearer ${key}`);
  return headers;
}
