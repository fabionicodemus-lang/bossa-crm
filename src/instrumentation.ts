type OpenAiContentBlock = {
  type?: string;
  [key: string]: unknown;
};

type OpenAiInputMessage = {
  role?: string;
  content?: string | OpenAiContentBlock[];
  [key: string]: unknown;
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function normalizeOpenAiBody(body: BodyInit | null | undefined): BodyInit | null | undefined {
  if (typeof body !== 'string') return body;

  try {
    const payload = JSON.parse(body) as { input?: unknown };
    if (!Array.isArray(payload.input)) return body;

    let changed = false;
    payload.input = payload.input.map((item) => {
      if (!item || typeof item !== 'object') return item;

      const message = item as OpenAiInputMessage;
      if (message.role !== 'assistant' || !Array.isArray(message.content)) return item;

      const content = message.content.map((block) => {
        if (!block || typeof block !== 'object' || block.type !== 'input_text') return block;
        changed = true;
        const { prompt_cache_breakpoint: _cacheBreakpoint, ...rest } = block;
        return { ...rest, type: 'output_text' };
      });

      return { ...message, content };
    });

    return changed ? JSON.stringify(payload) : body;
  } catch {
    return body;
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const originalFetch = globalThis.fetch;
  const marker = '__bossaOpenAiHistoryPatched';
  const markedFetch = originalFetch as typeof fetch & Record<string, unknown>;
  if (markedFetch[marker]) return;

  const patchedFetch: typeof fetch = async (input, init) => {
    const url = requestUrl(input);
    if (!url.startsWith('https://api.openai.com/v1/responses')) {
      return originalFetch(input, init);
    }

    const nextInit = init
      ? { ...init, body: normalizeOpenAiBody(init.body) }
      : init;

    return originalFetch(input, nextInit);
  };

  (patchedFetch as typeof fetch & Record<string, unknown>)[marker] = true;
  globalThis.fetch = patchedFetch;
}
