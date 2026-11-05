import type { SupabaseClient } from '@supabase/supabase-js';

/** Auth credentials belong to a user, not to one of their organizations.
 * Use the server's admin client: the caller's RLS view hides other memberships.
 * Two rows are enough to reject a shared account because membership pairs are unique.
 */
export async function globalAccountManagementScope(
  admin: Pick<SupabaseClient, 'from'>,
  organizationId: string,
  targetUserId: string,
): Promise<'allowed' | 'outside_scope' | 'unavailable'> {
  const { data, error } = await admin
    .from('memberships')
    .select('organization_id')
    .eq('user_id', targetUserId)
    .limit(2);

  if (error) return 'unavailable';
  if (!Array.isArray(data) || data.length !== 1 || data[0].organization_id !== organizationId) {
    return 'outside_scope';
  }
  return 'allowed';
}

/** Password links must never copy an attacker-controlled Host/forwarded header. */
export function crmAccountOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'https:' && !url.username && !url.password) {
        if (process.env.VERCEL_ENV === 'production' && url.hostname.endsWith('.vercel.app')) {
          return 'https://crm.bossaempreendimentos.com.br';
        }
        return url.origin;
      }
    } catch {
      // A malformed deployment setting cannot produce a recovery link.
    }
  }
  return 'https://crm.bossaempreendimentos.com.br';
}
