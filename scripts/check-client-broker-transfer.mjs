import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isBrokerRoutingSignal } from '../src/lib/nara-contact-routing.ts';

assert.equal(
  isBrokerRoutingSignal('Eu sou corretor da Juliana Imóveis e já temos seus imóveis em nosso sistema'),
  true,
);
assert.equal(
  isBrokerRoutingSignal('marliwursterimoveis agradece seu contato. Litoral Catarinense investimento seguro creci 59131F'),
  true,
);
assert.equal(isBrokerRoutingSignal('Meu corretor me indicou vocês'), false);
assert.equal(isBrokerRoutingSignal('Não sou corretor, quero comprar para mim'), false);

const processor = readFileSync(new URL('../src/lib/whatsapp/webhookProcessor.ts', import.meta.url), 'utf8');
const transfer = readFileSync(new URL('../src/lib/whatsapp/clientBrokerTransfer.ts', import.meta.url), 'utf8');

assert.match(processor, /routeClientBrokerFromBroadcast/);
assert.match(processor, /completePendingBrokerPortfolio/);
assert.match(processor, /recentBroadcast/);
assert.match(transfer, /function extractCreci/);
assert.match(transfer, /function extractCompany/);
assert.match(transfer, /kind: 'corretor'/);
assert.match(transfer, /WELCOME_TEMPLATE = 'boas_vindas_mact74'/);
assert.match(transfer, /selectAllEnterpriseFacadeIds/);
assert.match(transfer, /Soul/);
assert.match(transfer, /Flow Aptos/);
assert.match(transfer, /Alma Seahouses/);
assert.match(transfer, /owner_mode: 'human'/);
assert.match(transfer, /ai_enabled: false/);

console.log('Transferência cliente→corretor validada: identificação explícita/CRECI, Plantão, fachadas Soul/Flow/Alma e controle humano.');
