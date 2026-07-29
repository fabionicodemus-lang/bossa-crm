'use client';

import { date, money, numberValue, statusLabels, workflowOf, type Proposal, type ProposalDevelopment, type WorkflowStatus } from './model';

export function ProposalList({proposals,filteredProposals,developments,canEdit,search,setSearch,statusFilter,setStatusFilter,developmentFilter,setDevelopmentFilter,sentCount,activeValue,approvedValue,onNew,onExport,onEdit,onChangeStatus}:{
  proposals:Proposal[]; filteredProposals:Proposal[]; developments:ProposalDevelopment[]; canEdit:boolean;
  search:string; setSearch:(value:string)=>void; statusFilter:string; setStatusFilter:(value:string)=>void;
  developmentFilter:string; setDevelopmentFilter:(value:string)=>void; sentCount:number; activeValue:number; approvedValue:number;
  onNew:()=>void; onExport:()=>void; onEdit:(proposal:Proposal)=>void; onChangeStatus:(proposal:Proposal,status:WorkflowStatus)=>void;
}){
  return <>
    <div className="page-head"><div><h2>Controle de propostas</h2><p>Cada proposta fica vinculada ao lead, possui cronograma por datas e PDF comercial.</p></div><div className="page-actions">{canEdit&&<button className="btn btn-primary" onClick={onNew}>+ Nova proposta</button>}<button className="btn btn-ghost" onClick={onExport}>⬇ Exportar Excel</button></div></div>
    <div className="kpis">
      <div className="kpi"><div className="kpi-label">Propostas</div><div className="kpi-value">{proposals.length}</div><div className="kpi-note">base geral</div></div>
      <div className="kpi"><div className="kpi-label">Em andamento</div><div className="kpi-value">{sentCount}</div><div className="kpi-note">enviadas e negociando</div></div>
      <div className="kpi"><div className="kpi-label">Pipeline proposto</div><div className="kpi-value" style={{fontSize:21}}>{money.format(activeValue)}</div></div>
      <div className="kpi"><div className="kpi-label">Aprovado</div><div className="kpi-value" style={{fontSize:21}}>{money.format(approvedValue)}</div></div>
    </div>
    <section className="card"><div className="card-head"><h3>Planilha geral de propostas</h3></div><div className="card-body">
      <div className="grid grid-3" style={{marginBottom:16}}>
        <div className="field"><label>Buscar</label><input className="input" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Cliente, corretor, unidade ou número"/></div>
        <div className="field"><label>Status</label><select className="select" value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option value="">Todos</option>{Object.entries(statusLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></div>
        <div className="field"><label>Empreendimento</label><select className="select" value={developmentFilter} onChange={event=>setDevelopmentFilter(event.target.value)}><option value="">Todos</option>{developments.map(development=><option value={development.id} key={development.id}>{development.name}</option>)}</select></div>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Nº</th><th>Lead / cliente</th><th>Empreendimento</th><th>Valor proposto</th><th>Até chaves</th><th>Status</th><th>Atualização</th><th></th></tr></thead><tbody>
        {filteredProposals.length===0&&<tr><td colSpan={8}><div className="empty-state">Nenhuma proposta encontrada.</div></td></tr>}
        {filteredProposals.map(proposal=><tr key={proposal.id}>
          <td><strong>#{proposal.proposal_number}</strong><div className="faint">v{proposal.version}</div></td>
          <td><strong>{String(proposal.snapshot?.client_name??proposal.snapshot?.lead_name??'—')}</strong><div className="faint">{String(proposal.snapshot?.lead_name??'')}</div></td>
          <td><strong>{String(proposal.snapshot?.development_name??'—')}</strong><div className="faint">Unidade {String(proposal.snapshot?.unit_code??'—')}</div></td>
          <td><strong>{money.format(numberValue(proposal.proposed_price))}</strong></td>
          <td>{numberValue(proposal.snapshot?.paid_until_keys_percent).toFixed(2)}%<div className="faint">{money.format(numberValue(proposal.snapshot?.paid_until_keys_amount))}</div></td>
          <td>{canEdit?<select className="select" style={{minWidth:150}} value={workflowOf(proposal)} onChange={event=>onChangeStatus(proposal,event.target.value as WorkflowStatus)}>{Object.entries(statusLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select>:statusLabels[workflowOf(proposal)]}</td>
          <td>{date.format(new Date(proposal.updated_at))}</td>
          <td><div className="page-actions" style={{justifyContent:'flex-end'}}><a className="btn btn-ghost btn-sm" href={`/api/propostas/${proposal.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>{canEdit&&<button className="btn btn-ghost btn-sm" onClick={()=>onEdit(proposal)}>Editar</button>}</div></td>
        </tr>)}
      </tbody></table></div>
    </div></section>
  </>;
}
