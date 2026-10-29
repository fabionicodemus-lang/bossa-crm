import fs from 'node:fs';
import { sourceRequestSetupSql } from './source-request-fixture.mjs';
export {id,org,other,user,viewer,dev,unit} from './source-request-fixture.mjs';
export const aiMigration='20261021213000_commercial_ai_proposal_detection.sql';
export const readMigration=name=>fs.readFileSync(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8');
export function aiProposalSetupSql(){return [...sourceRequestSetupSql(),`
 alter table leads add column stage text default 'novo_triagem';
 alter table developments add column name text default 'Prédio teste',add column active boolean default true,add column delivery_date date;
 alter table development_units add column unit_code text default '101',add column list_price numeric default 100000;
 alter table messages add column whatsapp_channel_id uuid,add column raw_payload jsonb default '{}'::jsonb;
 grant select,insert,update on messages to service_role;
 grant select,insert,update,delete on activities,proposal_payment_items to service_role;
 grant usage on all sequences in schema public to service_role;
 `,readMigration(aiMigration)];}
export function aiPayload({dev,unit,lead,source,price=90000,ids=[source],confidence=0.91}){
 const signature=`whatsapp-auto:${lead}:${dev}:101:${Math.round(price)}:2026-10-21`;
 return {signature,data:{lead_id:lead,development_id:dev,unit_id:unit,list_price:100000,proposed_price:price,discount_amount:100000-price,notes:'Condições detectadas',payment_plan:{source:'whatsapp_commercial_intelligence',entry_total:price},snapshot:{workflow_status:'rascunho',source:'whatsapp_commercial_intelligence',auto_detected:true,auto_confidence:confidence,auto_signature:signature,unit_code:'101',source_message_ids:ids,source_message_at:'2026-10-21T15:00:00Z',proposal_direction:'sent_by_bossa'},broker_company:'',summary:'Condições detectadas para revisão'},items:[{kind:'entrada',label:'Entrada',quantity:1,amount:price,metadata:{auto_detected:true}}]};
}
