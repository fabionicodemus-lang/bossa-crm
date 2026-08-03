import fs from 'node:fs';
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
