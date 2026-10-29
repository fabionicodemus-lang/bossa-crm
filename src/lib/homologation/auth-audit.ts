import { REMOTE_SUPABASE_REF } from './policy';
import { authInventorySha256 } from './auth-inventory';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const roles = ['admin', 'comercial', 'viewer'];
const timestamp = (v: unknown) => typeof v === 'string' ? Date.parse(v) : NaN;

export function validDatabaseAudit(value: unknown, now = Date.now()): boolean {
  if (!value || typeof value !== 'object') return false;
  const audit = value as Record<string, unknown>;
  const observed = timestamp(audit.observedAt), expires = timestamp(audit.expiresAt);
  if (audit.source !== 'supabase-reviewed-sql-read' || !Number.isFinite(observed) || !Number.isFinite(expires)
    || observed > now + 5000 || expires <= now || expires <= observed || expires - observed > 900000
    || typeof audit.catalogFingerprint !== 'string' || !/^[a-f0-9]{32}$/.test(audit.catalogFingerprint)
    || !Array.isArray(audit.migrations) || audit.migrations.length !== 22
    || !Array.isArray(audit.emptyRelations) || !audit.emptyRelations.length) return false;
  const versions = new Set<string>(), relations = new Set<string>();
  for (const migration of audit.migrations) {
    if (!migration || typeof migration.version !== 'string' || !/^\d+$/.test(migration.version)
      || versions.has(migration.version) || !/^[a-f0-9]{64}$/.test(migration.sha256)) return false;
    versions.add(migration.version);
  }
  for (const relation of audit.emptyRelations) {
    if (!relation || typeof relation.name !== 'string' || !/^[a-z_]+\.[a-z_]+$/.test(relation.name)
      || relations.has(relation.name) || relation.count !== 0) return false;
    relations.add(relation.name);
  }
  return true;
}

/** Bind the Auth inventory to independently observed SQL memberships, never user_metadata. */
export function authMembershipsMatch(auth: { users?: unknown }, database: { memberships?: unknown }): boolean {
  if (!Array.isArray(auth.users) || !Array.isArray(database.memberships)) return false;
  const normalize = (rows: Record<string, unknown>[]) => rows.map(u => JSON.stringify([u.id,u.organizationId,u.appRole])).sort();
  return JSON.stringify(normalize(auth.users)) === JSON.stringify(normalize(database.memberships));
}

/** Structural/freshness checks only. Caller MUST verify the enclosing signature. */
export function validAuthAudit(value: unknown, now = Date.now()): boolean {
  if (!value || typeof value !== 'object') return false;
  const audit = value as Record<string, unknown>;
  const observed = timestamp(audit.observedAt), expires = timestamp(audit.expiresAt);
  if (audit.source !== 'supabase-auth-admin-api' || audit.supabaseProjectRef !== REMOTE_SUPABASE_REF
    || audit.paginationComplete !== true || !Array.isArray(audit.users) || audit.users.length !== 7
    || !Number.isFinite(observed) || !Number.isFinite(expires) || observed > now + 5000
    || expires <= now || expires <= observed || expires - observed > 900000
    || typeof audit.inventorySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(audit.inventorySha256)) return false;
  const ids = new Set<string>(), organizations = new Map<string, Set<string>>();
  for (const item of audit.users) {
    if (!item || typeof item !== 'object') return false;
    const user = item as Record<string, unknown>;
    if (typeof user.id !== 'string' || !uuid.test(user.id) || ids.has(user.id)
      || typeof user.email !== 'string' || !/^[^\s@]+@bossa-homolog\.invalid$/.test(user.email)
      || user.authRole !== 'authenticated' || user.isAnonymous !== false
      || user.deletedAt !== null || user.bannedUntil !== null
      || !Number.isFinite(timestamp(user.emailConfirmedAt)) || timestamp(user.emailConfirmedAt) > observed
      || typeof user.organizationId !== 'string' || !uuid.test(user.organizationId)
      || typeof user.appRole !== 'string' || !roles.includes(user.appRole)) return false;
    // These observations come from real login/getUser/logout, reviewed offline.
    for (const key of ['loginVerifiedAt', 'getUserVerifiedAt', 'logoutVerifiedAt']) {
      const at = timestamp(user[key]);
      if (!Number.isFinite(at) || at > observed || observed - at > 900000) return false;
    }
    ids.add(user.id);
    const found = organizations.get(user.organizationId) ?? new Set<string>();
    found.add(user.appRole); organizations.set(user.organizationId, found);
  }
  return organizations.size === 2 && [...organizations.values()].every(found => roles.every(role => found.has(role)))
    && audit.inventorySha256 === authInventorySha256(audit.users);
}
