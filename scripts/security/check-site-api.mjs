import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./site-api-loader.mjs', import.meta.url);

// Somente fixtures: nenhuma chave, conexão ou gravação em Supabase.
const chamadas = [];
globalThis.__bossaSiteSecurityFixture = { db: {
  rpc: async (name, args) => { chamadas.push({ name, args }); return { data: 'private-fixture-id', error: null }; },
} };
const { POST: lead } = await import('../../site/src/app/api/leads/route.ts');
const { POST: evento } = await import('../../site/src/app/api/eventos/route.ts');
const { criarLimitador, lerObjetoJson, validarOrigem } = await import('../../site/src/lib/seguranca-api.ts');
let total = 0;
async function caso(nome, teste) { await teste(); total++; console.log(`PASS ${nome}`); }
const origem = 'https://www.bossaempreendimentos.com.br';
const corpoLead = { nome: 'Cliente de teste', whatsapp: '47999990000', formulario: 'visita', consentimento: true };
const req = (path, body, headers = {}) => new Request(`${origem}/api/${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', origin: origem, ...headers }, body: JSON.stringify(body),
});

await caso('formulário legítimo mantém gravação e não expõe identificador interno', async () => {
  const r = await lead(req('leads', { ...corpoLead, utm: { utm_source: 'google', admin: true, utm_campaign: 'x'.repeat(500) } }));
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ok: true, gravado: true });
  const c = chamadas.at(-1); assert.equal(c.name, 'site_registrar_lead'); assert.equal(c.args.p_telefone, '5547999990000');
  assert.equal(c.args.p_utm.utm_campaign.length, 200); assert.equal(c.args.p_utm.admin, undefined);
});
await caso('origem externa é recusada antes de acessar banco', async () => {
  const antes = chamadas.length;
  for (const path of ['leads', 'eventos']) {
    const r = await (path === 'leads' ? lead : evento)(req(path, corpoLead, { origin: 'https://externo.invalid' }));
    assert.equal(r.status, 403);
  }
  assert.equal(chamadas.length, antes);
});
await caso('origem nula e navegação cross-site são recusadas', async () => {
  for (const headers of [{ origin: 'null' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await lead(req('leads', corpoLead, headers))).status, 403);
  }
  assert.doesNotThrow(() => validarOrigem(new Request(`${origem}/api/leads`)));
});
await caso('tipo do corpo, null e arrays não chegam ao banco', async () => {
  const antes = chamadas.length;
  assert.equal((await lead(req('leads', corpoLead, { 'content-type': 'text/plain' }))).status, 415);
  for (const body of [null, [], 'texto', 42]) assert.equal((await lead(req('leads', body))).status, 400);
  assert.equal(chamadas.length, antes);
});
await caso('limite de bytes é aplicado durante leitura mesmo sem Content-Length', async () => {
  const encoder = new TextEncoder(); let cancelado = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(encoder.encode('{"nome":"')); controller.enqueue(encoder.encode('á'.repeat(9000))); },
    cancel() { cancelado = true; },
  });
  const r = await lead(new Request(`${origem}/api/leads`, { method: 'POST', body, duplex: 'half', headers: { 'content-type': 'application/json' } }));
  assert.equal(r.status, 413); assert.equal(cancelado, true);
  await assert.rejects(lerObjetoJson(req('leads', { nome: 'áá' }), 12), e => e.status === 413);
});
await caso('honeypot não grava e consentimento segue obrigatório', async () => {
  const antes = chamadas.length;
  assert.equal((await lead(req('leads', { ...corpoLead, site: 'spam' }))).status, 200);
  assert.equal((await lead(req('leads', { ...corpoLead, consentimento: false }))).status, 422);
  assert.equal(chamadas.length, antes);
});
await caso('evento legítimo preserva origem do servidor e aceita cabeçalho de cidade malformado', async () => {
  const r = await evento(req('eventos', { evento: 'page_view', visitante: 'ABCD23', detalhe: { nome: 'não guardar', __site_hostname: 'falso.invalid' } }, { 'x-vercel-ip-city': '%ZZ' }));
  assert.equal(r.status, 204);
  const c = chamadas.at(-1); assert.equal(c.args.p_detalhe.__site_hostname, 'www.bossaempreendimentos.com.br');
  assert.equal(c.args.p_detalhe.nome, undefined); assert.equal(c.args.p_cidade, null);
});
await caso('rate limit local isola chaves, respeita janela e limita memória', () => {
  let agora = 0; const limite = criarLimitador(2, () => agora);
  assert.equal(limite('a', 2, 60000), 0); assert.equal(limite('a', 2, 60000), 0); assert.equal(limite('a', 2, 60000), 60);
  assert.equal(limite('b', 2, 60000), 0); assert.equal(limite('c', 2, 60000), 0);
  agora = 60001; assert.equal(limite('a', 2, 60000), 0);
});
await caso('rota responde 429 com Retry-After para excesso de envios', async () => {
  const anterior = process.env.VERCEL; process.env.VERCEL = '1';
  try {
    let r;
    for (let i = 0; i < 21; i++) r = await lead(req('leads', { ...corpoLead, site: 'honeypot' }, { 'x-vercel-forwarded-for': '192.0.2.123' }));
    assert.equal(r.status, 429); assert.ok(Number(r.headers.get('retry-after')) > 0);
  } finally { if (anterior === undefined) delete process.env.VERCEL; else process.env.VERCEL = anterior; }
});
console.log(`${total} cenários de segurança do site aprovados; banco e tráfego externos simulados.`);
