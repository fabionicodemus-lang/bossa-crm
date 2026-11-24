import assert from 'node:assert/strict';
import { purchaseRelationship, directPurchaseCents, hasDirectPurchasePolicy } from '../src/lib/nara-direct-purchase.ts';
import { isCompletePaymentQuote, paymentQuoteSum } from '../src/lib/unit-payment-tables.ts';
import { consultarApartamento, buscarApartamentos, faixaEmpreendimento, loadNaraCommercialTurnContext } from '../src/lib/nara-unit-queries.ts';
import { approvedDirectPurchaseInformation, approvedPaymentTableInquiry, protectNaraCommercialReply } from '../src/lib/nara-commercial-guard.ts';
import { applyNaraFinancialHandoff } from '../src/lib/nara-sales-handoff.ts';
import { buildNaraOfferAuditRecords } from '../src/lib/nara-offer-log.ts';
import { generateAiTurn } from '../src/lib/ai-v120.ts';
import { isBrokerRoutingSignal, isCurrentCustomerSignal } from '../src/lib/nara-contact-routing.ts';

const policy = { version: 1, approved: true, valuation_date: '2026-11-24', handover_month: '2027-11',
  cash_basis_cents: 75000000, list_basis_cents: 98659000, reference_entry_cents: 20000000,
  reference_installment_cents: 485983, reference_installment_count: 60,
  reference_reinforcement_cents: 5900000, reference_reinforcement_count: 5, reference_keys_cents: 20000000 };
const directPolicy = { version: 1, approved: true, discount_bps: 400, table_commission_bps: 500 };
const unit = { id: '1802', organization_id: 'org', development_id: 'flow', typology_id: null,
  unit_code: '1802', status: 'disponivel', list_price: 986590, entry_amount: 200000,
  installment_count: 60, installment_amount: 4859.83, reinforcement_count: 5, reinforcement_amount: 59000,
  keys_amount: 200000, payment_plan: {}, price_updated_at: '2026-10-27T19:13:29Z' };
const development = { id: 'flow', organization_id: 'org', active: true, name: 'Flow Aptos', slug: 'flow-aptos',
  default_payment_plan: { payment_tables: policy, direct_purchase: directPolicy } };
const db = { developments: [development], development_units: [unit, { ...unit, id: 'sold', unit_code: '999', status: 'vendido' }], development_typologies: [] };
class Query {
  constructor(rows) { this.rows = rows; this.filters = []; }
  select() { return this; }
  eq(k,v) { this.filters.push(r=>r[k]===v); return this; }
  gt(k,v) { this.filters.push(r=>Number(r[k])>v); return this; }
  gte(k,v) { this.filters.push(r=>Number(r[k])>=v); return this; }
  lte(k,v) { this.filters.push(r=>Number(r[k])<=v); return this; }
  in(k,v) { this.filters.push(r=>v.includes(r[k])); return this; }
  order() { return this; }
  limit(n) { this.max=n; return this; }
  result() { return {data:this.rows.filter(r=>this.filters.every(f=>f(r))).slice(0,this.max),error:null}; }
  then(a,b) { return Promise.resolve(this.result()).then(a,b); }
  maybeSingle() { return Promise.resolve({...this.result(),data:this.result().data[0]??null}); }
}
const client = {from:name=>new Query(db[name]??[])};
const lead = { kind: 'cliente', source: 'google', metadata: {}, creci: null, enterprise: 'Flow',
  id: 'synthetic', organization_id: 'org', phone: '5547999990000', stage: 'ia', owner_mode: 'ai', ai_enabled: true, opt_out: false, automation_paused: false };
const chat = text => [{role:'user',content:text}];
assert.equal(purchaseRelationship(lead,chat('Quero comprar direto com a construtora')), 'unknown');
assert.equal(purchaseRelationship(lead,chat('Não tenho corretor')), 'direct_confirmed');
assert.equal(purchaseRelationship(lead,chat('Sou cliente direto')), 'direct_confirmed');
assert.equal(isCurrentCustomerSignal('Sou cliente direto'),false);
assert.equal(isBrokerRoutingSignal('Estou comprando sem corretor e sem comissão'),false);
assert.equal(purchaseRelationship(lead,chat('Tenho um corretor, mas quero comprar sem corretor')), 'intermediated');
assert.equal(purchaseRelationship({...lead,kind:'corretor'},chat('Não tenho corretor')), 'intermediated');
assert.equal(purchaseRelationship({...lead,source:'Indicação de imobiliária'},chat('Não tenho corretor')), 'intermediated');
assert.equal(purchaseRelationship({...lead,metadata:{broker_id:'broker'}},chat('Não tenho corretor')), 'intermediated');
assert.equal(purchaseRelationship(lead,[...chat('Meu corretor me indicou'),...chat('Não tenho corretor')]),'intermediated');
assert.equal(hasDirectPurchasePolicy({direct_purchase:{...directPolicy,discount_bps:500}}),false);
assert.equal(directPurchaseCents(75000000),72000000);
const original = structuredClone(unit);
const normal = await consultarApartamento(client,'org','Flow','1802');
const direct = await consultarApartamento(client,'org','Flow','1802','direct_confirmed');
assert.equal(normal.valor,750000);
assert.equal(direct.valor,720000);
assert.deepEqual(direct.tabelas_pagamento.map(q=>q.totalCents),[72000000,86148395,89321379,94712640]);
for(const q of direct.tabelas_pagamento) { assert.ok(isCompletePaymentQuote(q)); assert.equal(paymentQuoteSum(q),q.totalCents); if(q.reinforcementCount)assert.equal(q.reinforcementCents,5664000); }
assert.deepEqual(unit,original,'source unit and commissioned tables are unchanged');
assert.equal((await consultarApartamento(client,'org','Flow','1802','direct_confirmed')).valor,720000,'new lookup does not compound the discount');
assert.equal(await consultarApartamento(client,'other-org','Flow','1802','direct_confirmed'),null);
assert.equal(await consultarApartamento(client,'org','Flow','999','direct_confirmed'),null);
assert.equal((await buscarApartamentos(client,'org',{empreendimento:'Flow',valor_max:725000},'direct_confirmed')).length,1);
assert.equal((await buscarApartamentos(client,'org',{empreendimento:'Flow',valor_max:725000})).length,0);
assert.equal((await faixaEmpreendimento(client,'org','Flow','direct_confirmed')).valor_minimo,720000);
development.default_payment_plan.direct_purchase.approved = false;
assert.equal((await consultarApartamento(client,'org','Flow','1802','direct_confirmed')).valor,750000);
development.default_payment_plan.direct_purchase.approved = true;

const unknownHistory = chat('Qual o valor à vista do 1802 do Flow?');
const unknown = await loadNaraCommercialTurnContext(client,'org',lead,unknownHistory);
const opening = approvedDirectPurchaseInformation(unknown,unknownHistory);
assert.match(opening,/750\.000,00/); assert.match(opening,/algum corretor/); assert.doesNotMatch(opening,/720\.000|comiss|4%|5%/);
const confirmedHistory = [...unknownHistory,{role:'assistant',content:opening},...chat('Não')];
const confirmed = await loadNaraCommercialTurnContext(client,'org',lead,confirmedHistory);
const answer = approvedDirectPurchaseInformation(confirmed,confirmedHistory);
assert.match(answer,/1802.*720\.000,00/); assert.match(answer,/compra direta/i); assert.doesNotMatch(answer,/comiss|4%|5%/);
const confirmed36History = [...chat('Qual o preço do 1802 do Flow em 36x?'),{role:'assistant',content:opening},...chat('Não')];
const confirmed36 = await loadNaraCommercialTurnContext(client,'org',lead,confirmed36History);
assert.match(approvedDirectPurchaseInformation(confirmed36,confirmed36History),/861\.483,95/);
const genericHistory=[...confirmedHistory,...chat('E parcelado?')];
const genericContext=await loadNaraCommercialTurnContext(client,'org',lead,genericHistory);
const genericReply=approvedDirectPurchaseInformation(genericContext,genericHistory);
assert.match(genericReply,/36, 48 ou 60/);assert.doesNotMatch(genericReply,/720\.000|750\.000/);
const termHistory=[...genericHistory,{role:'assistant',content:genericReply},...chat('36')];
const termContext=await loadNaraCommercialTurnContext(client,'org',lead,termHistory);
assert.match(approvedDirectPurchaseInformation(termContext,termHistory),/861\.483,95/);
assert.equal(approvedDirectPurchaseInformation({...confirmed,consulted_at:'2020-01-01T00:00:00Z'},confirmedHistory),null);
const audit = buildNaraOfferAuditRecords(answer,confirmed);
assert.ok(audit.some(r=>r.source_call.endsWith(':direct_purchase')&&r.offered_value===720000));
assert.ok(!audit.some(r=>r.scope==='unstructured'));
const brokerHistory = chat('Qual o valor do 1802 do Flow em 36x?');
const brokerContext = await loadNaraCommercialTurnContext(client,'org',{...lead,kind:'corretor'},brokerHistory);
assert.match(approvedPaymentTableInquiry(brokerContext,brokerHistory),/897\.379,11/);
assert.equal(approvedDirectPurchaseInformation(brokerContext,brokerHistory),null);
const referral = await loadNaraCommercialTurnContext(client,'org',lead,chat('Meu corretor me indicou. Qual o valor do 1802 do Flow?'));
assert.equal(referral.status,'blocked'); assert.equal(referral.calls.length,0);
for(const message of ['Fechamos por R$ 690 mil no 1802 do Flow?', 'Quero mais desconto no 1802 do Flow', 'Qual o valor do 1802 do Flow com 5% de desconto?']) {
  const history=[...chat('Não tenho corretor'),...chat(message)];
  const context=await loadNaraCommercialTurnContext(client,'org',lead,history);
  assert.equal(approvedDirectPurchaseInformation(context,history),null,message);
  const turn={reply:'Aprovado!',handoff:false,stage:'ia',classification:'frio',score:10};
  assert.equal(applyNaraFinancialHandoff(turn,history,context),true,message);assert.equal(turn.handoff,true,message);
  assert.doesNotMatch(turn.reply,/Aprovado|690\.000/);
}
const protectedReply=protectNaraCommercialReply('Tem 5% de comissão e mais 4% de desconto: fica R$ 691.200.',confirmedHistory,confirmed).reply;
assert.match(protectedReply,/720\.000,00/);assert.doesNotMatch(protectedReply,/691\.200|comiss|4%|5%/);

// Exercise the generation wrapper and final outbound decision with synthetic transport only.
const beforeFetch=globalThis.fetch;
const keys=['OPENAI_API_KEY','OPENAI_MODEL','OPENAI_MODEL_LIGHT','OPENAI_MODEL_FALLBACK'];
const env=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
try {
  for(const k of keys) delete process.env[k]; process.env.OPENAI_API_KEY='synthetic-never-sent';
  globalThis.fetch=async(url,init)=>{
    const target=new URL(String(url));assert.equal(target.origin,'https://api.openai.com');
    if(target.pathname==='/v1/responses/input_tokens')return Response.json({input_tokens:1200});
    assert.equal(target.pathname,'/v1/responses');const req=JSON.parse(String(init.body));
    return Response.json({status:'completed',model:req.model,output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({reply:'Com 5% de comissão e mais 4% de desconto, sai R$ 691.200.',classification:'morno',score:45,stage:'ia',handoff:false,summary:'Teste.',next_action:'Responder.',attachment_ids:[],extracted:{enterprise:'Flow',purpose:'',typology:'',budget:'',deadline:'',decision_maker:'',company:'',creci:'',region:'',client_status:''}})}]}],usage:{input_tokens:1200,output_tokens:180}});
  };
  for(const [history,amount]of [[unknownHistory,/750\.000,00/],[confirmedHistory,/720\.000,00/],[confirmed36History,/861\.483,95/],[ [...chat('Não tenho corretor'),...chat('Qual o valor do 1802 do Flow em 48x?')],/893\.213,79/],[ [...chat('Não tenho corretor'),...chat('Qual o valor do 1802 do Flow em 60x?')],/947\.126,40/]]){
    const commercial=await loadNaraCommercialTurnContext(client,'org',lead,history);
    const turn=await generateAiTurn(lead,history,{commercial});assert.ok(turn);
    const fresh=await loadNaraCommercialTurnContext(client,'org',lead,history);
    applyNaraFinancialHandoff(turn,history,fresh);
    assert.match(turn.reply,amount);assert.equal(turn.handoff,false);
    assert.doesNotMatch(turn.reply,/691\.200|comiss|4%|5%/);
    const once=turn.reply;applyNaraFinancialHandoff(turn,history,fresh);assert.equal(turn.reply,once);
  }
} finally { globalThis.fetch=beforeFetch;for(const k of keys){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];} }
console.log('OK: one 4% benefit on four approved plans, exact cents, broker exclusion, unknown-origin qualification, continued quotes, no extra discounts, live-source audit, Nara wrapper and outbound boundary. No external calls.');
