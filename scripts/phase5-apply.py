from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f'Expected block not found in {path}: {old[:140]!r}')
    file.write_text(text.replace(old, new, 1))


# 1. Webhook type receives Meta Click-to-WhatsApp referral data.
replace_once(
    'src/lib/whatsapp/webhookTypes.ts',
    """  location?: Record<string, unknown>;
  contacts?: Array<Record<string, unknown>>;
  [key: string]: unknown;""",
    """  location?: Record<string, unknown>;
  contacts?: Array<Record<string, unknown>>;
  referral?: {
    source_type?: string;
    source_id?: string;
    source_url?: string;
    headline?: string;
    body?: string;
    ctwa_clid?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;""",
)

# 2. Pure attribution helper shared by webhook, pipeline and lead detail.
Path('src/lib/meta-ad-attribution.ts').write_text(r"""import type { MetaWebhookMessage } from '@/lib/whatsapp/webhookTypes';

export interface MetaAdAttribution {
  ctwa_clid?: string;
  source_id?: string;
  source_url?: string;
  headline?: string;
  body?: string;
  source_type?: string;
  captured_at: string;
}

export interface MetaAdAttributionMerge {
  metadata: Record<string, unknown>;
  firstAttribution: boolean;
  historyAppended: boolean;
  sourceLabel: string | null;
}

function textValue(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

function normalizeAttribution(
  referral: MetaWebhookMessage['referral'] | undefined,
  capturedAt: string,
): MetaAdAttribution | null {
  if (!referral || typeof referral !== 'object') return null;
  const normalized: MetaAdAttribution = {
    ctwa_clid: textValue(referral.ctwa_clid),
    source_id: textValue(referral.source_id),
    source_url: textValue(referral.source_url),
    headline: textValue(referral.headline),
    body: textValue(referral.body),
    source_type: textValue(referral.source_type),
    captured_at: capturedAt,
  };
  const hasReferralData = Boolean(
    normalized.ctwa_clid
    || normalized.source_id
    || normalized.source_url
    || normalized.headline
    || normalized.body
    || normalized.source_type,
  );
  return hasReferralData ? normalized : null;
}

function attributionFromUnknown(value: unknown): MetaAdAttribution | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const capturedAt = textValue(record.captured_at);
  if (!capturedAt) return null;
  return normalizeAttribution({
    ctwa_clid: textValue(record.ctwa_clid),
    source_id: textValue(record.source_id),
    source_url: textValue(record.source_url),
    headline: textValue(record.headline),
    body: textValue(record.body),
    source_type: textValue(record.source_type),
  }, capturedAt);
}

function attributionKey(value: MetaAdAttribution): string {
  if (value.ctwa_clid) return `ctwa:${value.ctwa_clid}`;
  return [value.source_id, value.source_url, value.headline, value.body, value.source_type]
    .map((item) => item ?? '')
    .join('|');
}

export function readMetaAdAttribution(
  metadata: Record<string, unknown> | null | undefined,
): MetaAdAttribution | null {
  return attributionFromUnknown(metadata?.ad);
}

export function metaAdSourceLabel(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const attribution = readMetaAdAttribution(metadata);
  if (!attribution) return null;
  if (attribution.headline) return `Anúncio Meta · ${attribution.headline}`;
  if (attribution.source_id) return `Anúncio Meta · ${attribution.source_id}`;
  return 'Anúncio Meta';
}

export function mergeMetaAdAttribution(
  currentMetadata: Record<string, unknown> | null | undefined,
  referral: MetaWebhookMessage['referral'] | undefined,
  capturedAt: string,
): MetaAdAttributionMerge {
  const metadata = { ...(currentMetadata ?? {}) };
  const incoming = normalizeAttribution(referral, capturedAt);
  const first = readMetaAdAttribution(metadata);

  if (!incoming) {
    return {
      metadata,
      firstAttribution: false,
      historyAppended: false,
      sourceLabel: metaAdSourceLabel(metadata),
    };
  }

  if (!first) {
    metadata.ad = incoming;
    return {
      metadata,
      firstAttribution: true,
      historyAppended: false,
      sourceLabel: metaAdSourceLabel(metadata),
    };
  }

  const incomingKey = attributionKey(incoming);
  const history = Array.isArray(metadata.ad_history)
    ? metadata.ad_history.map(attributionFromUnknown).filter((item): item is MetaAdAttribution => Boolean(item))
    : [];
  const alreadyCaptured = attributionKey(first) === incomingKey
    || history.some((item) => attributionKey(item) === incomingKey);

  if (!alreadyCaptured) {
    metadata.ad_history = [...history, incoming];
  }

  return {
    metadata,
    firstAttribution: false,
    historyAppended: !alreadyCaptured,
    sourceLabel: metaAdSourceLabel(metadata),
  };
}
""")

# 3. Capture and preserve attribution in the WhatsApp webhook processor.
replace_once(
    'src/lib/whatsapp/webhookProcessor.ts',
    "import { aiCanReply } from '@/lib/hybrid';\n",
    "import { aiCanReply } from '@/lib/hybrid';\nimport { mergeMetaAdAttribution } from '@/lib/meta-ad-attribution';\n",
)
replace_once(
    'src/lib/whatsapp/webhookProcessor.ts',
    """  contactName: string;
  receivedAt: string;
}) {
  const kind: LeadKind = args.channel.role;""",
    """  contactName: string;
  receivedAt: string;
  referral?: MetaWebhookMessage['referral'];
}) {
  const kind: LeadKind = args.channel.role;""",
)
replace_once(
    'src/lib/whatsapp/webhookProcessor.ts',
    """  if (!leadData) {
    const { data, error } = await args.admin.from('leads').insert({""",
    """  if (!leadData) {
    const attribution = mergeMetaAdAttribution({}, args.referral, args.receivedAt);
    const { data, error } = await args.admin.from('leads').insert({""",
)
replace_once(
    'src/lib/whatsapp/webhookProcessor.ts',
    """      stage: 'novo_triagem',
      source: 'WhatsApp',
      company: kind === 'corretor' ? 'Não informada' : null,""",
    """      stage: 'novo_triagem',
      source: attribution.sourceLabel || 'WhatsApp',
      company: kind === 'corretor' ? 'Não informada' : null,""",
)
replace_once(
    'src/lib/whatsapp/webhookProcessor.ts',
    """      last_inbound_at: args.receivedAt,
      metadata: {},
    }).select('*').single();""",
    """      last_inbound_at: args.receivedAt,
      metadata: attribution.metadata,
    }).select('*').single();""",
)
replace_once(
    'src/lib/whatsapp/webhookProcessor.ts',
    """    contactName: args.contactName,
    receivedAt: createdAt,
  });""",
    """    contactName: args.contactName,
    receivedAt: createdAt,
    referral: args.message.referral,
  });""",
)
replace_once(
    'src/lib/whatsapp/webhookProcessor.ts',
    """  const metadata = {
    ...(lead.metadata || {}),
    whatsapp_channel_id: args.channel.id,
    whatsapp_conversation_id: conversation.id,
    whatsapp_window_expires_at: conversation.window_expires_at,
  };
  await args.admin.from('leads').update({
    name: lead.name === lead.phone && args.contactName ? args.contactName : lead.name,
    last_inbound_at: createdAt,
    metadata,
    updated_at: new Date().toISOString(),
  }).eq('id', lead.id);""",
    """  const attribution = mergeMetaAdAttribution(lead.metadata, args.message.referral, createdAt);
  const metadata = {
    ...attribution.metadata,
    whatsapp_channel_id: args.channel.id,
    whatsapp_conversation_id: conversation.id,
    whatsapp_window_expires_at: conversation.window_expires_at,
  };
  await args.admin.from('leads').update({
    name: lead.name === lead.phone && args.contactName ? args.contactName : lead.name,
    source: attribution.firstAttribution && attribution.sourceLabel ? attribution.sourceLabel : lead.source,
    last_inbound_at: createdAt,
    metadata,
    updated_at: new Date().toISOString(),
  }).eq('id', lead.id);""",
)

# 4. Lead pipeline: readable attribution and XLSX export without exposing ctwa_clid.
replace_once(
    'src/components/PipelineBoard.tsx',
    "import { createClient } from '@/lib/supabase/client';\n",
    "import { createClient } from '@/lib/supabase/client';\nimport { metaAdSourceLabel, readMetaAdAttribution } from '@/lib/meta-ad-attribution';\n",
)
replace_once(
    'src/components/PipelineBoard.tsx',
    """    return leads.filter((lead) => [lead.name, lead.phone, lead.enterprise, lead.company, lead.source, lead.priority_class, lead.next_action]
      .some((value) => String(value ?? '').toLowerCase().includes(q)));""",
    """    return leads.filter((lead) => [lead.name, lead.phone, lead.enterprise, lead.company, lead.source, metaAdSourceLabel(lead.metadata), lead.priority_class, lead.next_action]
      .some((value) => String(value ?? '').toLowerCase().includes(q)));""",
)
replace_once(
    'src/components/PipelineBoard.tsx',
    """    setSaving(false);
  }

  return (""",
    """    setSaving(false);
  }

  async function exportXlsx() {
    const XLSX = await import('xlsx');
    const rows = filtered.map((lead) => {
      const ad = readMetaAdAttribution(lead.metadata);
      return {
        Tipo: lead.kind === 'cliente' ? 'Cliente' : 'Corretor',
        Nome: lead.name,
        WhatsApp: displayPhone(lead.phone),
        Email: lead.email || '',
        Etapa: stages.find((stage) => stage.id === lead.stage)?.label || lead.stage,
        Origem: metaAdSourceLabel(lead.metadata) || lead.source || '',
        Empreendimento: lead.enterprise || '',
        Imobiliária: lead.company || '',
        CRECI: lead.creci || '',
        Score: lead.temperature,
        'ID do anúncio Meta': ad?.source_id || '',
        'URL do anúncio Meta': ad?.source_url || '',
        'Título do anúncio Meta': ad?.headline || '',
        'Texto do anúncio Meta': ad?.body || '',
        'Tipo da origem Meta': ad?.source_type || '',
        'Origem capturada em': ad?.captured_at || '',
        'Criado em': lead.created_at,
      };
    });
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, kind === 'cliente' ? 'Clientes' : 'Corretores');
    XLSX.writeFile(workbook, `${kind === 'cliente' ? 'clientes' : 'corretores'}-bossa-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (""",
)
replace_once(
    'src/components/PipelineBoard.tsx',
    """          <input className="input" style={{ width: 230 }} placeholder="Buscar nome, ação, prioridade…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {canEdit && <>""",
    """          <input className="input" style={{ width: 230 }} placeholder="Buscar nome, ação, prioridade…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn btn-ghost btn-sm" onClick={() => void exportXlsx()}>⬇ Exportar XLSX</button>
          {canEdit && <>""",
)
replace_once(
    'src/components/PipelineBoard.tsx',
    """                const due = dueLabel(lead.next_action_due_at);
                const overdue = Boolean(due?.startsWith('⚠️'));
                return <Link""",
    """                const due = dueLabel(lead.next_action_due_at);
                const overdue = Boolean(due?.startsWith('⚠️'));
                const readableSource = kind === 'cliente' ? metaAdSourceLabel(lead.metadata) || lead.source : lead.group_name;
                return <Link""",
)
replace_once(
    'src/components/PipelineBoard.tsx',
    """                    <span className="chip">{kind === 'cliente' ? lead.source || 'Sem origem' : lead.group_name || 'Sem grupo'}</span>""",
    """                    <span className="chip">{readableSource || (kind === 'cliente' ? 'Sem origem' : 'Sem grupo')}</span>""",
)

# 5. Lead detail: readable ad origin, without raw ctwa_clid.
replace_once(
    'src/components/LeadDetail.tsx',
    "import { createClient } from '@/lib/supabase/client';\n",
    "import { createClient } from '@/lib/supabase/client';\nimport { metaAdSourceLabel, readMetaAdAttribution } from '@/lib/meta-ad-attribution';\n",
)
replace_once(
    'src/components/LeadDetail.tsx',
    """  const usage = useMemo(() => readAiUsage(lead.metadata), [lead.metadata]);
  const metaEntries = useMemo(() => Object.entries(lead.metadata || {}).filter(([key, value]) => ![
    'ai_usage',""",
    """  const usage = useMemo(() => readAiUsage(lead.metadata), [lead.metadata]);
  const adAttribution = useMemo(() => readMetaAdAttribution(lead.metadata), [lead.metadata]);
  const sourceLabel = useMemo(() => metaAdSourceLabel(lead.metadata) || lead.source || 'Origem não informada', [lead.metadata, lead.source]);
  const metaEntries = useMemo(() => Object.entries(lead.metadata || {}).filter(([key, value]) => ![
    'ad',
    'ad_history',
    'ai_usage',""",
)
replace_once(
    'src/components/LeadDetail.tsx',
    """{lead.kind === 'cliente' ? `${lead.enterprise || 'Empreendimento não informado'} · ${lead.source || 'Origem não informada'}` : `${lead.company || 'Autônomo'} · ${lead.group_name || 'Sem grupo'}`}""",
    """{lead.kind === 'cliente' ? `${lead.enterprise || 'Empreendimento não informado'} · ${sourceLabel}` : `${lead.company || 'Autônomo'} · ${lead.group_name || 'Sem grupo'}`}""",
)
replace_once(
    'src/components/LeadDetail.tsx',
    """<div className="info-row"><span>Criado em</span><strong>{formatDateTime(lead.created_at)}</strong></div></div>{metaEntries.length > 0""",
    """<div className="info-row"><span>Criado em</span><strong>{formatDateTime(lead.created_at)}</strong></div></div>{adAttribution && <div style={{ gridColumn: '1 / -1' }}><h4>Origem do anúncio Meta</h4><div className="info-list"><div className="info-row"><span>Origem</span><strong>{sourceLabel}</strong></div><div className="info-row"><span>ID do anúncio</span><strong>{adAttribution.source_id || '—'}</strong></div><div className="info-row"><span>Tipo</span><strong>{adAttribution.source_type || '—'}</strong></div><div className="info-row"><span>URL</span><strong style={{ overflowWrap: 'anywhere' }}>{adAttribution.source_url || '—'}</strong></div><div className="info-row"><span>Título</span><strong>{adAttribution.headline || '—'}</strong></div><div className="info-row"><span>Texto</span><strong>{adAttribution.body || '—'}</strong></div><div className="info-row"><span>Capturado em</span><strong>{formatDateTime(adAttribution.captured_at)}</strong></div></div></div>}{metaEntries.length > 0""",
)

# 6. Expression index file only; it is intentionally not executed here.
Path('supabase/migrations/015_meta_ad_referral_attribution.sql').write_text(r"""-- BOSSA CRM — atribuição de anúncios Click-to-WhatsApp da Meta
-- Arquivo criado na Fase 5. Não executar automaticamente sem aprovação.

create index if not exists leads_meta_ad_source_id_idx
  on public.leads (organization_id, ((metadata -> 'ad' ->> 'source_id')))
  where kind = 'cliente'
    and metadata -> 'ad' ->> 'source_id' is not null;

comment on index public.leads_meta_ad_source_id_idx is
  'Permite consultar e agrupar leads pelo ID do anúncio Meta preservado em metadata.ad.source_id.';
""")
replace_once(
    'supabase/migrations/README.md',
    """15. `014_whatsapp_coexistencia.sql`

Os dois arquivos""",
    """15. `014_whatsapp_coexistencia.sql`
16. `015_meta_ad_referral_attribution.sql`

Os dois arquivos""",
)
replace_once(
    'supabase/migrations/README.md',
    "O próximo número disponível é `015`.",
    "O próximo número disponível é `016`.",
)

# 7. Deterministic acceptance simulation, kept as a regression test.
Path('scripts/check-meta-referral.mjs').write_text(r"""import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const sourcePath = 'src/lib/meta-ad-attribution.ts';
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
  fileName: sourcePath,
}).outputText;
const target = path.join(os.tmpdir(), `meta-ad-attribution-${Date.now()}.cjs`);
fs.writeFileSync(target, compiled);
const require = createRequire(import.meta.url);
const { mergeMetaAdAttribution } = require(target);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const firstMessage = {
  id: 'wamid-first',
  from: '5547999999999',
  type: 'text',
  text: { body: 'Tenho interesse no Flow' },
  referral: {
    source_type: 'ad',
    source_id: '120000000001',
    source_url: 'https://www.facebook.com/ads/example-flow',
    headline: 'Flow Aptos · conheça o empreendimento',
    body: 'Apartamentos em Porto Belo',
    ctwa_clid: 'fake-click-id-first',
  },
};
const firstCapturedAt = '2026-08-03T20:00:00.000Z';
const first = mergeMetaAdAttribution({}, firstMessage.referral, firstCapturedAt);
const createdFromAd = {
  source: first.sourceLabel || 'WhatsApp',
  metadata: first.metadata,
};
assert(createdFromAd.source === 'Anúncio Meta · Flow Aptos · conheça o empreendimento', 'Fonte legível incorreta');
assert(createdFromAd.metadata.ad.source_id === '120000000001', 'source_id não foi salvo');
assert(createdFromAd.metadata.ad.ctwa_clid === 'fake-click-id-first', 'ctwa_clid técnico não foi preservado');
assert(createdFromAd.metadata.ad.captured_at === firstCapturedAt, 'captured_at incorreto');

const organicMessage = {
  id: 'wamid-organic',
  from: '5547888888888',
  type: 'text',
  text: { body: 'Oi, queria conhecer os apartamentos' },
};
const organic = mergeMetaAdAttribution({}, organicMessage.referral, '2026-08-03T20:05:00.000Z');
const createdOrganic = {
  source: organic.sourceLabel || 'WhatsApp',
  metadata: organic.metadata,
};
assert(createdOrganic.source === 'WhatsApp', 'Contato orgânico deixou de usar WhatsApp');
assert(!createdOrganic.metadata.ad, 'Contato orgânico recebeu atribuição indevida');

const secondMessage = {
  id: 'wamid-second',
  from: '5547999999999',
  type: 'text',
  text: { body: 'Também vi o anúncio do Alma' },
  referral: {
    source_type: 'ad',
    source_id: '120000000002',
    source_url: 'https://www.instagram.com/ads/example-alma',
    headline: 'Alma Seahouses',
    body: 'Wellness perto do mar',
    ctwa_clid: 'fake-click-id-second',
  },
};
const second = mergeMetaAdAttribution(createdFromAd.metadata, secondMessage.referral, '2026-08-03T20:10:00.000Z');
const updatedLead = {
  source: createdFromAd.source,
  metadata: second.metadata,
};
assert(updatedLead.source === createdFromAd.source, 'A origem legível inicial foi sobrescrita');
assert(updatedLead.metadata.ad.source_id === '120000000001', 'A primeira atribuição foi sobrescrita');
assert(Array.isArray(updatedLead.metadata.ad_history), 'Histórico de anúncios não foi criado');
assert(updatedLead.metadata.ad_history.length === 1, 'Histórico deveria conter uma atribuição nova');
assert(updatedLead.metadata.ad_history[0].source_id === '120000000002', 'Histórico não contém o segundo anúncio');

const replay = mergeMetaAdAttribution(updatedLead.metadata, secondMessage.referral, '2026-08-03T20:11:00.000Z');
assert(replay.metadata.ad_history.length === 1, 'Replay do mesmo referral duplicou o histórico');

console.log(JSON.stringify({
  webhookComReferral: {
    source: createdFromAd.source,
    metadata: {
      ad: {
        source_id: createdFromAd.metadata.ad.source_id,
        source_url: createdFromAd.metadata.ad.source_url,
        headline: createdFromAd.metadata.ad.headline,
        body: createdFromAd.metadata.ad.body,
        source_type: createdFromAd.metadata.ad.source_type,
        captured_at: createdFromAd.metadata.ad.captured_at,
        ctwa_clid_stored: Boolean(createdFromAd.metadata.ad.ctwa_clid),
      },
    },
  },
  webhookOrganico: createdOrganic,
  segundaMensagemOutroAnuncio: {
    sourcePreservada: updatedLead.source,
    primeiroSourceId: updatedLead.metadata.ad.source_id,
    historico: updatedLead.metadata.ad_history.map((item) => ({
      source_id: item.source_id,
      headline: item.headline,
      captured_at: item.captured_at,
    })),
  },
}, null, 2));
""")
replace_once(
    'package.json',
    '"check-env": "node scripts/check-env.mjs"',
    '"check-env": "node scripts/check-env.mjs",\n    "test:meta-referral": "node scripts/check-meta-referral.mjs"',
)
