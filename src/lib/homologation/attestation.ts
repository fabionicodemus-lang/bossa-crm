import { createPublicKey, verify } from 'node:crypto';
import { inspectConfiguration, REMOTE_SUPABASE_REF, REMOTE_VERCEL_PROJECT, type Environment } from './policy';

export const PLATFORM_CHECKS = [
  'networkEgressRestricted', 'externalIntegrationsDisabled', 'cronDisabled', 'webhooksDisabled',
  'authEmailDisabled', 'functionsDisabled', 'storageEffectsDisabled',
] as const;

// Signed by an offline reviewer, never by the deployed application or the database.
// The verification key is pinned in the build; the receipt binds this exact deployment.
export type PlatformReceipt = { payload: string; signature: string };
export function hasRemotePlatformAttestation(env: Environment, receipt?: PlatformReceipt) {
  try {
    const config = inspectConfiguration(env);
    if (!config.remote || config.blockers.length) return false;
    const payload = receipt?.payload ?? '';
    const signature = receipt?.signature ?? '';
    if (typeof payload !== 'string' || typeof signature !== 'string' || !payload || payload.length > 12000 || !signature || signature.length > 200) return false;
    const key = createPublicKey({ key: Buffer.from(env.BOSSA_HOMOLOGATION_ATTESTATION_PUBLIC_KEY!, 'base64'), format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ed25519' || !verify(null, Buffer.from(payload, 'base64url'), key, Buffer.from(signature, 'base64url'))) return false;
    const proof = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const issued = Date.parse(proof.issuedAt), expires = Date.parse(proof.expiresAt), now = Date.now();
    return proof.contractVersion === 1 && proof.environmentId === config.environmentId
      && proof.vercelProjectId === REMOTE_VERCEL_PROJECT && proof.supabaseProjectRef === REMOTE_SUPABASE_REF
      && proof.deploymentId === env.VERCEL_DEPLOYMENT_ID && proof.deploymentOrigin === config.deploymentOrigin
      && proof.commit === config.commit && typeof proof.evidenceSha256 === 'string' && /^[a-f0-9]{64}$/.test(proof.evidenceSha256)
      && typeof proof.issuedAt === 'string' && typeof proof.expiresAt === 'string'
      && Number.isFinite(issued) && Number.isFinite(expires) && issued <= now + 5000
      && expires > now && expires > issued && expires - issued <= 86400000
      && PLATFORM_CHECKS.every(check => proof.checks?.[check] === true);
  } catch {
    return false;
  }
}
