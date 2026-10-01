"use client";
import { useState } from "react";
import type { BrokerCounts } from "@/lib/broker-performance";
import { BrokerPerformanceDetails } from "./BrokerPerformanceDetails";
import { useCrmUI } from "./CrmUI";
import type { TeamMember } from "@/lib/types";
import { stageLabel } from "@/lib/stages";
import { locationOf, type TodayLead } from "@/lib/hoje-model";
export function LeadDirectory({
  leads,
  members,
  conversations = false,
  brokerCounts = [],
}: {
  leads: TodayLead[];
  members: TeamMember[];
  conversations?: boolean;
  brokerCounts?: BrokerCounts[];
}) {
  const ui = useCrmUI();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(0);
  const [ranking, setRanking] = useState('overall');
  const [details, setDetails] = useState<string | null>(null);
  const counts = new Map(brokerCounts.map(c=>[c.lead_id,c]));
  const showRanking = kind === 'corretor' && !conversations;
  const metricColumns = [['interested_clients','Clientes interessados'],['interactions','Interações'],['proposals','Propostas'],['visits_with_clients','Visitas com clientes'],['visits_without_clients','Visitas sem clientes'],['units_sold','Unidades vendidas']] as const;
  const rankingOptions = [['overall','Geral'],['units_sold','Unidades vendidas'],['proposals','Propostas'],['visits_with_clients','Visitas com clientes'],['visits_without_clients','Visitas sem clientes'],['interactions','Interações'],['interested_clients','Clientes interessados']] as const;
  const scoreOf = (c?: BrokerCounts) => Number(c?.units_sold??0)*100 + Number(c?.proposals??0)*20 + Number(c?.visits_with_clients??0)*10 + Number(c?.visits_without_clients??0)*4 + Number(c?.interactions??0);
  const unreadMedia = brokerCounts.reduce((sum,c)=>sum+Number(c.unread_media??0),0);
  const completed = brokerCounts.filter(c=>c.review_status==='completed' || !c.review_status).length;
  const filtered = leads.filter(
    (l) =>
      (kind === "all" || l.kind === kind) &&
      [l.name, l.phone, l.company, l.enterprise, locationOf(l)].some((v) =>
        v?.toLowerCase().includes(query.toLowerCase()),
      ),
  );
  if(showRanking) filtered.sort((a,b)=>{
    const aCounts=counts.get(a.id);
    const bCounts=counts.get(b.id);
    if(ranking==='overall'){
      return scoreOf(bCounts)-scoreOf(aCounts)
        || Number(bCounts?.units_sold??0)-Number(aCounts?.units_sold??0)
        || Number(bCounts?.proposals??0)-Number(aCounts?.proposals??0)
        || Number(bCounts?.visits_with_clients??0)-Number(aCounts?.visits_with_clients??0)
        || Number(bCounts?.visits_without_clients??0)-Number(aCounts?.visits_without_clients??0)
        || Number(bCounts?.interactions??0)-Number(aCounts?.interactions??0)
        || Number(bCounts?.interested_clients??0)-Number(aCounts?.interested_clients??0)
        || a.name.localeCompare(b.name,'pt-BR');
    }
    const metric=ranking as keyof BrokerCounts;
    const delta=Number(bCounts?.[metric]??0)-Number(aCounts?.[metric]??0);
    return delta || scoreOf(bCounts)-scoreOf(aCounts) || a.name.localeCompare(b.name,'pt-BR');
  });
  const size = 50;
  return (
    <>
      <div className="directory-toolbar">
        <input
          className="input"
          aria-label="Buscar leads"
          placeholder="Buscar nome, empreendimento ou imobiliária…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <select
          className="select"
          aria-label="Tipo de lead"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(0);
          }}
        >
          <option value="all">Todos os contatos</option>
          <option value="cliente">Clientes diretos</option>
          <option value="corretor">Corretores</option>
          <option value="geral">Geral</option>
        </select>
        <span className="faint">{filtered.length} contatos</span>
      </div>
      {showRanking && <div className="info-box" style={{marginBottom:12}}>
        <strong>Ranking de corretores</strong> · Histórico conferido: {completed}/{brokerCounts.length} corretores.
        {unreadMedia>0 && <div>{unreadMedia} mídias sem conteúdo legível no histórico; não usadas como comprovação.</div>}
        <div>Ranking geral: venda 100 pts · proposta 20 pts · visita com cliente 10 pts · visita sem cliente 4 pts · interação 1 pt. Cliente interessado segue disponível para ordenação, mas não soma pontos.</div>
        <div>Interação = dia com conversa recebida do corretor, inclusive pedido de material/informação. Visitas apenas agendadas e fatos incertos ficam pendentes.</div>
        <label>Ordenar por <select className="select" value={ranking} onChange={e=>{setRanking(e.target.value);setPage(0);}}>{rankingOptions.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      </div>}
      {details && <BrokerPerformanceDetails key={details} leadId={details} name={leads.find(l=>l.id===details)?.name??'Corretor'} onClose={()=>setDetails(null)} />}
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              {showRanking && <th>Posição</th>}
              {showRanking && <th>Pontos</th>}
              <th>Nome</th>
              <th>{conversations ? "Atendimento" : "Tipo"}</th>
              <th>Empreendimento / Imobiliária</th>
              <th>Etapa</th>
              <th>Responsável</th>
              {showRanking && metricColumns.map(([key,label])=><th key={key}>{label}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.slice(page * size, (page + 1) * size).map((l,index) => (
              <tr key={l.id}>
                {showRanking && <td>{page*size+index+1}º</td>}
                {showRanking && <td><strong>{scoreOf(counts.get(l.id))}</strong></td>}
                <td>
                  <button
                    className="plain-name"
                    onClick={() =>
                      ui.openLead(l.id, conversations ? "whatsapp" : "dados")
                    }
                  >
                    {l.name}
                  </button>
                  <div className="faint">{locationOf(l)}</div>
                </td>
                <td>
                  {conversations ? (
                    <span
                      className={`directory-status ${
                        l.stage === "passagem_pendente"
                          ? "handoff"
                          : l.owner_mode === "ai"
                            ? "ai"
                            : l.owner_mode === "human"
                              ? "human"
                              : "neutral"
                      }`}
                    >
                      <i aria-hidden="true" />
                      {l.stage === "passagem_pendente"
                        ? "Passagem pendente"
                        : l.owner_mode === "ai"
                          ? l.kind === "corretor"
                            ? "Plantão"
                            : "Nara"
                          : l.owner_mode === "human"
                            ? "Humano"
                            : "Encerrado"}
                    </span>
                  ) : (
                    <span className="directory-kind">
                      {l.kind === "cliente"
                        ? "Cliente"
                        : l.kind === "corretor"
                          ? "Corretor"
                          : "Geral"}
                    </span>
                  )}
                </td>
                <td>
                  {l.kind === "corretor"
                    ? l.company || "Autônomo"
                    : l.enterprise || "—"}
                </td>
                <td>{stageLabel(l.kind, l.stage)}</td>
                <td>
                  {l.owner_mode === "ai"
                    ? l.kind === "corretor"
                      ? "Plantão"
                      : "Nara"
                    : l.owner_id
                      ? members.find((m) => m.user_id === l.owner_id)
                          ?.full_name || "Equipe"
                      : "Sem responsável"}
                </td>
                {showRanking && metricColumns.map(([key,label])=><td key={key}><button className="btn btn-ghost btn-sm" aria-label={`${label} de ${l.name}`} onClick={()=>key==='interactions'?ui.openLead(l.id,'whatsapp'):setDetails(l.id)}>{counts.get(l.id)?.[key]??0}</button></td>)}
                <td>
                  {showRanking && counts.get(l.id)?.review_status!=='completed' && <small className="faint">{counts.get(l.id)?.review_status==='error'?'Conferência pendente':'Histórico em análise'}<br/></small>}
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      ui.openLead(l.id, conversations ? "whatsapp" : "dados")
                    }
                  >
                    {conversations ? "Abrir conversa" : "Abrir lead"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="empty-state">Nenhum contato encontrado.</div>
        )}
      </section>
      <div className="directory-pagination">
        <button
          className="btn btn-ghost btn-sm"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </button>
        <span>
          {page + 1} de {Math.max(1, Math.ceil(filtered.length / size))}
        </span>
        <button
          className="btn btn-ghost btn-sm"
          disabled={(page + 1) * size >= filtered.length}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </button>
      </div>
    </>
  );
}
