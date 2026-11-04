// Test-only contract data. Never an Ed25519 receipt or installation evidence.
import { createHash } from 'node:crypto';
import { authInventorySha256 } from '../../src/lib/homologation/auth-inventory.ts';
export const key = Buffer.from('302a300506032b6570032100d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', 'hex').toString('base64');
export const fixtureSignature = payload => Buffer.from('contract-fixture:' + createHash('sha256').update(payload).digest('hex'));
export const cryptoStub = `export { createPublicKey, createHash } from 'crypto'; import {createHash} from 'crypto'; export function verify(_algorithm,payload,_key,signature){return signature.equals(Buffer.from('contract-fixture:'+createHash('sha256').update(payload).digest('hex')))}`;
export const cryptoRuntime = `require('node:crypto').verify=(_algorithm,payload,_key,signature)=>signature.equals(Buffer.from('contract-fixture:'+require('node:crypto').createHash('sha256').update(payload).digest('hex')));`;
export function fixtureReceipt(value) {
  const payload = Buffer.from(JSON.stringify(value));
  return { payload: payload.toString('base64url'), signature: fixtureSignature(payload).toString('base64url') };
}
export function authAudit() {
  const observedAt = new Date().toISOString();
  const result = {source:'supabase-auth-admin-api',supabaseProjectRef:'okhtfibuexfsgkobjxtu',paginationComplete:true,
    observedAt,expiresAt:new Date(Date.now()+60000).toISOString(),inventorySha256:'b'.repeat(64),
    users:Array.from({length:7},(_,i)=>({id:`00000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`,
      email:`fixture${i}@bossa-homolog.invalid`,authRole:'authenticated',isAnonymous:false,deletedAt:null,bannedUntil:null,
      emailConfirmedAt:observedAt,organizationId:`00000000-0000-0000-0000-${String(i<3?101:102).padStart(12,'0')}`,
      appRole:['admin','comercial','viewer'][i%3],loginVerifiedAt:observedAt,getUserVerifiedAt:observedAt,logoutVerifiedAt:observedAt}))};
  result.inventorySha256=authInventorySha256(result.users);return result;
}
export function databaseAudit() {
  return {source:'supabase-reviewed-sql-read',observedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),
    catalogFingerprint:'c'.repeat(32),migrations:Array.from({length:22},(_,i)=>({version:String(i+1),sha256:'d'.repeat(64)})),
    memberships:authAudit().users.map(({id,organizationId,appRole})=>({id,organizationId,appRole})),
    emptyRelations:[{name:'public.whatsapp_connections',count:0}]};
}
