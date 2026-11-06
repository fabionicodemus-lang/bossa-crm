import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import {
  browserRecipientFirstName, campaignRecipientSummary, hasBrowserRecipientNameToken,
  personalizeBrowserText, safeBrowserMedia, validBrowserMobilePhone, validBrowserPhone,
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
assert.equal(validBrowserMobilePhone('(47) 99933-3634'), '5547999333634');
assert.equal(validBrowserMobilePhone('554799333634'), '554799333634', 'wa_id brasileiro legado sem nono dígito');
assert.equal(validBrowserMobilePhone('(47) 3333-4444'), null, 'telefone fixo não é celular');
assert.equal(validBrowserMobilePhone('999333634'), null, 'número sem DDD não é destinatário válido');
assert.equal(validBrowserMobilePhone('55 47 99933-3634 / 55 47 98888-1234'), null, 'não escolher entre dois telefones do mesmo campo');
assert.equal(browserRecipientFirstName('Maria Silva'), 'Maria');
assert.equal(browserRecipientFirstName('Não informada'), null, 'cadastro genérico precisa de nome válido');
assert.equal(browserRecipientFirstName('Imobiliária do Vale'), null, 'empresa não é primeiro nome de uma pessoa');
assert.equal(browserRecipientFirstName('Lead #50624080'), null, 'ID de importação não é primeiro nome');
assert.equal(browserRecipientFirstName('5547999999999'), null, 'número não é primeiro nome');
assert.equal(browserRecipientFirstName('José Carlos'), 'José', 'aceitar nomes com acento');
assert.equal(hasBrowserRecipientNameToken('Olá, {{Nome}}!'), true);
assert.equal(hasBrowserRecipientNameToken('Olá, pessoal!'), false);
assert.equal(personalizeBrowserText('Oi, {{nome}} da {{imobiliaria}}. Veja {{empreendimento}}!', {
  name: 'Maria Silva', company: 'Corretora Sul', enterprise: 'Bossa Mar',
}), 'Oi, Maria da Corretora Sul. Veja Bossa Mar!');
assert.throws(() => personalizeBrowserText('Olá!', { name: 'Maria' }), /Inclua \{\{nome\}\}/);
assert.throws(() => personalizeBrowserText('Olá, {{nome}}!', { name: 'Não informada' }), /primeiro nome válido/);
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

const brokerScopeMigration = readFileSync(resolve(root,
  'supabase/migrations/20261106172904_browser_campaign_broker_scope.sql'), 'utf8');
assert.match(brokerScopeMigration, /l\.opt_out = true/);
assert.doesNotMatch(brokerScopeMigration, /automation_paused/, 'a pausa da Nara não pode bloquear a fila');

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

// Simulação isolada da interface observada no Chrome: mensagem com várias
// linhas, caracteres invisíveis do editor e menu Anexar → Documento (accept="*").
// Nenhum navegador, contato ou envio real é envolvido nesses testes.
function mockWhatsAppContent({ insertedText = null } = {}) {
  let listener;
  let clickedSend = 0;
  let documentSelected = false;
  let documentInputReady = false;
  let previewReady = false;
  const bubbles = [];
  const phone = '5547999333634';

  class MockElement {
    constructor({ content = '', icon = '', label = '', classes = [] } = {}) {
      this.innerText = content;
      this.textContent = content;
      this.icon = icon;
      this.label = label;
      this.classList = { contains: (name) => classes.includes(name) };
    }
    getBoundingClientRect() { return { width: 100, height: 40 }; }
    closest() { return this; }
    getAttribute(name) {
      if (name === 'data-icon') return this.icon;
      if (name === 'aria-label') return this.label;
      return null;
    }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    focus() { /* contenteditable visível */ }
  }

  const header = new MockElement({ content: phone });
  const input = new MockElement();
  const sendButton = new MockElement({ icon: 'send' });
  sendButton.click = () => {
    clickedSend++;
    bubbles.push(new MockElement({ content: previewReady ? 'Tabela.pdf' : input.innerText, classes: ['message-out'] }));
  };
  const footer = { querySelectorAll() { return [sendButton]; } };
  const main = {
    querySelector(selector) {
      if (selector === 'header') return header;
      if (selector === 'footer') return footer;
      if (selector.startsWith('footer [contenteditable=')) return input;
      return null;
    },
    querySelectorAll() { return bubbles; },
    contains() { return true; },
  };
  const attach = new MockElement({ label: 'Anexar' });
  attach.click = () => {};
  const documentMenuItem = new MockElement({ label: 'Documento' });
  documentMenuItem.click = () => { documentSelected = true; documentInputReady = true; };
  const imageInput = { getAttribute: () => 'image/*' };
  const pdfInput = {
    getAttribute: () => '*',
    dispatchEvent: () => { previewReady = true; },
  };
  const preview = new MockElement({ content: 'Tabela.pdf' });
  preview.querySelectorAll = () => [sendButton];
  const mockDoc = {
    querySelector: (selector) => selector === '#main' ? main : null,
    querySelectorAll(selector) {
      if (selector.startsWith('#main footer')) return [attach];
      if (selector === '[role="menuitem"]') return [documentMenuItem];
      if (selector === 'input[type="file"]') return documentInputReady ? [imageInput, pdfInput] : [imageInput];
      if (selector.startsWith('[role="dialog"]')) return previewReady ? [preview] : [];
      return [];
    },
    execCommand: (_command, _show, message) => {
      input.innerText = insertedText === null ? message : insertedText;
      input.textContent = input.innerText;
      return true;
    },
  };
  class MockDataTransfer {
    constructor() {
      this.files = [];
      this.items = { add: (file) => { this.files.push(file); } };
    }
  }
  class MockFile {
    constructor(chunks) { this.size = chunks.reduce((total, chunk) => total + chunk.length, 0); }
  }
  let now = 0;
  class Clock extends Date { static now() { now += 50; return now; } }
  vm.runInNewContext(contentScript, {
    chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; } } } },
    document: mockDoc, Element: MockElement, getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
    Date: Clock, setTimeout: (fn) => fn(), File: MockFile, DataTransfer: MockDataTransfer,
    Event: class {}, Uint8Array, atob, KeyboardEvent: class {},
  });
  return {
    send: (payload) => new Promise((resolve) => listener({ type: 'SEND_ITEM', payload: { phone, ...payload } }, {}, resolve)),
    sendClicks: () => clickedSend,
    documentSelected: () => documentSelected,
    draftText: () => input.innerText,
  };
}

const approvedText = 'Olá, Maria!\n\nSegue a tabela.\n✅ Duas opções disponíveis.';
const editorReformatted = approvedText.replace('Maria!', 'Maria!\u200e').replace('a tabela.', 'a\u00a0tabela.');
const multilineEditor = mockWhatsAppContent({ insertedText: editorReformatted });
const multilineResult = await multilineEditor.send({ kind: 'text', text: approvedText });
assert.equal(multilineResult.state, 'observed', `${multilineResult.detail} | ${JSON.stringify(multilineEditor.draftText())}`);
assert.equal(multilineEditor.sendClicks(), 1, 'somente uma tentativa confirmada');

const changedEditor = mockWhatsAppContent({ insertedText: 'Texto alterado que não foi aprovado' });
assert.equal((await changedEditor.send({ kind: 'text', text: approvedText })).state, 'uncertain');
assert.equal(changedEditor.sendClicks(), 0, 'texto divergente nunca pode ser enviado');

const docEditor = mockWhatsAppContent();
const pdfBytes = Buffer.from('%PDF-1.4\nBossa', 'utf8');
assert.equal((await docEditor.send({ kind: 'file', base64: pdfBytes.toString('base64'),
  filename: 'Tabela.pdf', size: pdfBytes.length })).state, 'observed');
assert.equal(docEditor.documentSelected(), true, 'deve clicar Documento antes do seletor genérico');
assert.equal(docEditor.sendClicks(), 1, 'anexo confirmado em única tentativa');

// A ponte do CRM não concede comandos a outra origem, e nenhuma navegação
// acontece após um pedido não autorizado.
let backgroundListener;
let navigationCount = 0;
vm.runInNewContext(readFileSync(resolve(root, 'extensions/bossa-whatsapp-web/background.js'), 'utf8'), {
  chrome: {
    runtime: { getManifest: () => ({ version: '0.1.1' }), onMessage: { addListener(fn) { backgroundListener = fn; } } },
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
assert.equal((await backgroundResponse({ source: 'bossa-crm-bridge', type: 'PING' }, 'https://crm.bossaempreendimentos.com.br/transmissoes')).result.version, '0.1.1');
assert.equal((await backgroundResponse({ source: 'bossa-crm-bridge', type: 'PING' }, 'https://malicious-preview.vercel.app/')).error, 'Origem não autorizada.');
assert.equal(navigationCount, 0);

// Navegação deve terminar antes de qualquer tentativa de envio. Um PING de
// outra conversa durante o carregamento não pode liberar SEND_ITEM.
let safeBackgroundListener;
let tabPolls = 0;
let sendItemCalls = 0;
let prematureMessageCalls = 0;
vm.runInNewContext(readFileSync(resolve(root, 'extensions/bossa-whatsapp-web/background.js'), 'utf8'), {
  chrome: {
    runtime: { getManifest: () => ({ version: '0.1.1' }), onMessage: { addListener(fn) { safeBackgroundListener = fn; } } },
    tabs: {
      query: async () => [{ id: 1, active: true }],
      update: async () => ({ id: 1 }),
      get: async () => ({ status: ++tabPolls < 3 ? 'loading' : 'complete' }),
      sendMessage: async (_tabId, message) => {
        if (tabPolls < 3) prematureMessageCalls++;
        if (message.type === 'PING') return { ready: true, conversationReady: true };
        sendItemCalls++;
        return { state: 'observed', detail: 'Bolha observada.' };
      },
    },
  },
  URL, setTimeout: (fn) => fn(),
});
const safeResponse = await new Promise((resolve) => safeBackgroundListener(command,
  { url: 'https://crm.bossaempreendimentos.com.br/transmissoes/navegador' }, resolve));
assert.equal(safeResponse.result.state, 'observed');
assert.equal(prematureMessageCalls, 0, 'não falar com documento antigo durante a navegação');
assert.equal(sendItemCalls, 1, 'sem repetição de etapa após navegar');

console.log('Browser campaigns: normalização, consentimento técnico, arquivos, proteção da extensão e falhas seguras OK.');
