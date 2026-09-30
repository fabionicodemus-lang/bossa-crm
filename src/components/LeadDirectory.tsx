"use client";
import { useState } from "react";
import { useCrmUI } from "./CrmUI";
import type { TeamMember } from "@/lib/types";
import { stageLabel } from "@/lib/stages";
import { locationOf, type TodayLead } from "@/lib/hoje-model";
export function LeadDirectory({
  leads,
  members,
  conversations = false,
}: {
  leads: TodayLead[];
  members: TeamMember[];
  conversations?: boolean;
}) {
  const ui = useCrmUI();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(0);
  const filtered = leads.filter(
    (l) =>
      (kind === "all" || l.kind === kind) &&
      [l.name, l.phone, l.company, l.enterprise, locationOf(l)].some((v) =>
        v?.toLowerCase().includes(query.toLowerCase()),
      ),
  );
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
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>{conversations ? "Atendimento" : "Tipo"}</th>
              <th>Empreendimento / Imobiliária</th>
              <th>Etapa</th>
              <th>Responsável</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.slice(page * size, (page + 1) * size).map((l) => (
              <tr key={l.id}>
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
                <td>
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
