from pathlib import Path


def replace_once(path: str, old: str, new: str):
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise RuntimeError(f'Expected block not found in {path}: {old[:120]!r}')
    file.write_text(text.replace(old, new, 1))


replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    """  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setNotice('');
    setTab(agent === 'nara' ? 'triagem' : 'simulador');
    setMessages([]);
    setScenario('');
    setFeedbackText('');
    setCorrectingIndex(null);
    setLastSimulation(null);

    fetch(`/api/ai-training?agent=${agent}`, { cache: 'no-store' })
      .then((response) => readJson<{ config: AgentConfig; examples: TrainingExample[]; ai?: AiStatus }>(response))
      .then((data) => {
        if (cancelled) return;
        setConfig(agent === 'nara' ? withNaraTriage(data.config) : data.config);
        setExamples(data.examples);
        setAi(data.ai ?? null);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar o treinamento.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [agent]);""",
    """  useEffect(() => {
    let cancelled = false;

    async function loadTraining() {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setError('');
      setNotice('');
      setTab(agent === 'nara' ? 'triagem' : 'simulador');
      setMessages([]);
      setScenario('');
      setFeedbackText('');
      setCorrectingIndex(null);
      setLastSimulation(null);

      try {
        const response = await fetch(`/api/ai-training?agent=${agent}`, { cache: 'no-store' });
        const data = await readJson<{ config: AgentConfig; examples: TrainingExample[]; ai?: AiStatus }>(response);
        if (cancelled) return;
        setConfig(agent === 'nara' ? withNaraTriage(data.config) : data.config);
        setExamples(data.examples);
        setAi(data.ai ?? null);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar o treinamento.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadTraining();
    return () => { cancelled = true; };
  }, [agent]);""",
)

replace_once(
    'src/app/legal/[documento]/page.tsx',
    "import { notFound } from 'next/navigation';\nimport type { Metadata } from 'next';",
    "import Link from 'next/link';\nimport { notFound } from 'next/navigation';\nimport type { Metadata } from 'next';",
)
replace_once(
    'src/app/legal/[documento]/page.tsx',
    """          <a href="/legal/privacidade">Privacidade</a>
          <a href="/legal/termos">Termos de uso</a>
          <a href="/legal/exclusao-de-dados">Exclusão de dados</a>""",
    """          <Link href="/legal/privacidade">Privacidade</Link>
          <Link href="/legal/termos">Termos de uso</Link>
          <Link href="/legal/exclusao-de-dados">Exclusão de dados</Link>""",
)

replace_once(
    'src/components/BroadcastsManager.tsx',
    """    try {
      let done = false;
      while (!done && !stopRef.current) {
        const response = await fetch(`/api/transmissoes/${broadcast.id}/send`, { method: 'POST' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Falha durante o envio da transmissão.');
        done = Boolean(payload.done);
        setBroadcasts((current) => current.map((item) => item.id === broadcast.id ? {
          ...item,
          status: done ? 'completed' : 'running',
          queued_count: payload.counts?.queued ?? item.queued_count,
          sent_count: payload.counts?.sent ?? item.sent_count,
          delivered_count: payload.counts?.delivered ?? item.delivered_count,
          read_count: payload.counts?.read ?? item.read_count,
          failed_count: payload.counts?.failed ?? item.failed_count,
        } : item));
        if (!done) await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
      setNotice(done ? `Transmissão “${broadcast.name}” concluída.` : `Envio pausado após o lote atual. Clique em Continuar para retomar.`);
      router.refresh();""",
    """    try {
      const completed = await (async () => {
        while (!stopRef.current) {
          const response = await fetch(`/api/transmissoes/${broadcast.id}/send`, { method: 'POST' });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || 'Falha durante o envio da transmissão.');
          const batchDone = Boolean(payload.done);
          setBroadcasts((current) => current.map((item) => item.id === broadcast.id ? {
            ...item,
            status: batchDone ? 'completed' : 'running',
            queued_count: payload.counts?.queued ?? item.queued_count,
            sent_count: payload.counts?.sent ?? item.sent_count,
            delivered_count: payload.counts?.delivered ?? item.delivered_count,
            read_count: payload.counts?.read ?? item.read_count,
            failed_count: payload.counts?.failed ?? item.failed_count,
          } : item));
          if (batchDone) return true;
          await new Promise((resolve) => window.setTimeout(resolve, 350));
        }
        return false;
      })();
      setNotice(completed ? `Transmissão “${broadcast.name}” concluída.` : `Envio pausado após o lote atual. Clique em Continuar para retomar.`);
      router.refresh();""",
)

replace_once(
    'src/components/DevelopmentLogosPanel.tsx',
    "newPath = `${organizationId}/${item.id}/brand/logo-${Date.now()}.jpg`;",
    "newPath = `${organizationId}/${item.id}/brand/logo-${crypto.randomUUID()}.jpg`;",
)

replace_once(
    'src/components/DevelopmentsManager.tsx',
    """  useEffect(() => {
    if (!selectedId && developments[0]) setSelectedId(developments[0].id);
  }, [developments, selectedId]);""",
    """  useEffect(() => {
    const firstDevelopmentId = developments[0]?.id;
    if (!selectedId && firstDevelopmentId) {
      queueMicrotask(() => setSelectedId((current) => current || firstDevelopmentId));
    }
  }, [developments, selectedId]);""",
)
replace_once(
    'src/components/DevelopmentsManager.tsx',
    "  useEffect(() => setDraft(item), [item]);",
    """  useEffect(() => {
    queueMicrotask(() => setDraft(item));
  }, [item]);""",
)

replace_once(
    'src/components/LeadDetail.tsx',
    """  useEffect(() => {
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);""",
    """  useEffect(() => {
    const updateClock = () => setClock(Date.now());
    const initialTimer = window.setTimeout(updateClock, 0);
    const timer = window.setInterval(updateClock, 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);""",
)

replace_once('src/components/LeadLifecycleActions.tsx', "  const [mounted, setMounted] = useState(false);\n", "")
replace_once(
    'src/components/LeadLifecycleActions.tsx',
    """  useEffect(() => {
    setMounted(true);
  }, []);

""",
    "",
)
replace_once(
    'src/components/LeadLifecycleActions.tsx',
    "  const returnPath = leadKind === 'cliente' ? '/clientes' : '/corretores';",
    "  const returnPath = leadKind === 'cliente' ? '/clientes' : '/corretores';\n  const portalTarget = typeof document === 'undefined' ? null : document.body;",
)
replace_once(
    'src/components/LeadLifecycleActions.tsx',
    "{mounted && dialogContent ? createPortal(dialogContent, document.body) : null}",
    "{portalTarget && dialogContent ? createPortal(dialogContent, portalTarget) : null}",
)

replace_once(
    'src/components/MetaTemplatesManager.tsx',
    "import { FormEvent, useEffect, useMemo, useState } from 'react';",
    "import { FormEvent, useMemo, useState } from 'react';",
)
replace_once(
    'src/components/MetaTemplatesManager.tsx',
    """  useEffect(() => {
    setBodyExamples((current) => Array.from({ length: variableCount }, (_, index) => current[index] ?? ''));
  }, [variableCount]);""",
    """  const visibleBodyExamples = useMemo(
    () => Array.from({ length: variableCount }, (_, index) => bodyExamples[index] ?? ''),
    [bodyExamples, variableCount],
  );""",
)
replace_once(
    'src/components/MetaTemplatesManager.tsx',
    "form.set('body_examples', JSON.stringify(bodyExamples));",
    "form.set('body_examples', JSON.stringify(visibleBodyExamples));",
)
replace_once(
    'src/components/MetaTemplatesManager.tsx',
    "form.set('buttons', JSON.stringify(buttons.map(({ id: _id, ...button }) => button)));",
    "form.set('buttons', JSON.stringify(buttons.map(({ type, text, value, example }) => ({ type, text, value, example }))));",
)
replace_once(
    'src/components/MetaTemplatesManager.tsx',
    "const previewBody = renderPreview(bodyText, bodyExamples);",
    "const previewBody = renderPreview(bodyText, visibleBodyExamples);",
)
replace_once(
    'src/components/MetaTemplatesManager.tsx',
    """{bodyExamples.map((example, index) => <div className="field" key={index}><label>{`{{${index + 1}}}`}</label><input className="input" value={example} onChange={(event) => setBodyExamples((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={`Exemplo ${index + 1}`} required /></div>)}""",
    """{visibleBodyExamples.map((example, index) => <div className="field" key={index}><label>{`{{${index + 1}}}`}</label><input className="input" value={example} onChange={(event) => setBodyExamples((current) => Array.from({ length: variableCount }, (_, itemIndex) => itemIndex === index ? event.target.value : current[itemIndex] ?? ''))} placeholder={`Exemplo ${index + 1}`} required /></div>)}""",
)

replace_once(
    'src/lib/whatsapp/webhookProcessor.ts',
    """  let { data: leadData, error: readError } = await args.admin
    .from('leads')""",
    """  const { data: existingLead, error: readError } = await args.admin
    .from('leads')""",
)
replace_once(
    'src/lib/whatsapp/webhookProcessor.ts',
    """    .eq('phone', args.waId)
    .maybeSingle();
  if (readError) throw readError;

  if (!leadData) {""",
    """    .eq('phone', args.waId)
    .maybeSingle();
  if (readError) throw readError;
  let leadData = existingLead;

  if (!leadData) {""",
)

Path('.env.example').write_text("""# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=

# Endereço público do CRM
NEXT_PUBLIC_APP_URL=http://localhost:3000
# O cadastro público fica fechado. Crie usuários por convite ou pelo painel administrativo.
NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP=false

# Meta / WhatsApp Cloud API — Desenvolvedor Direto (API-only)
META_APP_ID=
META_APP_SECRET=
# Informe explicitamente a versão habilitada no aplicativo Meta, por exemplo v26.0.
META_GRAPH_VERSION=
# Crie um valor aleatório forte e use exatamente o mesmo no painel de Webhooks da Meta.
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
# Chave Base64 que represente exatamente 32 bytes; usada para criptografar os tokens dos canais.
WHATSAPP_TOKEN_ENCRYPTION_KEY_BASE64=

# Modo operacional atual: conexão direta pela Cloud API, sem BSP ou Coexistência.
FEATURE_DIRECT_WHATSAPP_CONNECTION=true

# Embedded Signup/Coexistência é legado e deve permanecer desligado até uma futura reativação planejada.
FEATURE_EMBEDDED_SIGNUP=false
NEXT_PUBLIC_META_APP_ID=
NEXT_PUBLIC_META_CONFIG_ID=
NEXT_PUBLIC_META_GRAPH_VERSION=

# IA de atendimento e classificação (OpenAI / ChatGPT)
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-terra
OPENAI_MODEL_FALLBACK=gpt-5.6-luna
OPENAI_REASONING_EFFORT=low
OPENAI_MAX_OUTPUT_TOKENS=2400
OPENAI_VERBOSITY=low
OPENAI_TIMEOUT_MS=25000

# Workers de SLA, resgate e recuperação de webhooks.
# Use o mesmo valor no Vault do Supabase; nunca salve a chave real no GitHub.
CRON_SECRET=
""")

Path('next.config.ts').write_text("""import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
""")

Path('.github/workflows/validate.yml').write_text("""name: Validate Bossa CRM

on:
  push:
    branches:
      - main
  pull_request:

jobs:
  validate:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      NEXT_PUBLIC_SUPABASE_URL: https://example.supabase.co
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: sb_publishable_example
      SUPABASE_SECRET_KEY: sb_secret_example
      NEXT_PUBLIC_APP_URL: http://localhost:3000
      NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP: \"false\"
      META_APP_ID: \"123456789\"
      META_APP_SECRET: test-meta-secret
      META_GRAPH_VERSION: v26.0
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: test-webhook-token
      WHATSAPP_TOKEN_ENCRYPTION_KEY_BASE64: MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=
      FEATURE_EMBEDDED_SIGNUP: \"false\"
      FEATURE_DIRECT_WHATSAPP_CONNECTION: \"true\"
      OPENAI_API_KEY: test-openai-key
      OPENAI_MODEL: gpt-5.6-terra
      OPENAI_MODEL_FALLBACK: gpt-5.6-luna
      CRON_SECRET: test-cron-secret
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - name: Install dependencies
        run: npm ci --no-audit --no-fund
      - name: Validate environment
        run: npm run check-env
      - name: Lint
        run: npm run lint
      - name: Typecheck
        run: npm run typecheck
      - name: Build
        run: npm run build
""")
