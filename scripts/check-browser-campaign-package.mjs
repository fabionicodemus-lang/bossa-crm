import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { validChatGPTCampaignId } from '../src/lib/chatgpt-browser-campaign.ts';

// Execute the actual route handler, not a copied regex or a source-text assertion.
// All external services are isolated: no live database, browser or WhatsApp calls.
const source = readFileSync(new URL('../src/app/api/transmissoes/navegador/pacote/route.ts', import.meta.url), 'utf8');
const code = stripTypeScriptTypes(source, { mode: 'strip' })
  .replace(/^import\s+[^\n]+;\r?\n/gm, '')
  .replace(/^export\s+/gm, '');
const campaignId = '8cc0bb9b-88b3-49eb-9ed1-d386e5884f69';
const anotherId = '12345678-1234-1234-1234-123456789abc';
const organizationId = '11111111-2222-3333-4444-555555555555';
const channelId = '22222222-3333-4444-5555-666666666666';
const senderPhone = '5547000000000';
const endpoint = 'https://crm.bossaempreendimentos.com.br/api/transmissoes/navegador/pacote';

function fixture(options = {}) {
  const calls = { admin: 0, rpc: [] };
  const context = Object.hasOwn(options, 'context') ? options.context
    : { role: 'admin', organization: { id: organizationId } };
  const run = {
    runId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', status: 'active',
    createdAt: '2026-11-09T17:00:00.000Z',
    manifest: {
      campaignId, senderPhone,
      recipients: Array.from({ length: 1150 }, (_, i) => ({
        name: `Pessoa${i} Teste`, phone: `5547${String(i).padStart(9, '0')}`,
        text: `Olá, Pessoa${i}! Tabelas de teste.`, position: i,
      })),
      media: [
        { filename: 'Flow.pdf', sha256: 'a'.repeat(64) },
        { filename: 'Alma.pdf', sha256: 'b'.repeat(64) },
      ],
    },
  };
  const admin = {
    from(table) {
      const filters = new Map();
      function result() {
        assert.equal(filters.get('organization_id'), organizationId, 'query must stay tenant-scoped');
        if (table === 'browser_campaigns') {
          assert.equal(filters.get('id'), campaignId);
          return { data: options.missingCampaign ? null : { id: campaignId, status: 'running', sender_phone: senderPhone }, error: null };
        }
        if (table === 'whatsapp_channels') {
          assert.equal(filters.get('status'), 'connected');
          return { data: options.noChannel ? [] : [{ id: channelId, display_phone_number: senderPhone }], error: null };
        }
        assert.equal(table, 'whatsapp_messages');
        assert.equal(filters.get('channel_id'), channelId);
        assert.equal(filters.get('direction'), 'out');
        assert.equal(filters.get('payload').source, 'whatsapp_business_app');
        return { data: options.noEcho ? [] : [{ id: 'echo-fixture' }], error: null };
      }
      const builder = {
        select() { return this; },
        eq(key, value) { filters.set(key, value); return this; },
        contains(key, value) { filters.set(key, value); return this; },
        gte() { return this; },
        limit() { return this; },
        maybeSingle: async () => result(),
        then(resolve, reject) { return Promise.resolve().then(result).then(resolve, reject); },
      };
      return builder;
    },
  };
  const handlers = runInNewContext(`${code}\n({ POST, PATCH });`, {
    NextResponse: { json: (body, init) => Response.json(body, init) },
    getCurrentContext: async () => context,
    createAdminClient: () => { calls.admin++; return admin; },
    createClient: async () => ({
      rpc: async (name, args) => {
        calls.rpc.push({ name, args: JSON.parse(JSON.stringify(args)) });
        return { data: name === 'browser_campaign_stop_standalone' ? true : run, error: null };
      },
    }),
    phoneMatchVariants: (value) => [String(value).replace(/\D/g, '')],
    validChatGPTCampaignId, URL, Date,
  }, { filename: 'browser-campaign-package-route.js' });
  return { ...handlers, calls };
}
function request({ method = 'POST', query = '', body, raw } = {}) {
  const data = raw === undefined ? (body === undefined ? undefined : JSON.stringify(body)) : raw;
  return new Request(endpoint + query, {
    method, headers: { 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: data }),
  });
}

for (const input of [
  { body: { campaignId } },
  { query: `?campaign=${campaignId}` },
  { query: `?campaign=${campaignId}`, raw: '{' },
  { query: `?campaign=${campaignId}`, body: { campaignId } },
  { query: `?campaign=%20${campaignId}%20`, body: { campaignId: ` ${campaignId} ` } },
]) {
  const test = fixture();
  const response = await test.POST(request(input));
  assert.equal(response.status, 200, `valid campaign was rejected: ${await response.clone().text()}`);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const data = await response.json();
  assert.equal(data.manifest.campaignId, campaignId);
  assert.equal(data.manifest.recipients.length, 1150);
  assert.equal(data.manifest.media.length, 2);
  assert.equal(test.calls.rpc.length, 1);
  assert.deepEqual(test.calls.rpc[0], {
    name: 'browser_campaign_prepare_standalone',
    args: { p_campaign_id: campaignId, p_channel_id: channelId },
  });
}

for (const body of [{}, { campaignId: '' }, { campaignId: '../outro' },
  { campaignId: '8cc0bb9b-88b3-49eb-d386e5884f69' }, { campaignId: [campaignId] }]) {
  const test = fixture();
  const response = await test.POST(request({ body }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'INVALID_CAMPAIGN_ID');
  assert.equal(test.calls.admin, 0);
  assert.equal(test.calls.rpc.length, 0);
}
const mismatch = fixture();
assert.equal((await mismatch.POST(request({ query: `?campaign=${anotherId}`, body: { campaignId } }))).status, 409);
assert.equal(mismatch.calls.admin, 0);

for (const context of [null, { role: 'viewer', organization: { id: organizationId } }]) {
  const test = fixture({ context });
  assert.equal((await test.POST(request({ body: { campaignId } }))).status, 403);
  assert.equal((await test.PATCH(request({ method: 'PATCH', body: { campaignId, confirmedChatGPTStopped: true } }))).status, 403);
  assert.equal(test.calls.admin, 0);
  assert.equal(test.calls.rpc.length, 0);
}
for (const options of [{ missingCampaign: true }, { noChannel: true }, { noEcho: true }]) {
  const test = fixture(options);
  assert.equal((await test.POST(request({ body: { campaignId } }))).status, 409);
  assert.equal(test.calls.rpc.length, 0);
}
const stopping = fixture();
assert.equal((await stopping.PATCH(request({ method: 'PATCH', body: { campaignId } }))).status, 400);
assert.equal(stopping.calls.rpc.length, 0);
const stopped = await stopping.PATCH(request({ method: 'PATCH', body: { campaignId, confirmedChatGPTStopped: true } }));
assert.equal(stopped.status, 200);
assert.deepEqual(await stopped.json(), { stopped: true });
assert.deepEqual(stopping.calls.rpc[0], {
  name: 'browser_campaign_stop_standalone', args: { p_campaign_id: campaignId },
});
console.log('Package route: actual POST/PATCH, canonical UUID, 1.150 recipients, two PDFs, auth and failure paths OK; no live sends.');
