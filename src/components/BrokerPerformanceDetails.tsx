'use client';
import {useEffect,useState} from 'react';
type Event={id:string;event_type:string;status:string;occurred_on:string;summary:string;evidence:Array<{quote:string}>;quantity:number};
type Proposal={id:string;proposal_number:number;status:string;proposed_price:number};
const labels:Record<string,string>={interested_client:'Cliente interessado',proposal:'Proposta',visit_with_client:'Visita com cliente',visit_without_client:'Visita sem cliente',sale:'Venda'};
export function BrokerPerformanceDetails({leadId,name,onClose}:{leadId:string;name:string;onClose:()=>void}){
 const [data,setData]=useState<{events:Event[];proposals:Proposal[]}|null>(null);const [error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();fetch(`/api/leads/${leadId}/broker-performance`,{signal:c.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setData(d);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[leadId]);
 return <section className="card" style={{marginBottom:16}} aria-label={`Histórico comercial de ${name}`}><div className="card-head"><h3>Histórico comercial · {name}</h3><button className="btn btn-ghost" onClick={onClose}>Fechar</button></div><div className="card-body">
 {error&&<div className="error-box">{error}</div>}{!data&&!error&&<p>Carregando…</p>}
 {data&&<><p>Propostas registradas: {data.proposals.length}</p>{data.proposals.map(p=><div key={p.id}>Proposta #{p.proposal_number} · {Number(p.proposed_price).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} · {p.status}</div>)}
 <h4>Ocorrências recuperadas das conversas</h4>{!data.events.length&&<p>Nenhuma ocorrência registrada até o momento.</p>}
 {data.events.map(e=><details key={e.id} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}><summary>{labels[e.event_type]} · {e.occurred_on||'Data a confirmar'} · {e.status==='confirmed'?'Confirmado':e.status==='cancelled'?'Cancelado':'Pendente de confirmação'}{e.quantity>1?` · ${e.quantity}`:''}</summary><p>{e.summary}</p>{e.evidence.map((v,i)=><blockquote key={i}>{v.quote}</blockquote>)}</details>)}</>}
 </div></section>;
}
