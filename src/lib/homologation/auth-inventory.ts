import { createHash } from 'node:crypto';

/** Canonical audited Auth fields; no passwords, tokens, MFA or user_metadata. */
export function authInventorySha256(users: readonly Record<string, unknown>[]) {
  const fields = ['id','email','authRole','isAnonymous','deletedAt','bannedUntil','emailConfirmedAt',
    'organizationId','appRole','loginVerifiedAt','getUserVerifiedAt','logoutVerifiedAt'];
  const normalized = users.map(user => Object.fromEntries(fields.map(field => [field,user[field]])))
    .sort((a,b) => String(a.id).localeCompare(String(b.id)));
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
