/*
 * Adaptador de interface visual. Não usa APIs privadas do WhatsApp, sessões,
 * cookies ou seletores ofuscados para burlar controles. Se a interface mudou,
 * retorna uncertain e exige revisão humana.
 */
(() => {
  const digits = (value) => String(value ?? '').replace(/\D/g, '');
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = (node) => {
    if (!node || !(node instanceof Element)) return false;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const text = (node) => String(node?.innerText ?? node?.textContent ?? '').trim();
  const normalizedMessage = (value) => String(value ?? '')
    .normalize('NFC')
    // O editor pode inserir marcas bidi e espaços não separáveis sem alterar
    // o texto visível. Nunca remover ZWJ/variantes que fazem parte de emojis.
    .replace(/[\u200e\u200f\u061c\u2066-\u2069\ufeff]/g, '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const editorMatches = (node, expected) => {
    const approved = normalizedMessage(expected);
    return [node?.innerText, node?.textContent].some((value) => normalizedMessage(value) === approved);
  };
  const phoneTokens = (value) => (String(value).match(/\+?\d[\d\s().-]{6,}\d/g) ?? []).map(digits);

  const waitFor = async (predicate, timeout = 30000) => {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      const result = predicate();
      if (result) return result;
      await sleep(350);
    }
    return null;
  };

  const main = () => document.querySelector('#main');
  const header = () => main()?.querySelector('header');
  const composer = () => main()?.querySelector('footer [contenteditable="true"][role="textbox"]')
    ?? main()?.querySelector('footer [contenteditable="true"]');

  async function waitForConversation() {
    return waitFor(() => visible(header()) && visible(composer()) && composer(), 55000);
  }

  function exactPhoneIn(textContent, phone) {
    return phoneTokens(textContent).some((candidate) => candidate === phone);
  }

  async function verifyPhone(phone) {
    if (!(await waitForConversation())) return false;
    const currentHeader = header();
    if (exactPhoneIn(text(currentHeader), phone)) return true;

    // Contatos salvos mostram nome em vez de telefone. Abrir os detalhes
    // e conferir o número VISÍVEL no painel antes de qualquer clique de envio.
    const control = currentHeader?.querySelector('[data-testid="conversation-info-header"]')
      ?? currentHeader?.querySelector('[role="button"]') ?? currentHeader;
    if (!control || !visible(control)) return false;
    control.click();

    const knownPanels = '[data-testid="drawer-right"], [data-testid="contact-info-drawer"], '
      + '[data-testid="conversation-info-drawer"], [data-testid="chat-info"], '
      + 'aside, [role="dialog"], [data-testid*="contact-info"]';
    const confirmed = await waitFor(() => {
      const panels = [...document.querySelectorAll(knownPanels)]
        .filter((panel) => visible(panel) && !main()?.contains(panel));
      if (panels.some((panel) => exactPhoneIn(text(panel), phone))) return true;

      // Algumas versões exibem o painel à direita sem data-testid estável.
      // Procurar exclusivamente texto de telefone no lado direito da conversa.
      const right = main()?.getBoundingClientRect().right ?? innerWidth * 0.6;
      return [...document.querySelectorAll('span,button')].some((node) => {
        if (!visible(node) || main()?.contains(node)) return false;
        const bounds = node.getBoundingClientRect();
        return bounds.left > right - 50 && bounds.width < 420
          && exactPhoneIn(text(node), phone);
      });
    }, 5000);

    // O WhatsApp Web atual fecha a ficha por um botão "Fechar" DENTRO do
    // drawer-right. Um "Voltar" global pode mudar de conversa e um Escape
    // sintético pode não ser reconhecido; nunca prosseguir com a ficha aberta.
    const drawer = [...document.querySelectorAll('[data-testid="drawer-right"], '
      + '[data-testid="contact-info-drawer"], [data-testid="conversation-info-drawer"], '
      + '[data-testid="chat-info"]')].find((node) => visible(node) && !main()?.contains(node));
    const close = drawer?.querySelector('button[aria-label="Fechar"], button[aria-label="Close"], '
      + '[data-icon="x"], [data-icon="back"]');
    if (!close || !visible(close)) return false;
    (close.closest('button,[role="button"]') ?? close).click();
    const restored = await waitFor(() => {
      const input = composer();
      return !visible(drawer) && visible(header()) && visible(input) && input;
    }, 8000);
    return Boolean(confirmed && restored);
  }

  function findSendButton(scope = document) {
    const icons = [...scope.querySelectorAll('[data-icon="send"], [data-testid="send"], [aria-label="Enviar"], [aria-label="Send"]')];
    const button = icons.map((node) => node.closest('button,[role="button"]') ?? node).find(visible);
    return button ?? null;
  }

  function observedOutgoing(before, expectedText) {
    const bubbles = [...(main()?.querySelectorAll('.message-out, [data-testid="msg-container"]') ?? [])];
    // Na interface atual o seletor msg-container inclui também mensagens
    // recebidas. Nunca registrar uma mensagem de terceiro como nosso envio.
    return bubbles.some((bubble) => !before.has(bubble) && visible(bubble)
      && (bubble.classList.contains('message-out') || Boolean(bubble.querySelector('[data-testid="tail-out"]')))
      && normalizedMessage(text(bubble)).includes(normalizedMessage(expectedText)));
  }

  async function sendText(message) {
    // Após abrir /send?phone ou fechar os detalhes, o WhatsApp recria o
    // compositor de forma assíncrona. Uma leitura imediata pode dar null.
    const input = await waitFor(() => {
      const node = composer();
      return visible(header()) && visible(node) && node;
    }, 12000);
    if (!input) throw new Error('Campo de mensagem indisponível após aguardar 12 segundos. Nenhum clique de envio foi realizado.');
    if (text(input)) throw new Error('Há um rascunho no campo. Confira manualmente antes de prosseguir.');
    const before = new Set(main()?.querySelectorAll('.message-out, [data-testid="msg-container"]') ?? []);
    input.focus();
    if (!document.execCommand('insertText', false, message))
      throw new Error('O WhatsApp não aceitou a digitação nesta versão.');
    // A composição de textos longos e multilinha pode re-renderizar o DOM
    // alguns instantes depois do insertText. Só liberar o clique se a cópia
    // integral e normalizada estiver presente; diferenças reais falham fechadas.
    if (!(await waitFor(() => editorMatches(input, message), 8000))) {
      const observed = normalizedMessage(input.innerText).length;
      throw new Error(`O texto inserido não corresponde à mensagem aprovada (${observed}/${normalizedMessage(message).length} caracteres). Nenhum clique de envio foi realizado.`);
    }
    const send = await waitFor(() => findSendButton(main()?.querySelector('footer') ?? document), 5000);
    if (!send) throw new Error('Botão Enviar indisponível.');
    send.click();
    if (!(await waitFor(() => observedOutgoing(before, message.trim().slice(0, 80)), 12000)))
      throw new Error('Clique realizado, mas a nova mensagem não apareceu na conversa. Verifique manualmente.');
    return { state: 'observed', detail: 'Bolha de mensagem observada na conversa após o clique.' };
  }

  function base64File(value, filename) {
    const decoded = atob(value);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
    return new File([bytes], filename, { type: 'application/pdf' });
  }

  async function sendFile(base64, filename, expectedSize) {
    if (!String(filename).toLowerCase().endsWith('.pdf')) throw new Error('Apenas PDFs são aceitos.');
    const file = base64File(base64, filename);
    if (file.size !== expectedSize || file.size > 8 * 1024 * 1024)
      throw new Error('O PDF recebido não corresponde ao arquivo aprovado.');
    const input = await waitFor(() => {
      const node = composer();
      return visible(header()) && visible(node) && node;
    }, 12000);
    if (!input) throw new Error('Campo de anexos indisponível após aguardar 12 segundos. Nenhum PDF foi enviado.');
    if (text(input)) throw new Error('Há uma mensagem em edição nesta conversa.');
    const before = new Set(main()?.querySelectorAll('.message-out, [data-testid="msg-container"]') ?? []);
    const attachIcon = [...document.querySelectorAll('#main footer [aria-label="Anexar"], #main footer [aria-label="Attach"], [data-icon="plus"], [data-icon="clip"], [title="Anexar"], [title="Attach"]')]
      .find((node) => visible(node) && main()?.contains(node));
    if (!attachIcon) throw new Error('Botão Anexar indisponível nesta versão do WhatsApp Web.');
    (attachIcon.closest('button,[role="button"]') ?? attachIcon).click();

    // No WhatsApp Web atual, "Anexar" abre um menu. Escolher explicitamente
    // "Documento" é necessário antes de existir um seletor que aceite PDFs.
    const documentItem = await waitFor(() => [...document.querySelectorAll('[role="menuitem"]')]
      .find((node) => visible(node) && /^(?:Documento|Document)$/i.test(node.getAttribute('aria-label') ?? text(node))), 6000);
    if (!documentItem) throw new Error('Opção Documento não encontrada no menu de anexos. Nenhum PDF foi enviado.');
    documentItem.click();

    const fileInput = await waitFor(() => [...document.querySelectorAll('input[type="file"]')]
      .find((node) => {
        const accepts = node.getAttribute('accept') ?? '';
        // O seletor de "Documento" apresenta accept="*" nesta versão.
        // Nunca aceitar image/*; só procurar este input APÓS escolher Documento.
        return accepts.includes('application/pdf') || accepts.includes('.pdf')
          || accepts === '' || accepts === '*' || accepts === '*/*';
      }), 8000);
    if (!fileInput) throw new Error('O seletor de documentos não está disponível nesta versão do WhatsApp Web. Anexe o PDF manualmente e confira o contato antes de prosseguir.');
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    const previewSend = await waitFor(() => {
      // Só clicar no botão de envio do preview, nunca no compositor principal.
      const candidates = [...document.querySelectorAll('[role="dialog"], [data-testid="media-editor"], [data-testid="media-preview"], [data-testid="document-preview"]')]
        .filter((node) => visible(node) && text(node).includes(filename));
      return candidates.map((node) => findSendButton(node)).find(Boolean) ?? null;
    }, 12000);
    if (!previewSend) throw new Error('Não foi possível confirmar nome e botão no preview do PDF. Confira manualmente.');
    previewSend.click();
    if (!(await waitFor(() => observedOutgoing(before, filename), 20000)))
      throw new Error('PDF enviado pela interface, mas o documento não apareceu na conversa. Conferir.');
    return { state: 'observed', detail: `Documento “${filename}” observado na conversa.` };
  }

  let busy = false;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'PING') {
      sendResponse({ ready: true, conversationReady: visible(header()) && visible(composer()) });
      return false;
    }
    if (message?.type !== 'SEND_ITEM') return false;
    if (busy) { sendResponse({ state: 'uncertain', detail: 'Outra etapa ainda está em execução nesta aba.' }); return false; }
    const payload = message.payload ?? {};
    const phone = String(payload.phone ?? '');
    busy = true;
    (async () => {
      if (!/^[1-9][0-9]{7,14}$/.test(phone)) throw new Error('Telefone não autorizado.');
      if (!(await verifyPhone(phone)))
        throw new Error('Não foi possível confirmar o telefone nos detalhes da conversa. Nenhum envio automático realizado.');
      if (payload.kind === 'text') return sendText(String(payload.text ?? ''));
      if (payload.kind === 'file') return sendFile(String(payload.base64 ?? ''), String(payload.filename ?? ''), Number(payload.size));
      throw new Error('Etapa de envio não reconhecida.');
    })().then((result) => sendResponse(result))
      .catch((cause) => sendResponse({ state: 'uncertain', detail: cause instanceof Error ? cause.message : 'Falha na interface do WhatsApp.' }))
      .finally(() => { busy = false; });
    return true;
  });
})();
