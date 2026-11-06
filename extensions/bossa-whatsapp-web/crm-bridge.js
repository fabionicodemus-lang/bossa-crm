/* Somente a página de origem autorizada pode solicitar uma etapa. */
(() => {
  const allowedOrigins = new Set([
    'https://crm.bossaempreendimentos.com.br',
    'https://bossa-crm-homologacao-git-feat-browser-whatsapp-62bda2-elos-os.vercel.app',
    'http://localhost:3000',
  ]);
  if (!allowedOrigins.has(location.origin)) return;
  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (data?.source !== 'bossa-crm-page' || !['PING', 'SEND_ITEM'].includes(data.type)
      || typeof data.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(data.requestId)) return;
    try {
      const result = await chrome.runtime.sendMessage({
        source: 'bossa-crm-bridge', type: data.type, payload: data.payload ?? {},
      });
      window.postMessage({ source: 'bossa-chrome-extension', requestId: data.requestId,
        ...(result?.error ? { error: result.error } : { result: result?.result ?? result }) }, location.origin);
    } catch (cause) {
      window.postMessage({ source: 'bossa-chrome-extension', requestId: data.requestId,
        error: cause instanceof Error ? cause.message : 'Falha na extensão.' }, location.origin);
    }
  });
})();
