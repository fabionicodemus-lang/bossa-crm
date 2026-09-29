import assert from 'node:assert/strict';
import { metaCloudProvider } from '../src/lib/whatsapp/providers/metaCloud.ts';
import { normalizeWaId } from '../src/lib/whatsapp/utils.ts';

process.env.META_GRAPH_VERSION = 'v-test';
const sent = [];
globalThis.fetch = async (_url, options) => {
  sent.push(JSON.parse(options.body));
  return new Response(JSON.stringify({ messages: [{ id: `wamid.${sent.length}` }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

const common = { phoneNumberId: 'test-phone', accessToken: 'test-token', to: normalizeWaId('18563947763') };
await metaCloudProvider.sendText({ ...common, body: 'Teste' });
await metaCloudProvider.sendMedia({ ...common, type: 'image', link: 'https://example.test/image.jpg' });
await metaCloudProvider.sendMedia({ ...common, type: 'document', link: 'https://example.test/file.pdf' });
await metaCloudProvider.sendTemplate({ ...common, name: 'teste', language: 'en_US' });

assert.deepEqual(sent.map(({ type, to }) => [type, to]), [
  ['text', '18563947763'],
  ['image', '18563947763'],
  ['document', '18563947763'],
  ['template', '18563947763'],
]);
console.log('Cloud API: texto, imagem, documento e template usam o wa_id dos EUA sem 55.');
