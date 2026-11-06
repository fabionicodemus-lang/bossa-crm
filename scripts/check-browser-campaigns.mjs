import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import {
  campaignRecipientSummary, personalizeBrowserText, safeBrowserMedia, validBrowserPhone,
} from '../src/lib/browser-campaigns.ts';

const root = resolve(import.meta.dirname, '..');
const contentScript = readFileSync(resolve(root, 'extensions/bossa-whatsapp-web/whatsapp-content.js'), 'utf8');
const media = (extras = {}) => ({
  bucket: 'broadcast-media', path: 'org-1/a.pdf', filename: 'Tabela.pdf',
  mime: 'application/pdf', size: 1024, sha256: 'a'.repeat(64), ...extras,
});

assert.equal(validBrowserPhone('(47) 99933-3634'), '5547999333634');
assert.equal(validBrowserPhone('+1 415 555 0135'), '14155550135');
assert.equal(validBrowserPhone('555'), null);
assert.equal(validBrowserPhone('0000000000'), null);
assert.equal(personalizeBrowserText('Oi, {{nome}} da {{imobiliaria}}. Veja {{empreendimento}}!', {
  name: 'Maria Silva', company: 'Corretora Sul', enterprise: 'Bossa Mar',
}), 'Oi, Maria da Corretora Sul. Veja Bossa Mar!');
assert.deepEqual(campaignRecipientSummary([
  { status: 'queued' }, { status: 'sent' }, { status: 'uncertain' }, { status: 'sent' },
]), { queued: 1, claimed: 0, sent: 2, uncertain: 1, skipped: 0 });

assert.equal(safeBrowserMedia('org-1', [media()])?.length, 1);
assert.equal(safeBrowserMedia('org-2', [media()]), null, 'outro tenant não pode anexar PDF');
assert.equal(safeBrowserMedia('org-1', [media({ path: 'org-1/../other/file.pdf' })]), null, 'não permite atravessar diretórios');
assert.equal(safeBrowserMedia('org-1', [media(), media()]), null, 'não permite duplicar anexo');
assert.equal(safeBrowserMedia('org-1', [media({ sha256: 'alterado' })]), null, 'hash obrigatório');
assert.equal(safeBrowserMedia('org-1', [media({ size: 9 * 1048576 })]), null, 'limite por PDF');
assert.equal(safeBrowserMedia('org-1', Array.from({ length: 4 }, (_, n) => media({ path: `org-1/${n}.pdf` }))), null);

// Um input image/* nunca pode ser tratado como opção válida para PDF, e
// a observação só pode contar bolhas identificadas como saída do operador.
assert.doesNotMatch(contentScript, /accepts\.includes\('\*'\)/);
assert.match(contentScript, /\[aria-label=\"Anexar\"\]/);
assert.match(contentScript, /\[data-testid=\"tail-out\"\]/);

const uncertainLockMigration = readFileSync(resolve(root,
  'supabase/migrations/20261106170335_browser_campaign_uncertain_lock.sql'), 'utf8');
assert.match(uncertainLockMigration, /requires_review\s*=\s*true/);

// Executa o content script em um DOM deliberadamente incompleto. Uma mudança
// na interface ou um número inválido deve falhar SEM clicar em envio.
let sendListener;
let clickCount = 0;
let fakeNow = 0;
class FakeDate extends Date { static now() { fakeNow += 30000; return fakeNow; } }
const document = {
  querySelector() { return null; },
  querySelectorAll() { return []; },
  dispatchEvent() { clickCount++; },
};
vm.runInNewContext(contentScript, {
  chrome: { runtime: { onMessage: { addListener(fn) { sendListener = fn; } } } },
  document, Date: FakeDate, setTimeout(fn) { fn(); }, Element: class {},
  getComputedStyle() { return { visibility: 'visible', display: 'block' }; },
  KeyboardEvent: class {},
});
const sendToContent = (payload) => new Promise((resolve) => {
  const asyncResponse = sendListener({ type: 'SEND_ITEM', payload }, {}, resolve);
  if (asyncResponse === false && payload.phone === '555') assert.fail('Telefone inválido não reportou resultado');
});
assert.equal((await sendToContent({ phone: '555', kind: 'text', text: 'Oi' })).state, 'uncertain');
assert.equal((await sendToContent({ phone: '5547999333634', kind: 'text', text: 'Oi' })).state, 'uncertain');
assert.equal(clickCount, 0, 'falhas não devem clicar');

// A ponte do CRM não concede comandos a outra origem, e nenhuma navegação
// acontece após um pedido não autorizado.
let backgroundListener;
let navigationCount = 0;
vm.runInNewContext(readFileSync(resolve(root, 'extensions/bossa-whatsapp-web/background.js'), 'utf8'), {
  chrome: {
    runtime: { onMessage: { addListener(fn) { backgroundListener = fn; } } },
    tabs: { query: async () => { navigationCount++; return []; }, update: async () => ({}) },
  },
  URL, setTimeout,
});
const backgroundResponse = (message, url) => new Promise((resolve) => {
  backgroundListener(message, { url }, resolve);
});
const command = { source: 'bossa-crm-bridge', type: 'SEND_ITEM', payload: { phone: '5547999333634', kind: 'text', text: 'Oi' } };
assert.equal((await backgroundResponse(command, 'https://unknown.example.com/')).error, 'Origem não autorizada.');
assert.equal(navigationCount, 0);
assert.equal((await backgroundResponse({ ...command, payload: { ...command.payload, phone: '555' } }, 'https://crm.bossaempreendimentos.com.br/transmissoes')).error, 'Telefone internacional inválido.');
assert.equal((await backgroundResponse({ source: 'bossa-crm-bridge', type: 'PING' }, 'https://bossa-crm-homologacao-git-feat-browser-whatsapp-62bda2-elos-os.vercel.app/transmissoes')).result.state, 'observed');
assert.equal((await backgroundResponse({ source: 'bossa-crm-bridge', type: 'PING' }, 'https://malicious-preview.vercel.app/')).error, 'Origem não autorizada.');
assert.equal(navigationCount, 0);

console.log('Browser campaigns: normalização, consentimento técnico, arquivos, proteção da extensão e falhas seguras OK.');
