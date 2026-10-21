import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { integritySetupSql,id,org,other,user,viewer } from './integrity-fixture.mjs';

const db=new PGlite();
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const reason='Duas fichas conferidas por contrato assinado e documento de identidade.';
const evidence='Documento de identidade conferido no atendimento presencial';
const as=async(uid,role='authenticated')=>{
 await db.exec('reset role');
 await q("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
 await db.exec(`set role ${role}`);
};
const propose=(a,b,preferred=a)=>q('select commercial_propose_contact_reconciliation($1,$2,$3,$4,$5,$6) result',
 [org,a,b,preferred,reason,evidence]).then(rows=>rows[0].result);
const review=(rid,confirm=true)=>q('select commercial_review_contact_reconciliation($1,$2,$3,$4) result',
 [org,rid,confirm,reason]).then(rows=>rows[0].result);
const rejected=(fn,code)=>assert.rejects(fn,new RegExp(code));

for(const sql of integritySetupSql()) await db.exec(sql);
await db.exec(fs.readFileSync(new URL('../../supabase/migrations/20261021190000_commercial_contact_reconciliation.sql',import.meta.url),'utf8'));
await db.exec(`insert into profiles values('${id(12)}'); insert into memberships values('${org}','${id(12)}','admin');`);
await db.exec(`insert into commercial_opportunities(organization_id,title,primary_contact_id,stage)
 values('${org}','Compra documentada','${id(40)}','contact');`);
await as(user);
let count=0;
const test=async(name,fn)=>{await fn();console.log(`PASS reconciliation ${++count}: ${name}`);};
await test('a relation requires actual commercial history, not a phone-based inference',async()=>{
 await rejected(()=>propose(id(41),id(42)),'NO_HISTORY');
});
await test('a reviewed relation starts pending, preserves original opportunity and is repeatable',async()=>{
 const first=await propose(id(40),id(41));
 assert.equal(first.status,'pending');
 assert.equal((await propose(id(41),id(40),id(40))).id,first.id);
 assert.equal((await propose(id(41),id(40),id(40))).idempotent,true);
 await rejected(()=>q('select commercial_propose_contact_reconciliation($1,$2,$3,$4,$5,$6)',
  [org,id(40),id(41),id(40),reason,'Outra evidência sem nova revisão']),'EXISTS');
 assert.equal((await q('select primary_contact_id from commercial_opportunities where primary_contact_id=$1',[id(40)]))[0].primary_contact_id,id(40));
 globalThis.firstReview=first.id;
});
await test('direct writes, cross-organization reads and viewer proposals are denied',async()=>{
 await rejected(()=>q("update commercial_contact_reconciliations set status='confirmed'"),'permission denied');
 assert.equal((await q('select count(*)::int n from commercial_contact_reconciliations where organization_id=$1',[other]))[0].n,0);
 await as(viewer); await rejected(()=>propose(id(40),id(43)),'FORBIDDEN');
 await as(user);
 await rejected(()=>q('select commercial_propose_contact_reconciliation($1,$2,$3,$4,$5,$6)',
  [other,id(40),id(91),id(40),reason,evidence]),'FORBIDDEN');
});
await test('proposer cannot approve, and evidence and source stay intact',async()=>{
 await rejected(()=>review(globalThis.firstReview),'SELF_REVIEW');
 await as(id(12));
 const result=await review(globalThis.firstReview);
 assert.equal(result.status,'confirmed');
 assert.equal((await review(globalThis.firstReview)).idempotent,true);
 const row=(await q('select * from commercial_contact_reconciliations where id=$1',[globalThis.firstReview]))[0];
 assert.equal(row.contact_snapshot.first.id,id(40));
 assert.equal(row.evidence_reference,evidence);
 assert.equal((await q('select primary_contact_id from commercial_opportunities where primary_contact_id=$1',[id(40)]))[0].primary_contact_id,id(40));
});
await test('confirmed relationship protects both identities and refuses a competing decision',async()=>{
 await rejected(()=>q('delete from leads where id=$1',[id(41)]),'COMMERCIAL_HISTORY_PROTECTED');
 await as(user,'service_role');
 assert.equal((await q('select commercial_contact_has_history($1,$2) protected',[org,id(41)]))[0].protected,true);
 await as(id(12));
 await rejected(()=>review(globalThis.firstReview,false),'ALREADY_REVIEWED');
 await as(user);
 const second=await propose(id(40),id(42));
 await as(id(12));
 await rejected(()=>review(second.id),'CONFLICT');
 assert.equal((await q('select status from commercial_contact_reconciliations where id=$1',[second.id]))[0].status,'pending');
});
await test('a stale proposal can be rejected after archiving, but cannot be confirmed',async()=>{
 await db.exec('reset role');
 await q('insert into commercial_opportunities(organization_id,title,primary_contact_id,stage) values($1,$2,$3,$4)',
  [org,'Outra compra documentada',id(43),'contact']);
 await as(user);
 const stale=await propose(id(43),id(44));
 await q('update leads set archived_at=now() where id=$1',[id(44)]);
 await as(id(12));
 await rejected(()=>review(stale.id),'CONTACT_UNAVAILABLE');
 assert.equal((await review(stale.id,false)).status,'rejected');
});
await db.close();
