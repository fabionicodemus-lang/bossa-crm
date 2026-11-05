// Only the adapters are replaced. The tests import and execute the real routes,
// HMAC verifier and security helpers with synthetic records and no network.
export { NextResponse, NextRequest } from 'next/server.js';

function state() {
  if (!globalThis.__crmSecurityTest) throw new Error('Synthetic CRM test state is missing');
  return globalThis.__crmSecurityTest;
}
export async function createClient() { return state().session; }
export function createServerClient() { return { auth: { getClaims: async () => ({ data: { claims: state().proxyClaims || null }, error: null }) } }; }
export function createAdminClient() { state().adminCalls += 1; return state().admin; }
export async function getCurrentContext() { return state().context; }
export function after(callback) { state().after.push(callback); }
export async function dispatchWebhookEvent(...args) { state().dispatches.push(args); }
export async function findAgendaConflicts(input) { state().agendaConflictReads.push(input); return []; }
export async function pushMicrosoftEvent(event) { state().agendaSyncs.push(event); return 'not_connected'; }
export async function deleteMicrosoftEvent(event) { state().agendaDeletes.push(event); }
export async function transcribeAudio(input) { state().transcriptions.push(input); return { text: 'Transcrição sintética.', model: 'synthetic-model' }; }
export async function findChannelById(_admin, organizationId, channelId) {
  const current = state();
  current.channelReads.push({ organizationId, channelId });
  return current.channels.find((row) => row.organization_id === organizationId && row.id === channelId) || null;
}
export function channelAccess() { return { accessToken: 'synthetic-meta-token' }; }
export async function fetchMetaMedia(id, token, options) {
  const current = state();
  current.mediaReads.push({ id, token, options });
  return {
    descriptor: { mime_type: current.media.mimeType },
    response: new Response(current.media.bytes, {
      status: current.media.status || 200,
      headers: { 'content-type': current.media.mimeType, ...(current.media.headers || {}) },
    }),
  };
}
