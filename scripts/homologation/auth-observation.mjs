// Operator-side read-only collector. Never imported by the deployed application.
// It does not sign, install, write remotely or turn an observation into approval.
import { authInventorySha256 } from '../../src/lib/homologation/auth-inventory.ts';
import { preflightAdminHeaders } from '../../src/lib/homologation/admin-headers.ts';
const origin = 'https://okhtfibuexfsgkobjxtu.supabase.co';
export async function collectAuthObservation({ key, expectedUsers, loginObservations, transport = fetch, now = Date.now() }) {
  if (!Array.isArray(expectedUsers) || expectedUsers.length !== 7 || !Array.isArray(loginObservations)) throw Error('AUTH_REFERENCE_REQUIRED');
  const expected = new Map(expectedUsers.map(u=>[u.id,u]));
  if (expected.size !== 7 || [...expected.keys()].some(id=>typeof id!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) throw Error('AUTH_REFERENCE_REQUIRED');
  const headers = preflightAdminHeaders(key,true);
  const read = async path => {
    const response = await transport(origin+path,{method:'GET',headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000)});
    if (!response.ok) throw Error('AUTH_OBSERVATION_UNAVAILABLE');
    return response.json();
  };
  const inventory = new Map(); let complete = false;
  for (let page=1;page<=100;page++) {
    const data = await read(`/auth/v1/admin/users?page=${page}&per_page=100`);
    if (!Array.isArray(data.users)) throw Error('AUTH_INVENTORY_INCOMPLETE');
    if (!data.users.length) {complete=true;break;}
    for (const user of data.users) {
      if (!user.id || inventory.has(user.id) || !expected.has(user.id)) throw Error('AUTH_INVENTORY_MISMATCH');
      inventory.set(user.id,user);
    }
  }
  if (!complete || inventory.size !== 7) throw Error('AUTH_INVENTORY_INCOMPLETE');
  const users = [];
  let expires = now+900000;
  for (const [id, reference] of expected) {
    const response = await read(`/auth/v1/admin/users/${encodeURIComponent(id)}`);
    const user = response.user ?? response;
    const observation = loginObservations.find(o=>o.userId===id);
    const verified = Date.parse(observation?.checkedAt);
    if (user.id !== id || user.email !== reference.email || !/^[^\s@]+@bossa-homolog\.invalid$/.test(user.email)
      || user.role !== 'authenticated' || user.is_anonymous !== false || user.deleted_at || user.banned_until
      || !Number.isFinite(Date.parse(user.email_confirmed_at)) || Date.parse(user.email_confirmed_at)>now
      || !Number.isFinite(verified) || verified>now || now-verified>=900000
      || observation.loginStatus!==200 || observation.userStatus!==200 || observation.logoutStatus!==204
      || observation.identityMatches!==true) throw Error('AUTH_USER_OBSERVATION_REJECTED');
    const at = new Date(verified).toISOString(); expires=Math.min(expires,verified+900000);
    users.push({id,email:user.email,authRole:user.role,isAnonymous:user.is_anonymous,deletedAt:user.deleted_at??null,bannedUntil:user.banned_until??null,
      emailConfirmedAt:user.email_confirmed_at,organizationId:reference.organizationId,appRole:reference.appRole,
      loginVerifiedAt:at,getUserVerifiedAt:at,logoutVerifiedAt:at});
  }
  users.sort((a,b)=>a.id.localeCompare(b.id));
  return {source:'supabase-auth-admin-api',supabaseProjectRef:'okhtfibuexfsgkobjxtu',paginationComplete:complete,
    observedAt:new Date(now).toISOString(),expiresAt:new Date(expires).toISOString(),
    inventorySha256:authInventorySha256(users),users};
}
