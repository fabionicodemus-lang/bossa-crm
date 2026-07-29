import type { ReactNode } from 'react';

export type ProposalLead = { id:string; kind:'cliente'|'corretor'; name:string; phone:string|null; enterprise:string|null; company:string|null; group_name:string|null };
export type ProposalDevelopment = { id:string; name:string; delivery_date:string|null; logo_path:string|null; default_payment_plan:Record<string,unknown> };
export type ProposalUnit = { id:string; development_id:string; unit_code:string; status:string; list_price:number; entry_amount:number; installment_count:number; installment_amount:number; reinforcement_count:number; reinforcement_amount:number; keys_amount:number; payment_plan:Record<string,unknown> };
export type StoredStatus = 'rascunho'|'enviada'|'aprovada'|'recusada'|'expirada'|'cancelada';
export type WorkflowStatus = 'rascunho'|'enviada'|'negociacao'|'contraproposta'|'aprovada'|'recusada'|'expirada'|'convertida';
export type Origin = 'cliente'|'corretor';
export type ReinforcementFrequency = 'anual'|'semestral';
export type MonthlyMode = 'unificado'|'dividido';
export type ScheduleItem = { kind:string; label:string; quantity:number; amount:number; startDate:string; intervalMonths:number|null; total:number; paidUntilKeysQuantity:number; paidUntilKeysAmount:number };
export type ProposalSnapshot = Record<string,unknown> & { workflow_status?:WorkflowStatus; origin?:Origin; lead_name?:string; client_name?:string; development_name?:string; unit_code?:string; responsible_name?:string; proposal_date?:string; delivery_date?:string|null; paid_until_keys_amount?:number; paid_until_keys_percent?:number; nominal_total?:number; discount_percent?:number; schedule_items?:ScheduleItem[]; next_action?:string; next_action_due_at?:string|null };
export type Proposal = { id:string; organization_id:string; development_id:string; unit_id:string|null; lead_id:string|null; status:StoredStatus; proposal_number:number; list_price:number; proposed_price:number; discount_amount:number; valid_until:string|null; notes:string|null; payment_plan:Record<string,unknown>; snapshot:ProposalSnapshot; version:number; created_by:string|null; updated_by:string|null; created_at:string; updated_at:string };
export type ProposalForm = {
  origin:Origin;
  leadId:string;
  clientName:string;
  developmentId:string;
  unitId:string;
  workflowStatus:WorkflowStatus;
  proposalDate:string;
  validUntil:string;
  listPrice:string;
  entryTotal:string;
  monthlyMode:MonthlyMode;
  monthlyCount:string;
  monthlyAmount:string;
  beforeKeysCount:string;
  beforeKeysAmount:string;
  afterKeysCount:string;
  afterKeysAmount:string;
  reinforcementFrequency:ReinforcementFrequency;
  reinforcementCount:string;
  reinforcementAmount:string;
  firstReinforcementDate:string;
  keysAmount:string;
  nextAction:string;
  nextActionDueAt:string;
  notes:string;
};
export type ProposalCalculations = {
  listPrice:number;
  proposedPrice:number;
  entryTotal:number;
  paidUntilKeys:number;
  paidUntilKeysPercent:number;
  nominalTotal:number;
  discountAmount:number;
  discountPercent:number;
  differenceFromTable:number;
  scheduleItems:ScheduleItem[];
  monthlyBeforeCount:number;
  monthlyAfterCount:number;
  paidReinforcementCount:number;
};

export const statusLabels:Record<WorkflowStatus,string> = { rascunho:'Rascunho', enviada:'Enviada', negociacao:'Em negociação', contraproposta:'Contraproposta', aprovada:'Aprovada', recusada:'Recusada', expirada:'Expirada', convertida:'Convertida em venda' };
export const money = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
export const date = new Intl.DateTimeFormat('pt-BR');
export function numberValue(value:unknown){ const parsed=Number(value); return Number.isFinite(parsed)?parsed:0 }
export function integerValue(value:unknown){ return Math.max(0,Math.trunc(numberValue(value))) }
export function planText(plan:Record<string,unknown>|null|undefined,key:string){ const value=plan?.[key]; return value==null?'':String(value) }
export function localDateTime(value:string|null|undefined){ if(!value)return ''; const parsed=new Date(value); if(Number.isNaN(parsed.getTime()))return ''; const local=new Date(parsed.getTime()-parsed.getTimezoneOffset()*60000); return local.toISOString().slice(0,16) }
export function localToday(){ const now=new Date(); return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10) }
export function dateFromIso(value:string){ const [year,month,day]=value.split('-').map(Number); return new Date(year,Math.max(0,month-1),day||1,12) }
export function isoFromDate(value:Date){ return new Date(value.getTime()-value.getTimezoneOffset()*60000).toISOString().slice(0,10) }
export function addMonthsIso(value:string,months:number){ if(!value)return ''; const source=dateFromIso(value), originalDay=source.getDate(); source.setDate(1); source.setMonth(source.getMonth()+months); source.setDate(Math.min(originalDay,new Date(source.getFullYear(),source.getMonth()+1,0).getDate())); return isoFromDate(source) }
export function isOnOrBefore(value:string,limit:string|null|undefined){ return Boolean(value&&limit&&value<=limit) }
export function countOccurrencesUntil(startDate:string,intervalMonths:number,quantity:number,limitDate:string|null){ if(!startDate||!limitDate||quantity<=0)return 0; let count=0; for(let index=0;index<quantity;index++) if(isOnOrBefore(addMonthsIso(startDate,index*intervalMonths),limitDate)) count++; return count }
export function formatMoneyInput(value:string){ return value===''?'':money.format(numberValue(value)) }
export function parseMoneyInput(value:string){ const digits=value.replace(/\D/g,''); return digits?String(Number(digits)/100):'' }
export function workflowOf(proposal:Proposal):WorkflowStatus{ const value=proposal.snapshot?.workflow_status; if(value&&value in statusLabels)return value; if(proposal.status==='cancelada')return 'recusada'; return proposal.status as WorkflowStatus }
export function storedStatusOf(status:WorkflowStatus):StoredStatus{ if(status==='negociacao'||status==='contraproposta')return 'enviada'; if(status==='convertida')return 'aprovada'; return status }
export function suggestedReinforcementDate(proposalDate:string,frequency:ReinforcementFrequency){ return addMonthsIso(proposalDate,frequency==='semestral'?6:12) }
export function blankForm(initialLead?:ProposalLead):ProposalForm{
  const proposalDate=localToday();
  return {
    origin:initialLead?.kind??'cliente',
    leadId:initialLead?.id??'',
    clientName:initialLead?.kind==='cliente'?initialLead.name:'',
    developmentId:'',
    unitId:'',
    workflowStatus:'rascunho',
    proposalDate,
    validUntil:'',
    listPrice:'',
    entryTotal:'',
    monthlyMode:'unificado',
    monthlyCount:'',
    monthlyAmount:'',
    beforeKeysCount:'',
    beforeKeysAmount:'',
    afterKeysCount:'',
    afterKeysAmount:'',
    reinforcementFrequency:'anual',
    reinforcementCount:'',
    reinforcementAmount:'',
    firstReinforcementDate:suggestedReinforcementDate(proposalDate,'anual'),
    keysAmount:'',
    nextAction:'',
    nextActionDueAt:'',
    notes:'',
  };
}
export function errorText(error:unknown){ if(error instanceof Error)return error.message; if(error&&typeof error==='object'&&'message' in error)return String((error as {message?:unknown}).message??'Erro inesperado.'); return 'Erro inesperado.' }

export function MoneyInput({value,onChange,disabled=false,readOnly=false}:{value:string;onChange:(value:string)=>void;disabled?:boolean;readOnly?:boolean}){ return <input className="input mono" type="text" inputMode="numeric" value={formatMoneyInput(value)} onChange={event=>onChange(parseMoneyInput(event.target.value))} onFocus={event=>event.currentTarget.select()} disabled={disabled} readOnly={readOnly} style={readOnly?{background:'var(--bg)',fontWeight:800}:undefined}/> }
export function ToggleButton({active,children,onClick,disabled=false}:{active:boolean;children:ReactNode;onClick:()=>void;disabled?:boolean}){ return <button type="button" className={active?'btn btn-primary btn-sm':'btn btn-ghost btn-sm'} onClick={onClick} disabled={disabled} aria-pressed={active}>{children}</button> }

export function calculateProposal(form:ProposalForm,deliveryDate:string|null,firstMonthlyDate:string,firstAfterKeysDate:string):ProposalCalculations{
  const listPrice=numberValue(form.listPrice);
  const entryTotal=numberValue(form.entryTotal);
  const reinforcementCount=integerValue(form.reinforcementCount);
  const reinforcementAmount=numberValue(form.reinforcementAmount);
  const reinforcementInterval=form.reinforcementFrequency==='semestral'?6:12;
  const keysAmount=numberValue(form.keysAmount);
  const scheduleItems:ScheduleItem[]=[];

  let monthlyBeforeCount=0;
  let monthlyAfterCount=0;
  let beforeMonthlyTotal=0;
  let afterMonthlyTotal=0;

  if(form.monthlyMode==='unificado'){
    const monthlyCount=integerValue(form.monthlyCount);
    const monthlyAmount=numberValue(form.monthlyAmount);
    monthlyBeforeCount=countOccurrencesUntil(firstMonthlyDate,1,monthlyCount,deliveryDate);
    monthlyAfterCount=Math.max(0,monthlyCount-monthlyBeforeCount);
    beforeMonthlyTotal=monthlyBeforeCount*monthlyAmount;
    afterMonthlyTotal=monthlyAfterCount*monthlyAmount;
    if(monthlyBeforeCount>0){
      scheduleItems.push({kind:'parcela_ate_chaves',label:'Parcelas mensais até as chaves',quantity:monthlyBeforeCount,amount:monthlyAmount,startDate:firstMonthlyDate,intervalMonths:1,total:beforeMonthlyTotal,paidUntilKeysQuantity:monthlyBeforeCount,paidUntilKeysAmount:beforeMonthlyTotal});
    }
    if(monthlyAfterCount>0){
      const firstAfterDate=addMonthsIso(firstMonthlyDate,monthlyBeforeCount);
      scheduleItems.push({kind:'parcela_pos_chaves',label:'Parcelas mensais após as chaves',quantity:monthlyAfterCount,amount:monthlyAmount,startDate:firstAfterDate,intervalMonths:1,total:afterMonthlyTotal,paidUntilKeysQuantity:0,paidUntilKeysAmount:0});
    }
  }else{
    monthlyBeforeCount=integerValue(form.beforeKeysCount);
    monthlyAfterCount=integerValue(form.afterKeysCount);
    const beforeAmount=numberValue(form.beforeKeysAmount);
    const afterAmount=numberValue(form.afterKeysAmount);
    const paidBeforeCount=countOccurrencesUntil(firstMonthlyDate,1,monthlyBeforeCount,deliveryDate);
    beforeMonthlyTotal=monthlyBeforeCount*beforeAmount;
    afterMonthlyTotal=monthlyAfterCount*afterAmount;
    if(monthlyBeforeCount>0){
      scheduleItems.push({kind:'parcela_ate_chaves',label:'Parcelas mensais até as chaves',quantity:monthlyBeforeCount,amount:beforeAmount,startDate:firstMonthlyDate,intervalMonths:1,total:beforeMonthlyTotal,paidUntilKeysQuantity:paidBeforeCount,paidUntilKeysAmount:paidBeforeCount*beforeAmount});
    }
    if(monthlyAfterCount>0&&firstAfterKeysDate){
      scheduleItems.push({kind:'parcela_pos_chaves',label:'Parcelas mensais após as chaves',quantity:monthlyAfterCount,amount:afterAmount,startDate:firstAfterKeysDate,intervalMonths:1,total:afterMonthlyTotal,paidUntilKeysQuantity:0,paidUntilKeysAmount:0});
    }
  }

  const paidReinforcementCount=countOccurrencesUntil(form.firstReinforcementDate,reinforcementInterval,reinforcementCount,deliveryDate);
  const reinforcementTotal=reinforcementCount*reinforcementAmount;
  const paidMonthlyAmount=scheduleItems
    .filter(item=>item.kind==='parcela_ate_chaves')
    .reduce((sum,item)=>sum+item.paidUntilKeysAmount,0);
  const paidUntilKeys=entryTotal+paidMonthlyAmount+paidReinforcementCount*reinforcementAmount+(deliveryDate?keysAmount:0);
  const nominalTotal=entryTotal+beforeMonthlyTotal+afterMonthlyTotal+reinforcementTotal+keysAmount;
  const discountAmount=Math.max(0,listPrice-nominalTotal);

  if(entryTotal>0)scheduleItems.unshift({kind:'entrada',label:'Entrada direta',quantity:1,amount:entryTotal,startDate:form.proposalDate,intervalMonths:null,total:entryTotal,paidUntilKeysQuantity:deliveryDate&&isOnOrBefore(form.proposalDate,deliveryDate)?1:0,paidUntilKeysAmount:deliveryDate&&isOnOrBefore(form.proposalDate,deliveryDate)?entryTotal:0});
  if(reinforcementCount>0)scheduleItems.push({kind:form.reinforcementFrequency==='semestral'?'reforco_semestral':'reforco_anual',label:form.reinforcementFrequency==='semestral'?'Reforços semestrais':'Reforços anuais',quantity:reinforcementCount,amount:reinforcementAmount,startDate:form.firstReinforcementDate,intervalMonths:reinforcementInterval,total:reinforcementTotal,paidUntilKeysQuantity:paidReinforcementCount,paidUntilKeysAmount:paidReinforcementCount*reinforcementAmount});
  if(keysAmount>0&&deliveryDate)scheduleItems.push({kind:'chaves',label:'Parcela nas chaves',quantity:1,amount:keysAmount,startDate:deliveryDate,intervalMonths:null,total:keysAmount,paidUntilKeysQuantity:1,paidUntilKeysAmount:keysAmount});

  const scheduleOrder:Record<string,number>={entrada:0,parcela_ate_chaves:1,reforco_semestral:2,reforco_anual:2,chaves:3,parcela_pos_chaves:4};
  scheduleItems.sort((first,second)=>(scheduleOrder[first.kind]??9)-(scheduleOrder[second.kind]??9));

  return {
    listPrice,
    proposedPrice:nominalTotal,
    entryTotal,
    paidUntilKeys,
    paidUntilKeysPercent:nominalTotal>0?paidUntilKeys/nominalTotal*100:0,
    nominalTotal,
    discountAmount,
    discountPercent:listPrice>0?discountAmount/listPrice*100:0,
    differenceFromTable:nominalTotal-listPrice,
    scheduleItems,
    monthlyBeforeCount,
    monthlyAfterCount,
    paidReinforcementCount,
  };
}
