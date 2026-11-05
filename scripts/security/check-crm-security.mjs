// Run: node --experimental-strip-types --experimental-loader ./scripts/security/crm-security-loader.mjs scripts/security/check-crm-security.mjs
// Real HTTP handlers, real HMAC, real Response/Headers and in-memory scoped data.
// This is local regression coverage, not a production penetration test.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import * as invite from '../../src/app/api/users/invite/route.ts';
import * as password from '../../src/app/api/users/reset-password/route.ts';
import * as passwordLink from '../../src/app/api/users/password-link/route.ts';
import * as webhook from '../../src/app/api/meta/whatsapp/webhook/route.ts';
import * as media from '../../src/app/api/messages/[id]/media/route.ts';
import * as transcribe from '../../src/app/api/messages/[id]/transcribe/route.ts';
import * as agenda from '../../src/app/api/agenda/route.ts';
import { crmMediaHeaders } from '../../src/lib/security/crm-media-headers.ts';
import { crmAccountOrigin } from '../../src/lib/security/crm-user-access.ts';
import { updateSession } from '../../src/lib/supabase/proxy.ts';
import { NextRequest } from 'next/server.js';

const savedEnv = { META_APP_SECRET: process.env.META_APP_SECRET, NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL, VERCEL_ENV: process.env.VERCEL_ENV };
const savedFetch = globalThis.fetch;
const savedConsoleError = console.error;
const syntheticSecret = 'local-regression-hmac-only';
process.env.META_APP_SECRET = syntheticSecret;
delete process.env.NEXT_PUBLIC_APP_URL;
let blockedNetwork = 0;
globalThis.fetch = async () => { blockedNetwork += 1; throw new Error('Network is forbidden in this security regression'); };
let passed = 0;

function databaseClient(current, kind) {
  return {
    auth: kind === 'session' ? { getUser: async () => ({ data: { user: current.user }, error: null }) } : {
      admin: {
        getUserById: async (id) => ({ data: { user: current.authAccounts[id] || null }, error: null }),
        inviteUserByEmail: async (...args) => { current.authWrites.push({ method: 'inviteUserByEmail', args }); return { data: {}, error: null }; },
        updateUserById: async (...args) => { current.authWrites.push({ method: 'updateUserById', args }); return { data: {}, error: null }; },
        generateLink: async (...args) => {
          current.authWrites.push({ method: 'generateLink', args });
          const user = current.generatedUser || Object.values(current.authAccounts).find((item) => item.email === args[0].email) || null;
          current.afterGenerate?.(user);
          return { data: { user, properties: { hashed_token: 'synthetic-recovery-hash' } }, error: null };
        },
      },
    },
    storage: { from: (bucket) => ({ download: async (path) => {
      current.storageReads.push({ bucket, path });
      return { data: new Blob([current.media.bytes], { type: current.media.mimeType }), error: null };
    } }) },
    from(table) {
      const filters = [];
      let mode = 'select', values, rowLimit = Infinity, single = false, selected = '*';
      const query = {
        select(columns) { selected = columns; return query; },
        eq(column, value) { filters.push([column, 'eq', value]); return query; },
        is(column, value) { filters.push([column, 'eq', value]); return query; },
        limit(value) { rowLimit = value; return query; },
        maybeSingle() { single = true; return query; },
        single() { single = true; return query; },
        insert(value) { mode = 'insert'; values = value; return query; },
        upsert(value) { mode = 'upsert'; values = value; return query; },
        update(value) { mode = 'update'; values = value; return query; },
        delete() { mode = 'delete'; return query; },
        then(resolve, reject) {
          const operation = { client: kind, table, mode, filters, selected, rowLimit };
          current.queries.push(operation);
          if (current.fail?.client === kind && current.fail.table === table) {
            return Promise.resolve({ data: null, error: { message: 'Synthetic database unavailable' } }).then(resolve, reject);
          }
          let rows = structuredClone(current.tables[table] || []);
          // A session cannot see the victim's other organization. This models the
          // reason password scope must be checked with the trusted admin client.
          if (kind === 'session' && table === 'memberships') rows = rows.filter((row) => row.organization_id === 'org-a');
          rows = rows.filter((row) => filters.every(([column, , value]) => row[column] === value));
          if (mode !== 'select') {
            current.writes.push({ ...operation, values });
            if (mode === 'insert' || mode === 'upsert') {
              const inserted = (Array.isArray(values) ? values : [values]).map((row, i) => ({ id: `inserted-${i}`, ...row }));
              current.tables[table] = [...(current.tables[table] || []), ...inserted];
              rows = inserted;
            } else if (mode === 'update') {
              const matching = new Set(rows.map((row) => row.id));
              current.tables[table] = current.tables[table].map((row) => matching.has(row.id) ? { ...row, ...values } : row);
              rows = rows.map((row) => ({ ...row, ...values }));
            }
          }
          rows = rows.slice(0, rowLimit);
          return Promise.resolve({ data: single ? rows[0] || null : rows, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

function fixture(options = {}) {
  const current = {
    user: { id: 'admin-a' },
    context: { userId: 'admin-a', role: 'admin', organization: { id: 'org-a' } },
    tables: {
      memberships: [{ id: 'membership-admin', user_id: 'admin-a', organization_id: 'org-a', role: 'admin' }],
      profiles: [], pending_invites: [], messages: [], whatsapp_messages: [], ai_files: [], leads: [], agenda_events: [],
    },
    channels: [{ id: 'channel-a', organization_id: 'org-a' }],
    media: { mimeType: 'application/pdf', bytes: '%PDF-1.7 synthetic test document' },
    adminCalls: 0, authAccounts: {}, authWrites: [], writes: [], queries: [], after: [], dispatches: [], logs: [],
    mediaReads: [], storageReads: [], channelReads: [], ...options,
    agendaConflictReads: [], agendaSyncs: [], agendaDeletes: [], transcriptions: [],
  };
  current.session = databaseClient(current, 'session');
  current.admin = databaseClient(current, 'admin');
  globalThis.__crmSecurityTest = current;
  console.error = (...args) => { current.logs.push(args.join(' ')); };
  return current;
}
function target(current, organizations) {
  current.tables.profiles.push({ id: 'target-user', email: 'target@example.invalid' });
  current.authAccounts['target-user'] = { id: 'target-user', email: 'target@example.invalid' };
  for (const organization_id of organizations) {
    current.tables.memberships.push({ id: `target-${organization_id}`, user_id: 'target-user', organization_id, role: 'comercial' });
  }
}
function request(path, body, headers = {}, method = 'POST') {
  return new Request(`https://crm.bossaempreendimentos.com.br${path}`, {
    method, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
}
function params(id = 'message-a') { return { params: Promise.resolve({ id }) }; }
function documentMessage(current, { mimeType = 'application/pdf', type = 'document', filename = 'arquivo.pdf', organizationId = 'org-a', aiFile = false } = {}) {
  current.media.mimeType = mimeType;
  current.tables.messages.push({ id: 'message-a', organization_id: organizationId, whatsapp_channel_id: 'channel-a', raw_payload: aiFile
    ? { crm: { ai_file_id: 'file-a', mime_type: mimeType, original_name: filename } }
    : { type, [type]: { id: 'meta-media-a', mime_type: mimeType, filename } } });
  if (aiFile) current.tables.ai_files.push({ id: 'file-a', organization_id: organizationId, storage_bucket: 'ai-files', storage_path: 'org-a/file-a', original_name: filename, mime_type: mimeType });
}
function agendaPayload(overrides = {}) {
  return {
    title: 'Visita sintética', assigned_to: 'admin-a', event_type: 'visita', meeting_mode: 'presencial',
    starts_at: '2030-11-05T13:00:00Z', ends_at: '2030-11-05T14:00:00Z', ...overrides,
  };
}
function agendaEvent(current, overrides = {}) {
  const event = { id: 'event-a', organization_id: 'org-a', lead_id: null, status: 'scheduled',
    microsoft_event_id: null, microsoft_sync_status: 'not_connected', ...agendaPayload(), ...overrides };
  current.tables.agenda_events.push(event);
  return event;
}
function assertNoWrites(current) {
  assert.equal(current.writes.length, 0);
  assert.equal(current.authWrites.length, 0);
}
async function test(name, run) {
  await run();
  passed += 1;
  process.stdout.write(`PASS ${name}\n`);
}

try {
  await test('invite cannot attach an existing account from another organization', async () => {
    const current = fixture(); target(current, ['org-b']);
    const response = await invite.POST(request('/api/users/invite', { email: 'target@example.invalid', role: 'admin' }));
    assert.equal(response.status, 409); assertNoWrites(current);
  });
  await test('invite also requires consent for an existing account without membership', async () => {
    const current = fixture(); target(current, []);
    assert.equal((await invite.POST(request('/api/users/invite', { email: 'target@example.invalid' }))).status, 409);
    assertNoWrites(current);
  });
  await test('re-inviting a member is harmless and cannot silently change their role', async () => {
    const current = fixture(); target(current, ['org-a']);
    assert.equal((await invite.POST(request('/api/users/invite', { email: 'target@example.invalid', role: 'admin' }))).status, 200);
    assertNoWrites(current); assert.equal(current.tables.memberships.at(-1).role, 'comercial');
  });
  await test('new-user invitation remains functional and uses the canonical callback', async () => {
    const current = fixture();
    const response = await invite.POST(request('/api/users/invite', { email: 'new@example.invalid', role: 'comercial' }, { 'x-forwarded-host': 'hostile.invalid' }));
    assert.equal(response.status, 200);
    assert.equal(current.writes[0].table, 'pending_invites');
    assert.equal(current.authWrites[0].method, 'inviteUserByEmail');
    assert.equal(current.authWrites[0].args[1].redirectTo, 'https://crm.bossaempreendimentos.com.br/auth/callback?next=/atualizar-senha');
  });
  await test('invite fails closed if identity lookup is unavailable', async () => {
    const current = fixture({ fail: { client: 'admin', table: 'profiles' } });
    assert.equal((await invite.POST(request('/api/users/invite', { email: 'target@example.invalid' }))).status, 503);
    assertNoWrites(current);
  });
  for (const organizations of [['org-b'], ['org-a', 'org-b'], []]) {
    await test(`password reset rejects account scope ${organizations.join('+') || 'none'}`, async () => {
      const current = fixture(); target(current, organizations);
      const response = await password.POST(request('/api/users/reset-password', { userId: 'target-user', password: 'synthetic-password-123' }));
      assert.equal(response.status, 403); assertNoWrites(current);
      assert.ok(current.queries.some((query) => query.client === 'admin' && query.table === 'memberships' && query.rowLimit === 2));
    });
  }
  await test('password reset is preserved for an account exclusively in the current company', async () => {
    const current = fixture(); target(current, ['org-a']);
    const response = await password.POST(request('/api/users/reset-password', { userId: 'target-user', password: 'synthetic-password-123' }));
    assert.equal(response.status, 200);
    assert.deepEqual(current.authWrites.map((item) => item.method), ['updateUserById']);
    assert.equal(current.authWrites[0].args[0], 'target-user');
  });
  await test('password reset fails closed if global membership lookup is unavailable', async () => {
    const current = fixture({ fail: { client: 'admin', table: 'memberships' } }); target(current, ['org-a']);
    assert.equal((await password.POST(request('/api/users/reset-password', { userId: 'target-user', password: 'synthetic-password-123' }))).status, 503);
    assertNoWrites(current);
  });
  for (const organizations of [['org-b'], ['org-a', 'org-b'], []]) {
    await test(`password link rejects account scope ${organizations.join('+') || 'none'}`, async () => {
      const current = fixture(); target(current, organizations);
      assert.equal((await passwordLink.POST(request('/api/users/password-link', { email: 'target@example.invalid' }))).status, 403);
      assertNoWrites(current);
    });
  }
  await test('password link ignores forged forwarded headers', async () => {
    const current = fixture(); target(current, ['org-a']);
    const response = await passwordLink.POST(request('/api/users/password-link', { email: 'target@example.invalid' }, { 'x-forwarded-host': 'hostile.invalid', 'x-forwarded-proto': 'https', host: 'hostile.invalid' }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(new URL(result.link).origin, 'https://crm.bossaempreendimentos.com.br');
    assert.deepEqual(current.authWrites.map((item) => item.method), ['generateLink']);
  });
  await test('password link cannot use an edited profile email to target a different Auth identity', async () => {
    const current = fixture(); target(current, ['org-a']);
    current.authAccounts['target-user'].email = 'different-auth-account@example.invalid';
    assert.equal((await passwordLink.POST(request('/api/users/password-link', { email: 'target@example.invalid' }))).status, 403);
    assertNoWrites(current);
  });
  await test('production recovery links do not point at protected legacy Vercel aliases', async () => {
    const oldOrigin = process.env.NEXT_PUBLIC_APP_URL, oldEnvironment = process.env.VERCEL_ENV;
    try {
      process.env.NEXT_PUBLIC_APP_URL = 'https://bossa-crm-phi.vercel.app';
      process.env.VERCEL_ENV = 'production';
      assert.equal(crmAccountOrigin(), 'https://crm.bossaempreendimentos.com.br');
      process.env.VERCEL_ENV = 'preview';
      assert.equal(crmAccountOrigin(), 'https://bossa-crm-phi.vercel.app');
    } finally {
      if (oldOrigin === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = oldOrigin;
      if (oldEnvironment === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = oldEnvironment;
    }
  });
  await test('pending invitation link remains available only inside the current organization', async () => {
    const current = fixture();
    current.tables.pending_invites.push({ id: 'invite-a', organization_id: 'org-a', email: 'pending@example.invalid', accepted_at: null });
    current.generatedUser = { id: 'pending-auth-user', email: 'pending@example.invalid' };
    // The real database Auth trigger accepts the invitation on user creation.
    current.afterGenerate = (user) => current.tables.memberships.push({ id: 'pending-member', user_id: user.id, organization_id: 'org-a', role: 'comercial' });
    assert.equal((await passwordLink.POST(request('/api/users/password-link', { email: 'pending@example.invalid' }))).status, 200);
    assert.equal(current.authWrites[0].args[0].type, 'invite');
    const foreign = fixture();
    foreign.tables.pending_invites.push({ id: 'invite-b', organization_id: 'org-b', email: 'pending@example.invalid', accepted_at: null });
    assert.equal((await passwordLink.POST(request('/api/users/password-link', { email: 'pending@example.invalid' }))).status, 404);
    assertNoWrites(foreign);
  });
  await test('pending invitation cannot expose a token for a foreign Auth identity hidden by profile lookup', async () => {
    const current = fixture();
    current.tables.pending_invites.push({ id: 'invite-a', organization_id: 'org-a', email: 'pending@example.invalid', accepted_at: null });
    current.generatedUser = { id: 'foreign-auth-user', email: 'pending@example.invalid' };
    current.tables.memberships.push({ id: 'foreign-member', user_id: 'foreign-auth-user', organization_id: 'org-b', role: 'comercial' });
    const response = await passwordLink.POST(request('/api/users/password-link', { email: 'pending@example.invalid' }));
    assert.equal(response.status, 403); assert.doesNotMatch(await response.text(), /synthetic-recovery-hash|token_hash|\"link\"/);
  });
  await test('pending invitation token is withheld until its own-company membership exists', async () => {
    const current = fixture();
    current.tables.pending_invites.push({ id: 'invite-a', organization_id: 'org-a', email: 'pending@example.invalid', accepted_at: null });
    current.generatedUser = { id: 'pending-auth-user', email: 'pending@example.invalid' };
    const response = await passwordLink.POST(request('/api/users/password-link', { email: 'pending@example.invalid' }));
    assert.equal(response.status, 403); assert.doesNotMatch(await response.text(), /synthetic-recovery-hash|token_hash|\"link\"/);
  });
  await test('recovery result must match the scoped user ID even if its email matches', async () => {
    const current = fixture(); target(current, ['org-a']);
    current.generatedUser = { id: 'different-auth-user', email: 'target@example.invalid' };
    const response = await passwordLink.POST(request('/api/users/password-link', { email: 'target@example.invalid' }));
    assert.equal(response.status, 403); assert.doesNotMatch(await response.text(), /synthetic-recovery-hash|token_hash|\"link\"/);
  });
  for (const route of [invite, password, passwordLink]) {
    await test('user-management route rejects an unauthenticated request before admin access', async () => {
      const current = fixture({ user: null });
      assert.equal((await route.POST(request('/api/users/test', {}))).status, 401);
      assert.equal(current.adminCalls, 0); assertNoWrites(current);
    });
    await test('user-management route rejects a non-admin before global account access', async () => {
      const current = fixture(); current.tables.memberships[0].role = 'viewer';
      assert.equal((await route.POST(request('/api/users/test', {}))).status, 403);
      assert.equal(current.adminCalls, 0); assertNoWrites(current);
    });
  }
  await test('missing webhook signature is rejected without reading or storing the body', async () => {
    const current = fixture(); let reads = 0;
    const input = request('/api/meta/whatsapp/webhook', { sentinel: 'untrusted-secret-marker' });
    input.text = async () => { reads += 1; throw new Error('Body must not be read'); };
    assert.equal((await webhook.POST(input)).status, 401);
    assert.equal(reads, 0); assert.equal(current.adminCalls, 0); assertNoWrites(current);
  });
  await test('forged HMAC never writes payloads or includes them in logs', async () => {
    const current = fixture();
    assert.equal((await webhook.POST(request('/api/meta/whatsapp/webhook', { sentinel: 'untrusted-secret-marker' }, { 'x-hub-signature-256': `sha256=${'0'.repeat(64)}` }))).status, 401);
    assert.equal(current.adminCalls, 0); assertNoWrites(current);
    assert.equal(current.logs.some((line) => line.includes('untrusted-secret-marker')), false);
  });
  await test('valid signed webhook still queues and dispatches its changes', async () => {
    const current = fixture();
    const payload = { object: 'whatsapp_business_account', entry: [{ id: 'entry-a', changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'synthetic-phone-id' } } }] }] };
    const body = JSON.stringify(payload);
    const signature = `sha256=${createHmac('sha256', syntheticSecret).update(body).digest('hex')}`;
    const response = await webhook.POST(request('/api/meta/whatsapp/webhook', payload, { 'x-hub-signature-256': signature }));
    assert.equal(response.status, 200); assert.equal(current.writes.length, 1);
    assert.equal(current.writes[0].table, 'whatsapp_webhook_events');
    assert.equal(current.writes[0].values[0].signature_valid, true);
    assert.equal(current.after.length, 1);
    await current.after[0]();
    assert.deepEqual(current.dispatches[0], ['inserted-0', 'messages', 'synthetic-phone-id']);
  });
  await test('missing webhook verification secret fails closed without database access', async () => {
    const current = fixture(); delete process.env.META_APP_SECRET;
    try {
      assert.equal((await webhook.POST(request('/api/meta/whatsapp/webhook', { sentinel: 'untrusted-secret-marker' }, { 'x-hub-signature-256': `sha256=${'0'.repeat(64)}` }))).status, 503);
      assert.equal(current.adminCalls, 0); assertNoWrites(current);
      assert.equal(current.logs.some((line) => line.includes('untrusted-secret-marker')), false);
    } finally { process.env.META_APP_SECRET = syntheticSecret; }
  });
  for (const mimeType of ['text/html', 'application/xhtml+xml', 'image/svg+xml', 'application/javascript', 'application/x-unknown', 'bad\nheader']) {
    await test(`untrusted attachment ${mimeType.replaceAll('\n', ' ')} is downloaded in a sandbox`, async () => {
      const headers = crmMediaHeaders({ mimeType, type: 'document', filename: 'anexo', download: false });
      assert.equal(headers.get('content-type'), 'application/octet-stream');
      assert.ok(headers.get('content-disposition').startsWith('attachment;'));
      assert.equal(headers.get('x-content-type-options'), 'nosniff');
      assert.ok(headers.get('content-security-policy').startsWith('sandbox;'));
      assert.doesNotMatch(headers.get('content-security-policy'), /allow-scripts|allow-same-origin/);
    });
  }
  for (const [mimeType, type, filename] of [['application/pdf', 'document', 'proposta.pdf'], ['image/png', 'image', 'planta.png'], ['audio/ogg; codecs=opus', 'audio', 'audio.ogg'], ['video/mp4', 'video', 'video.mp4']]) {
    await test(`real media route preserves safe ${type} preview`, async () => {
      const current = fixture(); documentMessage(current, { mimeType, type, filename });
      const response = await media.GET(new Request('https://crm.bossaempreendimentos.com.br/api/messages/message-a/media'), params());
      assert.equal(response.status, 200); assert.equal(await response.text(), current.media.bytes);
      assert.equal(response.headers.get('content-type'), mimeType.split(';')[0]);
      assert.ok(response.headers.get('content-disposition').startsWith('inline;'));
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(current.mediaReads.length, 1);
    });
  }
  await test('real storage attachment route blocks inline HTML', async () => {
    const current = fixture(); documentMessage(current, { mimeType: 'text/html', filename: 'comprovante.html', aiFile: true });
    const response = await media.GET(new Request('https://crm.bossaempreendimentos.com.br/api/messages/message-a/media'), params());
    assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'application/octet-stream');
    assert.ok(response.headers.get('content-disposition').startsWith('attachment;'));
    assert.ok(response.headers.get('content-security-policy').startsWith('sandbox;'));
    assert.equal(current.storageReads[0].path, 'org-a/file-a');
  });
  await test('range audio playback remains available', async () => {
    const current = fixture(); documentMessage(current, { mimeType: 'audio/ogg', type: 'audio' });
    current.media.status = 206;
    current.media.headers = { 'content-range': 'bytes 0-3/20', 'accept-ranges': 'bytes', 'content-length': '4' };
    current.media.bytes = 'OggS';
    const response = await media.GET(new Request('https://crm.bossaempreendimentos.com.br/api/messages/message-a/media', { headers: { range: 'bytes=0-3' } }), params());
    assert.equal(response.status, 206); assert.equal(response.headers.get('content-range'), 'bytes 0-3/20');
    assert.equal(current.mediaReads[0].options.range, 'bytes=0-3'); assert.equal(await response.text(), 'OggS');
  });
  await test('explicit download keeps even safe media as attachment', async () => {
    const current = fixture(); documentMessage(current);
    const response = await media.GET(new Request('https://crm.bossaempreendimentos.com.br/api/messages/message-a/media?download=1'), params());
    assert.ok(response.headers.get('content-disposition').startsWith('attachment;'));
  });
  await test('foreign-company attachment is denied before storage or Meta access', async () => {
    const current = fixture(); documentMessage(current, { organizationId: 'org-b' });
    assert.equal((await media.GET(new Request('https://crm.bossaempreendimentos.com.br/api/messages/message-a/media'), params())).status, 404);
    assert.equal(current.mediaReads.length, 0); assert.equal(current.storageReads.length, 0);
  });
  await test('anonymous attachment request is denied before admin access', async () => {
    const current = fixture({ context: null });
    assert.equal((await media.GET(new Request('https://crm.bossaempreendimentos.com.br/api/messages/message-a/media'), params())).status, 401);
    assert.equal(current.adminCalls, 0);
  });
  await test('attachment filenames cannot inject headers and preserve Unicode safely', async () => {
    const headers = crmMediaHeaders({ mimeType: 'application/pdf', type: 'document', filename: `..\\pasta/\r\nX-Test: sim" ${'a'.repeat(160)}😀\ud800.pdf`, download: false });
    assert.equal(headers.has('x-test'), false);
    assert.doesNotMatch(headers.get('content-disposition'), /[\r\n]/);
    assert.match(headers.get('content-disposition'), /filename\*=UTF-8''/);
  });
  await test('active proxy preserves exact public assets, legal pages and independently authenticated integrations', async () => {
    fixture();
    for (const path of ['/crm-theme.js', '/legal/privacidade', '/legal/termos', '/legal/exclusao-de-dados', '/auth/callback', '/api/meta/whatsapp/webhook', '/api/automation/followup']) {
      const response = await updateSession(new NextRequest(`https://crm.bossaempreendimentos.com.br${path}`));
      assert.equal(response.headers.get('location'), null, `Public or independently authenticated path ${path} must not be redirected`);
    }
    for (const path of ['/hoje', '/usuarios', '/other.js']) {
      const response = await updateSession(new NextRequest(`https://crm.bossaempreendimentos.com.br${path}`));
      assert.equal(new URL(response.headers.get('location')).pathname, '/login');
    }
  });
  await test('viewer cannot generate a transcript or trigger media/AI requests', async () => {
    const current = fixture(); current.context.role = 'viewer';
    documentMessage(current, { type: 'audio', mimeType: 'audio/ogg' });
    assert.equal((await transcribe.POST(request('/api/messages/message-a/transcribe', {}), params())).status, 403);
    assertNoWrites(current); assert.equal(current.mediaReads.length, 0); assert.equal(current.transcriptions.length, 0);
  });
  await test('viewer can read an existing transcript without writing or consuming AI', async () => {
    const current = fixture(); current.context.role = 'viewer';
    documentMessage(current, { type: 'audio', mimeType: 'audio/ogg' });
    current.tables.messages[0].raw_payload.bossa_transcription = 'Transcrição já existente.';
    const response = await transcribe.POST(request('/api/messages/message-a/transcribe', {}), params());
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { transcript: 'Transcrição já existente.', cached: true });
    assertNoWrites(current); assert.equal(current.mediaReads.length, 0); assert.equal(current.transcriptions.length, 0);
  });
  await test('commercial user can transcribe only the company message and transport row', async () => {
    const current = fixture(); current.context.role = 'comercial';
    documentMessage(current, { type: 'audio', mimeType: 'audio/ogg' });
    current.tables.messages[0].whatsapp_message_id = 'wamid-a';
    current.tables.whatsapp_messages = [
      { id: 'transport-a', organization_id: 'org-a', wamid: 'wamid-a', body: 'Original A' },
      { id: 'transport-b', organization_id: 'org-b', wamid: 'wamid-a', body: 'Original B' },
    ];
    const response = await transcribe.POST(request('/api/messages/message-a/transcribe', {}), params());
    assert.equal(response.status, 200); assert.equal(current.transcriptions.length, 1);
    assert.equal(current.tables.whatsapp_messages[0].body, '🎙️ Transcrição sintética.');
    assert.equal(current.tables.whatsapp_messages[1].body, 'Original B');
  });
  await test('foreign-company transcript is unavailable even to an admin', async () => {
    const current = fixture(); documentMessage(current, { type: 'audio', mimeType: 'audio/ogg', organizationId: 'org-b' });
    assert.equal((await transcribe.POST(request('/api/messages/message-a/transcribe', {}), params())).status, 404);
    assertNoWrites(current); assert.equal(current.transcriptions.length, 0); assert.equal(current.mediaReads.length, 0);
  });
  for (const field of ['assigned_to', 'lead_id']) {
    await test(`agenda POST rejects foreign-company ${field} before admin and Outlook`, async () => {
      const current = fixture();
      current.tables.memberships.push({ id: 'foreign-member', user_id: 'foreign-user', organization_id: 'org-b', role: 'comercial' });
      current.tables.leads.push({ id: 'foreign-lead', organization_id: 'org-b' });
      const response = await agenda.POST(request('/api/agenda', agendaPayload({ [field]: field === 'assigned_to' ? 'foreign-user' : 'foreign-lead' })));
      assert.equal(response.status, 404); assertNoWrites(current); assert.equal(current.adminCalls, 0);
      assert.equal(current.agendaConflictReads.length, 0); assert.equal(current.agendaSyncs.length, 0);
    });
  }
  await test('agenda POST accepts the current member and an own-company lead', async () => {
    const current = fixture(); current.tables.leads.push({ id: 'lead-a', organization_id: 'org-a' });
    const response = await agenda.POST(request('/api/agenda', agendaPayload({ lead_id: 'lead-a' })));
    assert.equal(response.status, 201);
    assert.equal(current.writes[0].values.organization_id, 'org-a');
    assert.equal(current.writes[0].values.lead_id, 'lead-a'); assert.equal(current.writes[0].values.assigned_to, 'admin-a');
    assert.equal(current.agendaSyncs.length, 1);
  });
  for (const lead_id of [undefined, null, '']) {
    await test(`agenda POST preserves no-contact form value ${String(lead_id)}`, async () => {
      const current = fixture();
      assert.equal((await agenda.POST(request('/api/agenda', agendaPayload({ lead_id })))).status, 201);
      assert.equal(current.writes[0].values.lead_id, null); assert.equal(current.writes[0].values.assigned_to, 'admin-a');
    });
  }
  for (const table of ['memberships', 'leads']) {
    await test(`agenda reference lookup fails closed when ${table} is unavailable`, async () => {
      const current = fixture({ fail: { client: 'session', table } });
      current.tables.leads.push({ id: 'lead-a', organization_id: 'org-a' });
      const response = await agenda.POST(request('/api/agenda', agendaPayload({ lead_id: 'lead-a' })));
      assert.equal(response.status, 503); assertNoWrites(current); assert.equal(current.adminCalls, 0); assert.equal(current.agendaSyncs.length, 0);
    });
  }
  for (const field of ['assigned_to', 'lead_id']) {
    await test(`agenda PATCH rejects foreign-company ${field} even when cancelling`, async () => {
      const current = fixture(); agendaEvent(current);
      current.tables.memberships.push({ id: 'foreign-member', user_id: 'foreign-user', organization_id: 'org-b', role: 'comercial' });
      current.tables.leads.push({ id: 'foreign-lead', organization_id: 'org-b' });
      const response = await agenda.PATCH(request('/api/agenda', { id: 'event-a', status: 'cancelled', [field]: field === 'assigned_to' ? 'foreign-user' : 'foreign-lead' }, {}, 'PATCH'));
      assert.equal(response.status, 404); assertNoWrites(current); assert.equal(current.adminCalls, 0);
      assert.equal(current.agendaSyncs.length, 0); assert.equal(current.agendaDeletes.length, 0);
    });
  }
  await test('agenda PATCH preserves omitted references and a legitimate null Microsoft ID', async () => {
    const current = fixture(); agendaEvent(current, { lead_id: 'lead-a' });
    current.tables.leads.push({ id: 'lead-a', organization_id: 'org-a' });
    const response = await agenda.PATCH(request('/api/agenda', { id: 'event-a', title: 'Título atualizado' }, {}, 'PATCH'));
    assert.equal(response.status, 200);
    assert.equal(current.tables.agenda_events[0].lead_id, 'lead-a');
    assert.equal(current.tables.agenda_events[0].assigned_to, 'admin-a');
    assert.equal(current.tables.agenda_events[0].microsoft_event_id, null);
  });
  for (const lead_id of [null, '']) {
    await test(`agenda PATCH clears optional contact with ${String(lead_id)} without clearing the assignee`, async () => {
      const current = fixture(); agendaEvent(current, { lead_id: 'lead-a' });
      current.tables.leads.push({ id: 'lead-a', organization_id: 'org-a' });
      const response = await agenda.PATCH(request('/api/agenda', { id: 'event-a', lead_id, assigned_to: null }, {}, 'PATCH'));
      assert.equal(response.status, 200);
      assert.equal(current.tables.agenda_events[0].lead_id, null); assert.equal(current.tables.agenda_events[0].assigned_to, 'admin-a');
    });
  }
  await test('agenda PATCH preserves the Outlook imported-event guard', async () => {
    const current = fixture(); agendaEvent(current, { microsoft_sync_status: 'imported', lead_id: null, microsoft_event_id: 'microsoft-a' });
    assert.equal((await agenda.PATCH(request('/api/agenda', { id: 'event-a', title: 'Alteração indevida' }, {}, 'PATCH'))).status, 403);
    assertNoWrites(current); assert.equal(current.agendaSyncs.length, 0);
  });
  await test('agenda PATCH fails closed on an unavailable or foreign event', async () => {
    const unavailable = fixture({ fail: { client: 'session', table: 'agenda_events' } });
    agendaEvent(unavailable);
    assert.equal((await agenda.PATCH(request('/api/agenda', { id: 'event-a', title: 'Alteração' }, {}, 'PATCH'))).status, 503);
    assertNoWrites(unavailable);
    const foreign = fixture(); agendaEvent(foreign, { organization_id: 'org-b' });
    assert.equal((await agenda.PATCH(request('/api/agenda', { id: 'event-a', title: 'Alteração' }, {}, 'PATCH'))).status, 404);
    assertNoWrites(foreign);
  });
  assert.equal(blockedNetwork, 0, 'No route should attempt a real network call');
  process.stdout.write(`CRM security: ${passed} scenarios passed; external network calls: 0.\n`);
} finally {
  globalThis.fetch = savedFetch;
  console.error = savedConsoleError;
  delete globalThis.__crmSecurityTest;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
