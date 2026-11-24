import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as paymentModule from '../src/lib/unit-payment-tables.ts';
import { directPurchaseQuote } from '../src/lib/nara-direct-purchase.ts';
import { consultarApartamento, buscarApartamentos, faixaEmpreendimento, loadNaraCommercialTurnContext } from '../src/lib/nara-unit-queries.ts';
import { approvedPaymentTableInquiry, approvedDirectPurchaseInformation } from '../src/lib/nara-commercial-guard.ts';
import { applyNaraFinancialHandoff } from '../src/lib/nara-sales-handoff.ts';
import { buildNaraOfferAuditRecords } from '../src/lib/nara-offer-log.ts';
import { buildPremiumSalesPrintHtml } from '../src/lib/premium-sales-table-print.ts';
import { generateAiTurn } from '../src/lib/ai-v120.ts';
const {readPaymentTablePolicy,unitPaymentTables,paymentTableOptions,paymentTableDiscountRate,monthsUntilHandover,paymentQuoteSum,isCompletePaymentQuote}=paymentModule;
const policy={version:1,approved:true,valuation_date:'2026-11-24',handover_month:'2030-07',cash_basis_cents:99900000,list_basis_cents:128535085,
  reference_entry_cents:19280262,reference_installment_cents:514140,reference_installment_count:80,reference_reinforcement_cents:7895727,reference_reinforcement_count:7,reference_keys_cents:12853508,
  installment_plans:[{id:'months40',months:40,entry_bps:2500,reinforcement_count:3,keys_bps:0},{id:'months60',months:60,entry_bps:2000,reinforcement_count:4,keys_bps:1000}]};
assert.deepEqual(readPaymentTablePolicy({payment_tables:policy}),policy);
for(const invalid of [null,[],[policy.installment_plans[0],policy.installment_plans[0]],policy.installment_plans.map(p=>({...p,entry_bps:10000})),policy.installment_plans.map(p=>({...p,months:36}))]) assert.equal(readPaymentTablePolicy({payment_tables:{...policy,installment_plans:invalid}}),null);
assert.equal(monthsUntilHandover(policy),44);
assert.deepEqual(paymentTableOptions(policy).map(o=>o.id),['cash','months40','months60','current']);
assert.equal(paymentTableOptions(policy).at(-1).installmentCount,80);
const unit={id:'alma-1002',organization_id:'org',development_id:'alma',unit_code:'1002',floor:10,typology_id:null,status:'disponivel',list_price:1285350.85,entry_amount:192802.62,installment_count:80,installment_amount:5141.40,reinforcement_count:7,reinforcement_amount:78957.27,keys_amount:128535.08,payment_plan:{},price_updated_at:'2026-08-04T19:06:50Z'};
const original=structuredClone(unit);
const tables=unitPaymentTables(unit,policy);
assert.deepEqual(tables.map(q=>q.totalCents),[99900000,111475901,118696851,128535085]);
assert.deepEqual(tables.map(q=>q.reinforcementCount),[0,3,4,7]);
assert.equal(tables[1].entryCents,27868975);assert.equal(tables[1].keysCents,0);assert.equal(tables[1].installmentCents,1497994);
assert.equal(tables[2].entryCents,23739370);assert.equal(tables[2].keysCents,11869685);assert.equal(tables[2].installmentCents,858415);
assert.equal(tables[3].lastInstallmentCents,514166);assert.deepEqual(unit,original);
const rate=paymentTableDiscountRate(policy);assert.ok(Math.abs(rate-0.007105557009783)<1e-12);
for(const q of tables){
  assert.ok(isCompletePaymentQuote(q));assert.equal(paymentQuoteSum(q),q.totalCents);
  if(q.reinforcementCount)assert.equal(q.reinforcementCents,7895727);
  // Enumerate independently, including the July 2030 handover at month 44.
  let pv=q.entryCents;for(let m=1;m<=q.installmentCount;m++)pv+=(m===q.installmentCount?q.lastInstallmentCents:q.installmentCents)/(1+rate)**m;
  for(let y=1;y<=q.reinforcementCount;y++)pv+=q.reinforcementCents/(1+rate)**(12*y);
  pv+=q.keysCents/(1+rate)**44;
  // The original reference has a 26-cent residue, reconciled only in its last monthly payment.
  assert.ok(Math.abs(pv-99900000)<(q.id==='current'?27:10),q.id);
}
const direct=tables.map(directPurchaseQuote);assert.deepEqual(direct.map(q=>q.totalCents),[95904000,107016865,113948977,123393682]);
for(const q of direct){assert.ok(isCompletePaymentQuote(q));assert.equal(paymentQuoteSum(q),q.totalCents);}
const next=unitPaymentTables({...unit,unit_code:'1102',list_price:1307644.60,reinforcement_amount:80326.74},policy);
assert.equal(next[0].totalCents,Math.round(130764460*99900000/128535085));assert.equal(next[1].reinforcementCents,8032674);
const plan={payment_tables:policy,direct_purchase:{version:1,approved:true,discount_bps:400,table_commission_bps:500}};
const development={id:'alma',organization_id:'org',active:true,name:'Alma Seahouses',slug:'alma-seahouses',default_payment_plan:plan};
const flowPolicy={version:1,approved:true,valuation_date:'2026-11-24',handover_month:'2027-11',cash_basis_cents:75000000,list_basis_cents:98659000,reference_entry_cents:20000000,reference_installment_cents:485983,reference_installment_count:60,reference_reinforcement_cents:5900000,reference_reinforcement_count:5,reference_keys_cents:20000000};
const flowUnit={...unit,id:'flow-1802',development_id:'flow',unit_code:'1802',list_price:986590,entry_amount:200000,installment_count:60,installment_amount:4859.83,reinforcement_count:5,reinforcement_amount:59000,keys_amount:200000};
const db={developments:[development,{...development,id:'flow',name:'Flow Aptos',slug:'flow-aptos',default_payment_plan:{...plan,payment_tables:flowPolicy}}],development_units:[unit,flowUnit,{...unit,id:'reserved',unit_code:'1202',status:'reservado'},{...unit,id:'hidden',unit_code:'1001',status:'oculto'}],development_typologies:[]};
class Query{
  constructor(rows){this.rows=rows;this.filters=[];}
  select(){return this;}eq(k,v){this.filters.push(r=>r[k]===v);return this;}gt(k,v){this.filters.push(r=>Number(r[k])>v);return this;}gte(k,v){this.filters.push(r=>Number(r[k])>=v);return this;}lte(k,v){this.filters.push(r=>Number(r[k])<=v);return this;}in(k,v){this.filters.push(r=>v.includes(r[k]));return this;}order(){return this;}limit(n){this.max=n;return this;}
  result(){return{data:this.rows.filter(r=>this.filters.every(f=>f(r))).slice(0,this.max),error:null};}then(a,b){return Promise.resolve(this.result()).then(a,b);}maybeSingle(){return Promise.resolve({...this.result(),data:this.result().data[0]??null});}
}
const client={from:name=>new Query(db[name]??[])};
assert.equal((await consultarApartamento(client,'org','Alma','1002')).valor,999000);
assert.equal((await consultarApartamento(client,'org','Alma','1002','direct_confirmed')).valor,959040);
assert.equal((await faixaEmpreendimento(client,'org','Alma','direct_confirmed')).valor_minimo,959040);
assert.equal((await buscarApartamentos(client,'org',{empreendimento:'Alma',valor_max:960000},'direct_confirmed')).length,1);
assert.equal(await consultarApartamento(client,'org','Alma','1202'),null);assert.equal(await consultarApartamento(client,'org','Alma','1001'),null);assert.equal(await consultarApartamento(client,'other','Alma','1002'),null);
const lead={id:'synthetic',organization_id:'org',kind:'cliente',source:'site',metadata:{},enterprise:'Alma',phone:'5547999990000',stage:'ia',owner_mode:'ai',ai_enabled:true,opt_out:false,automation_paused:false};
const message=content=>({role:'user',content});
for(const [text,amount,count]of [['Qual o valor à vista do 1002 do Alma?',/999\.000,00/,0],['Qual o valor do 1002 do Alma com 25% de entrada e 40x?',/1\.114\.759,01/,40],['Qual o valor do 1002 do Alma com 20% e 60x?',/1\.186\.968,51/,60],['Qual o valor do 1002 do Alma em 80x?',/1\.285\.350,85/,80]]){
  const history=[message(text)],context=await loadNaraCommercialTurnContext(client,'org',lead,history),reply=approvedPaymentTableInquiry(context,history);
  assert.match(reply,amount);if(count)assert.match(reply,new RegExp(`${count} ×`));
}
const switched=[message('Qual o valor do 1802 do Flow em 60x?'),message('E o 1002 do Alma em 60x?')];
const switchedContext=await loadNaraCommercialTurnContext(client,'org',lead,switched);
assert.match(approvedPaymentTableInquiry(switchedContext,switched),/1\.186\.968,51/);
assert.doesNotMatch(approvedPaymentTableInquiry(switchedContext,switched),/986\.590|1\.285\.350/);
const generic=[message('Não tenho corretor. Quanto custa o Alma?'),message('E parcelado?')];
const genericContext=await loadNaraCommercialTurnContext(client,'org',lead,generic);
assert.match(approvedDirectPurchaseInformation(genericContext,generic),/40, 60 ou 80/);
assert.doesNotMatch(approvedDirectPurchaseInformation(genericContext,generic),/36|48/);
const firstPayment=[message('Posso parcelar?')];
assert.match(approvedDirectPurchaseInformation(await loadNaraCommercialTurnContext(client,'org',lead,firstPayment),firstPayment),/40, 60 ou 80/);
const unitContinuation=[message('Não tenho corretor. Qual o preço à vista do 1002 do Alma?'),message('E parcelado?')];
const unitContinuationContext=await loadNaraCommercialTurnContext(client,'org',lead,unitContinuation);
assert.equal(unitContinuationContext.calls[0].name,'consultar_apartamento');
assert.match(approvedDirectPurchaseInformation(unitContinuationContext,unitContinuation),/40, 60 ou 80/);
const invalidHistory=[message('Qual o valor do 1002 do Alma em 36x?')];
assert.equal(approvedPaymentTableInquiry(await loadNaraCommercialTurnContext(client,'org',lead,invalidHistory),invalidHistory),null);
for(const mode of ['cash','months40','months60','current']){
  const html=buildPremiumSalesPrintHtml({theme:'alma',name:'Alma Seahouses',units:[unit],typologies:[],assetBaseUrl:'https://crm.example',autoPrint:false,paymentTableId:mode,paymentTablePolicy:policy});
  assert.match(html,/alma-print\/page-1.webp/);assert.match(html,/alma-print\/page-2.webp/);
  assert.ok(html.includes(mode==='cash'?'999.000,00':mode==='months40'?'1.114.759,01':mode==='months60'?'1.186.968,51':'1.285.350,85'));
  assert.doesNotMatch(html,/30% \+ 36x|30% \+ 48x/);
}
assert.throws(()=>buildPremiumSalesPrintHtml({theme:'alma',name:'Alma',units:[unit],typologies:[],assetBaseUrl:'https://crm.example',paymentTableId:'months36',paymentTablePolicy:policy}),/não está aprovada/);
const uiSource=await readFile(new URL('../src/components/UnitPaymentTables.tsx',import.meta.url),'utf8');
const uiJs=ts.transpileModule(uiSource,{fileName:'UnitPaymentTables.tsx',compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const mod={exports:{}};const require=createRequire(import.meta.url);new Function('require','exports','module',uiJs)(name=>name==='@/lib/unit-payment-tables'?paymentModule:require(name),mod.exports,mod);
const html=renderToStaticMarkup(React.createElement(mod.exports.UnitPaymentTables,{development,units:[unit]}));
for(const label of ['25% + 40x','20% + 60x','80x','999.000,00'])assert.ok(html.includes(label),label);assert.doesNotMatch(html,/30% \+ 36x|30% \+ 48x/);
const fetchBefore=globalThis.fetch;const keys=['OPENAI_API_KEY','OPENAI_MODEL','OPENAI_MODEL_LIGHT','OPENAI_MODEL_FALLBACK'];const env=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
try{
  for(const k of keys)delete process.env[k];process.env.OPENAI_API_KEY='synthetic-never-sent';
  globalThis.fetch=async(url,init)=>{const target=new URL(String(url));assert.equal(target.origin,'https://api.openai.com');if(target.pathname==='/v1/responses/input_tokens')return Response.json({input_tokens:1200});assert.equal(target.pathname,'/v1/responses');const req=JSON.parse(String(init.body));return Response.json({status:'completed',model:req.model,output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({reply:'A unidade custa R$ 750.000 em 36x.',classification:'morno',score:45,stage:'ia',handoff:false,summary:'Teste.',next_action:'Responder.',attachment_ids:[],extracted:{enterprise:'Alma',purpose:'',typology:'',budget:'',deadline:'',decision_maker:'',company:'',creci:'',region:'',client_status:''}})}]}],usage:{input_tokens:1200,output_tokens:180}});};
  for(const [question,amount,field]of [['Qual o valor à vista do 1002 do Alma?',/959\.040,00/,'cash'],['Qual o valor do 1002 do Alma com 25% e 40x?',/1\.070\.168,65/,'months40'],['Qual o valor do 1002 do Alma com 20% e 60x?',/1\.139\.489,77/,'months60'],['Qual o valor do 1002 do Alma em 80x?',/1\.233\.936,82/,'current']]){
    const history=[message('Não tenho corretor'),message(question)];const commercial=await loadNaraCommercialTurnContext(client,'org',lead,history);
    const turn=await generateAiTurn(lead,history,{commercial});assert.ok(turn);assert.match(turn.reply,amount);assert.equal(turn.handoff,false);
    const fresh=await loadNaraCommercialTurnContext(client,'org',lead,history);applyNaraFinancialHandoff(turn,history,fresh);assert.match(turn.reply,amount);assert.doesNotMatch(turn.reply,/750\.000|comiss|36x|48x/);
    const audit=buildNaraOfferAuditRecords(turn.reply,fresh);assert.ok(!audit.some(r=>r.scope==='unstructured'),field);assert.ok(audit.some(r=>r.source_call.includes('direct_purchase')));
  }
}finally{globalThis.fetch=fetchBefore;for(const k of keys){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}}
console.log('OK: Alma 999k ratio, 40/60/current 80-month plans, annual reais, July 2030 PV, exact totals, direct purchase, Flow separation, query/audit, four prints, React UI and full Nara pipeline without external calls.');
