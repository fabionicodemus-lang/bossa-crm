import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as campaignTools from '../src/lib/chatgpt-browser-campaign.ts';
import * as campaignData from '../src/lib/browser-campaigns.ts';

const origin = 'https://crm.bossaempreendimentos.com.br';
const campaignId = '12345678-1234-1234-1234-123456789abc';
const runId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const run = {
  runId, status: 'active', createdAt: '2026-11-09T17:00:00.000Z',
  manifest: {
    campaignId, senderPhone: '5547999999999',
    recipients: [
      { name: 'Ana Silva', phone: '5547999990001', position: 0, text: 'Olá, Ana! Chrome e Edge são palavras do texto aprovado. 📄\n*Flow e Alma*.' },
      { name: 'Bruno Souza', phone: '5547999990002', position: 1, text: 'Oi, Bruno! Seguem as tabelas.\nConte comigo! 🤝' },
    ],
    media: [{ filename: 'Tabela Flow.pdf', sha256: 'a'.repeat(64) }, { filename: 'Tabela Alma.pdf', sha256: 'b'.repeat(64) }],
  },
};
const before = JSON.stringify(run);
const chrome = campaignTools.buildChatGPTStandalonePrompt(origin, run, 'chrome');
const edge = campaignTools.buildChatGPTStandalonePrompt(origin, run, 'edge');
const dataStart = 'ANEXOS APROVADOS (download único antes do primeiro contato):';
assert.match(chrome, /NAVEGADOR ESCOLHIDO: Google Chrome/);
assert.match(edge, /NAVEGADOR ESCOLHIDO: Microsoft Edge/);
assert.doesNotMatch(edge.split(dataStart)[0], /@Chrome|@Edge|Google Chrome|para Chrome/);
assert.match(edge, /Não troque de navegador/);
assert.match(edge, /Não execute as duas versões em paralelo/);
assert.equal(chrome.slice(chrome.indexOf(dataStart)), edge.slice(edge.indexOf(dataStart)), 'browser selection must not rewrite contacts, messages or PDF URLs');
assert.equal(JSON.stringify(run), before, 'manifest must not be mutated');
assert.equal(campaignTools.buildChatGPTStandalonePrompt(origin, run), chrome, 'legacy calls default to Chrome');
assert.throws(() => campaignTools.buildChatGPTStandalonePrompt(origin, run, 'safari'), /Chrome ou Edge/);
for (const browser of ['chrome', 'edge']) {
  const prompt = browser === 'edge' ? edge : chrome;
  const md = campaignTools.buildChatGPTCampaignMarkdown(prompt, 'Teste de navegador', 2, browser);
  assert.ok(md.includes('**Navegador:** ' + campaignTools.chatGPTBrowserLabel(browser)));
  assert.ok(md.endsWith(prompt + '\n'));
  assert.equal(campaignTools.chatGPTCampaignMarkdownFilename(campaignId, browser), `bossa-transmissao-${campaignId}-${browser}.md`);
}
assert.throws(() => campaignTools.chatGPTCampaignMarkdownFilename(campaignId, '../edge'), /Chrome ou Edge/);

for (const count of [1150, 1500]) {
  const largeRun = { ...run, manifest: { ...run.manifest, recipients: Array.from({ length: count }, (_, position) => ({
    name: 'Ana ' + position, phone: '5547' + String(900000000 + position), position,
    text: 'Olá, Ana! Tabela ' + (position % 4) + ' aprovada. Chrome e Edge não podem alterar este texto.\n📄 Flow e Alma.',
  })) } };
  const left = campaignTools.buildChatGPTStandalonePrompt(origin, largeRun, 'chrome');
  const right = campaignTools.buildChatGPTStandalonePrompt(origin, largeRun, 'edge');
  assert.equal(left.slice(left.indexOf(dataStart)), right.slice(right.indexOf(dataStart)));
  const compact = JSON.parse(right.split('\n').find((line) => line.startsWith('{"versoes":')));
  assert.equal(compact.contatos.length, count);
  for (const [index, contact] of compact.contatos.entries()) {
    const text = contact.substituir_nome
      ? compact.versoes[contact.versao - 1].split('{{primeiro_nome}}').join(contact.primeiro_nome)
      : compact.versoes[contact.versao - 1];
    assert.equal(text, largeRun.manifest.recipients[index].text);
    assert.equal(contact.telefone, '+' + largeRun.manifest.recipients[index].phone);
  }
}

// Execute the actual component handlers with isolated React hooks, DOM and API.
// No real browser, contacts, network requests or WhatsApp sends are involved.
const source = readFileSync(new URL('../src/components/BrowserCampaignManager.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const campaign = { id: campaignId, name: 'Campanha teste navegador', sender_phone: run.manifest.senderPhone,
  base_text: 'Olá, {{nome}}!', variants: [], media: run.manifest.media, status: 'running',
  recipient_count: 2, created_at: run.createdAt, consent_confirmed_at: run.createdAt, started_at: run.createdAt };
const recipients = run.manifest.recipients.map((row) => ({ id: row.phone, lead_name: row.name, phone: row.phone,
  stage: 'teste', message_text: row.text, status: 'queued', next_item_index: 0, detail: null, position: row.position }));
const values = [];
const effects = [];
let cursor = 0;
const react = {
  useState(initial) {
    const slot = cursor++;
    if (!(slot in values)) values[slot] = typeof initial === 'function' ? initial() : initial;
    return [values[slot], (next) => { values[slot] = typeof next === 'function' ? next(values[slot]) : next; }];
  },
  useRef(initial) { const slot = cursor++; if (!(slot in values)) values[slot] = { current: initial }; return values[slot]; },
  useMemo: (fn) => fn(), useCallback: (fn) => fn, useEffect: (fn) => { effects.push(fn); },
};
const jsx = (type, props) => ({ type, props });
const blobs = new Map();
const downloads = [];
const clipboard = [];
const requests = [];
class LocalURL extends URL {
  static createObjectURL(blob) { const url = 'blob:fixture-' + blobs.size; blobs.set(url, blob); return url; }
  static revokeObjectURL(url) { blobs.delete(url); }
}
const context = {
  exports: {}, console, URL: LocalURL, Blob,
  crypto: { randomUUID: () => runId },
  window: { location: { origin, href: origin }, setTimeout: () => 1, clearTimeout() {},
    setInterval: () => 1, clearInterval() {}, addEventListener() {}, removeEventListener() {}, postMessage() {} },
  navigator: { clipboard: { writeText: async (text) => { clipboard.push(text); } } },
  document: { body: { appendChild() {} }, createElement: () => ({ href: '', download: '',
    click() { downloads.push({ filename: this.download, blob: blobs.get(this.href) }); }, remove() {} }) },
  fetch: async (url, options) => {
    requests.push({ url, options });
    const data = String(url).includes('/pacote') ? structuredClone(run)
      : String(url).includes('?campaign=') ? { campaign, recipients, senderBlocked: false, monitor: null, standaloneRun: null }
        : { campaigns: [campaign] };
    return { ok: true, json: async () => data };
  },
  require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
    if (name === '@/lib/supabase/client') return { createClient: () => ({}) };
    if (name === '@/lib/browser-campaigns') return campaignData;
    if (name === '@/lib/browser-campaign-monitor') return { BROWSER_CAMPAIGN_MONITOR_POLL_MS: 120000 };
    if (name === '@/lib/chatgpt-browser-campaign') return campaignTools;
    if (name.endsWith('.module.css')) return { default: {} };
    throw new Error('Unexpected test import: ' + name);
  },
};
vm.runInNewContext(code, context);
function render(canEdit = true) { cursor = 0; return context.exports.BrowserCampaignManager({ organizationId: 'org-test', canEdit }); }
function text(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join('');
  if (typeof node !== 'object') return String(node);
  return text(node.props?.children);
}
function find(node, label) {
  if (!node || typeof node !== 'object') return null;
  if (!Array.isArray(node) && node.type === 'button' && text(node).includes(label)) return node;
  for (const child of (Array.isArray(node) ? node : [node.props?.children])) { const found = find(child, label); if (found) return found; }
  return null;
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
render();
for (const effect of [...effects]) effect();
await flush();
const open = find(render(), campaign.name);
assert.ok(open, 'campaign list must render');
open.props.onClick();
await flush();
for (const browser of ['chrome', 'edge', 'chrome']) {
  const label = browser === 'edge' ? 'Edge' : 'Chrome';
  const button = find(render(), 'Baixar instrução .md — ' + label);
  assert.ok(button && !button.props.disabled, label + ' export button must be available');
  button.props.onClick();
  await flush();
  const download = downloads.at(-1);
  assert.ok(download.filename.endsWith('-' + browser + '.md'));
  const fileText = await download.blob.text();
  assert.ok(fileText.includes('**Navegador:** ' + campaignTools.chatGPTBrowserLabel(browser)));
  assert.ok(fileText.endsWith((browser === 'edge' ? edge : chrome) + '\n'));
  const copy = find(render(), 'Copiar instrução — ' + label);
  assert.ok(copy, 'copy follows the last selected browser');
  copy.props.onClick();
  await flush();
  assert.equal(clipboard.at(-1), browser === 'edge' ? edge : chrome);
}
assert.equal(downloads.length, 3, 'one file per click');
const prepareRequests = requests.filter((row) => String(row.url).includes('/pacote'));
assert.equal(prepareRequests.length, 3, 'browser switch rebuilds the prompt, not a stale cached string');
for (const request of prepareRequests) assert.deepEqual(JSON.parse(request.options.body), { campaignId });
assert.equal(requests.filter((row) => row.options?.method === 'POST' && !String(row.url).includes('/pacote')).length, 0, 'browser switch must not create another campaign');
assert.equal(find(render(false), 'Baixar instrução .md — Edge'), null, 'read-only users cannot export');
console.log('Chrome/Edge: prompts, 1.150/1.500 contatos íntegros, downloads e alternância do clipboard validados; sem envios reais.');
