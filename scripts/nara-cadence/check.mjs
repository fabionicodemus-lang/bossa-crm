import assert from 'node:assert/strict';
import { makeDb } from './fakedb.mjs';
import { sent } from './stubs/cs.mjs';
const { runNaraFollowups } = await import('../../src/lib/nara-followup.ts');
const iso=(s)=>new Date(s).toISOString();
function scenario(){
  return makeDb({
    whatsapp_channels:[{organization_id:'org',role:'cliente',status:'connected'}],
    whatsapp_templates:[], whatsapp_messages:[], nara_followup_sequences:[],
    leads:[{id:'L1',organization_id:'org',kind:'cliente',owner_mode:'ai',ai_enabled:true,opt_out:false,automation_paused:false,
      stage:'qualificacao_ia',phone:'5547999990000',name:'Marina Souza',metadata:{},
      last_inbound_at:iso('2026-09-24T17:55:00-03:00'),last_outbound_at:iso('2026-09-24T18:00:00-03:00')}],
    messages:[{id:'M0',lead_id:'L1',direction:'in',sender_kind:'lead',body:'Oi, vi o anúncio do Flow',created_at:iso('2026-09-24T17:55:00-03:00')},
      {id:'M1',lead_id:'L1',direction:'out',sender_kind:'ia',body:'Oi Marina! ...',created_at:iso('2026-09-24T18:00:00-03:00'),raw_payload:{}}],
  });
}
// 1) Mensagem da Nara ontem às 18h, sem resposta. Hoje 10h58.
globalThis.NOW='2026-09-25T10:58:00-03:00';
let db=scenario(); let r=await runNaraFollowups(db,new Date(NOW));
assert.equal(r.first_sent,1,'Caso 1: 1ª retomada deveria sair');
console.log('Caso 1 (hoje 10h58):', r.first_sent===1?'1ª retomada ENVIADA':'NÃO enviou', JSON.stringify(r.skipped), sent.at(-1)?.kind, sent.at(-1)?.body);
// 2) Mesma conversa, dia 26 às 19h (49h depois): 2ª retomada precisa de modelo aprovado
globalThis.REMOTE_TEMPLATES=[];
globalThis.NOW='2026-09-26T19:00:00-03:00'; r=await runNaraFollowups(db,new Date(NOW));
console.log('Caso 2 sem modelo aprovado:', JSON.stringify(r.skipped));
db.tables.whatsapp_templates.forEach(t=>t.status='APPROVED'); globalThis.REMOTE_TEMPLATES=db.tables.whatsapp_templates.map(t=>({name:t.name,language:t.language,status:'APPROVED',id:'x'}));
r=await runNaraFollowups(db,new Date(NOW));
assert.equal(r.second_sent,1,'Caso 2: 2ª retomada deveria sair');
console.log('Caso 2 com modelo aprovado:', r.second_sent===1?'2ª retomada ENVIADA':'NÃO enviou', sent.at(-1)?.kind, sent.at(-1)?.name);
r=await runNaraFollowups(db,new Date('2026-09-26T19:05:00-03:00'));
assert.equal(r.first_sent+r.second_sent,0,'Caso 3: não pode repetir');
console.log('Caso 3 (5 min depois):', r.first_sent+r.second_sent===0?'nada repetido ✔':'REPETIU', JSON.stringify(r.skipped));
// 4) Lead respondeu depois da 1ª retomada → cancela
globalThis.NOW='2026-09-25T10:58:00-03:00'; db=scenario(); await runNaraFollowups(db,new Date(NOW));
db.tables.messages.push({id:'M9',lead_id:'L1',direction:'in',sender_kind:'lead',body:'oi',created_at:iso('2026-09-25T12:00:00-03:00')});
db.tables.leads[0].last_inbound_at=iso('2026-09-25T12:00:00-03:00');
r=await runNaraFollowups(db,new Date('2026-09-26T19:00:00-03:00'));
assert.equal(r.second_sent,0,'Caso 4: lead respondeu');
console.log('Caso 4 lead respondeu:', r.second_sent===0?'não mandou 2ª ✔':'MANDOU 2ª', 'cancelled=',r.cancelled);
// 5) 23h: fora do horário
globalThis.NOW='2026-09-25T23:00:00-03:00'; db=scenario(); db.tables.leads[0].last_inbound_at=iso('2026-09-25T14:00:00-03:00'); db.tables.leads[0].last_outbound_at=iso('2026-09-25T14:05:00-03:00');
db.tables.messages=[{id:'A',lead_id:'L1',direction:'in',created_at:iso('2026-09-25T14:00:00-03:00')},{id:'B',lead_id:'L1',direction:'out',sender_kind:'ia',created_at:iso('2026-09-25T14:05:00-03:00')}];
r=await runNaraFollowups(db,new Date(NOW)); assert.equal(r.first_sent,0,'Caso 5: fora do horário'); console.log('Caso 5 (23h):', JSON.stringify(r.skipped));
// Falha o teste se algum cenário não se comportar como esperado.
console.log('Cadência da Nara validada: 1ª e 2ª retomadas, sem repetição, cancelamento por resposta e horário.');
