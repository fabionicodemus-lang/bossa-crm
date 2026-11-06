const CRM_ORIGINS = new Set(['https://crm.bossaempreendimentos.com.br', 'http://localhost:3000']);
const WA_ORIGIN = 'https://web.whatsapp.com';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: `${WA_ORIGIN}/*` });
  const tab = tabs.find((item) => item.active) ?? tabs[0];
  if (tab?.id) return tab;
  return chrome.tabs.create({ url: WA_ORIGIN, active: true });
}

async function waitContentScript(tabId) {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      if (result?.ready) return;
    } catch { /* O WhatsApp ainda está carregando. */ }
    await sleep(1200);
  }
  throw new Error('O WhatsApp Web não carregou. Confirme o login com QR code.');
}

async function sendItem(payload) {
  const phone = String(payload.phone ?? '');
  if (!/^[1-9][0-9]{7,14}$/.test(phone)) throw new Error('Telefone internacional inválido.');
  if (!['text', 'file'].includes(payload.kind)) throw new Error('Etapa não reconhecida.');
  if (payload.kind === 'text' && (typeof payload.text !== 'string' || !payload.text || payload.text.length > 4000))
    throw new Error('Mensagem inválida.');
  if (payload.kind === 'file' && (typeof payload.base64 !== 'string' || payload.base64.length > 12_000_000
    || !String(payload.filename).toLowerCase().endsWith('.pdf')))
    throw new Error('Anexo inválido.');

  const tab = await getWhatsAppTab();
  if (!tab.id) throw new Error('Aba do WhatsApp indisponível.');
  await chrome.tabs.update(tab.id, { active: true, url: `${WA_ORIGIN}/send?phone=${encodeURIComponent(phone)}` });
  if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
  await waitContentScript(tab.id);
  // A execução é uma única tentativa. Nunca reenviar após erro/timeout.
  return chrome.tabs.sendMessage(tab.id, { type: 'SEND_ITEM', payload });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const origin = (() => {
    try { return new URL(sender.url ?? sender.tab?.url ?? '').origin; }
    catch { return ''; }
  })();
  if (message?.source !== 'bossa-crm-bridge' || !CRM_ORIGINS.has(origin)) {
    sendResponse({ error: 'Origem não autorizada.' });
    return false;
  }
  if (message.type === 'PING') {
    sendResponse({ result: { state: 'observed', detail: 'Extensão instalada.' } });
    return false;
  }
  if (message.type !== 'SEND_ITEM') {
    sendResponse({ error: 'Comando não permitido.' });
    return false;
  }
  sendItem(message.payload ?? {})
    .then((result) => sendResponse({ result }))
    .catch((cause) => sendResponse({ error: cause instanceof Error ? cause.message : 'Falha ao abrir WhatsApp Web.' }));
  return true;
});
