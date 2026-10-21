import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageTopbar } from "@/components/PageTopbar";
import { CommercialOpportunityForm } from "@/components/CommercialOpportunityForm";
import { CommercialContactSelect } from "@/components/CommercialContactSelect";
import { formatDateTime } from "@/lib/format";
import { saveCommercial } from "../../actions";
import type { ReactNode } from "react";
function Form({
  id,
  operation,
  title,
  children,
}: {
  id: string;
  operation: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <form
      action={saveCommercial}
      className="card card-body"
      style={{ display: "grid", gap: 12 }}
    >
      <h3>{title}</h3>
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="opportunity_id" value={id} />
      {children}
      <button className="btn btn-primary">Salvar</button>
    </form>
  );
}
export default async function Opportunity({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; return?: string }>;
}) {
  const ctx = await getCurrentContext();
  const db = await createClient();
  const { id } = await params;
  const p = await searchParams;
  const org = ctx!.organization.id;
  const r = await db
    .from("commercial_opportunities")
    .select("*")
    .eq("organization_id", org)
    .eq("id", id)
    .maybeSingle();
  if (r.error) throw r.error;
  if (!r.data) notFound();
  const o = r.data;
  const results = await Promise.all([
    db
      .from("leads")
      .select("id,name,kind,phone,enterprise,company,group_name")
      .eq("organization_id", org)
      .in("id", [o.primary_contact_id, o.broker_id].filter(Boolean)),
    db
      .from("memberships")
      .select("user_id,profiles(full_name)")
      .eq("organization_id", org),
    db
      .from("commercial_events")
      .select("id,event_type,occurred_at,recorded_at,actor_id,source")
      .eq("organization_id", org)
      .eq("opportunity_id", id)
      .order("recorded_at", { ascending: false })
      .limit(100),
    db
      .from("commercial_interests")
      .select("id,is_primary,developments(name),development_units(unit_code)")
      .eq("organization_id", org)
      .eq("opportunity_id", id),
    db
      .from("commercial_participants")
      .select("contact_id,role,leads(name)")
      .eq("organization_id", org)
      .eq("opportunity_id", id),
    db
      .from("developments")
      .select("id,name")
      .eq("organization_id", org)
      .order("name"),
    db
      .from("proposals")
      .select("id,proposal_number,status,proposed_price,opportunity_id")
      .eq("organization_id", org)
      .or(
        `opportunity_id.eq.${id},and(opportunity_id.is.null,lead_id.eq.${o.primary_contact_id})`,
      )
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("agenda_events")
      .select("id,title,starts_at,visit_outcome,opportunity_id")
      .eq("organization_id", org)
      .or(
        `opportunity_id.eq.${id},and(opportunity_id.is.null,lead_id.eq.${o.primary_contact_id})`,
      )
      .order("starts_at", { ascending: false })
      .limit(100),
    db
      .from("commercial_contracts")
      .select("*")
      .eq("organization_id", org)
      .eq("opportunity_id", id)
      .order("signed_at", { ascending: false }),
    db
      .from("development_units")
      .select("id,unit_code,development_id,developments(name)")
      .eq("organization_id", org)
      .order("unit_code")
      .limit(2000),
  ]);
  for (const result of results) if (result.error) throw result.error;
  const [
    contacts,
    team,
    events,
    interests,
    participants,
    developments,
    proposals,
    visits,
    contracts,
    units,
  ] = results;
  const contact = contacts.data?.find((c) => c.id === o.primary_contact_id);
  const broker = contacts.data?.find((c) => c.id === o.broker_id);
  const teamOptions = (team.data ?? []).map((m) => ({
    id: m.user_id,
    name:
      (m.profiles as unknown as { full_name: string } | null)?.full_name ??
      m.user_id,
  }));
  const label = (value: unknown, key: string) =>
    String((value as Record<string, unknown> | null)?.[key] ?? "—");
  return (
    <>
      <PageTopbar
        title={o.title}
        subtitle={`Criada em ${formatDateTime(o.created_at)}`}
      />
      <div className="page-content">
        <Link href={`/gestao${p.return ? "?" + p.return : ""}`}>
          ← Gestão e filtros
        </Link>{" "}
        ·{" "}
        <Link href={`/leads/${o.primary_contact_id}`}>
          Abrir atendimento, tarefas e histórico do contato
        </Link>
        {p.error && <p role="alert">{p.error}</p>}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
            gap: 16,
            marginBlock: 16,
          }}
        >
          {ctx!.role !== "viewer" && (
            <CommercialOpportunityForm
              opportunity={o}
              contact={contact}
              broker={broker}
              team={teamOptions}
            />
          )}
          <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <section className="card card-body">
              <h3>Participantes e interesses</h3>
              {participants.data?.map((v) => (
                <p key={v.contact_id}>
                  {label(v.leads, "name")} · {v.role}
                </p>
              ))}
              {interests.data?.map((v) => (
                <p key={v.id}>
                  {label(v.developments, "name")} ·{" "}
                  {label(v.development_units, "unit_code")}{" "}
                  {v.is_primary ? "· principal" : "· alternativa"}
                </p>
              ))}
              <p>
                Os totais de interesse por empreendimento não são somáveis: uma
                oportunidade pode consultar mais de um produto.
              </p>
            </section>
            {ctx!.role !== "viewer" && (
              <>
                <Form
                  id={id}
                  operation="participant"
                  title="Adicionar participante"
                >
                  <CommercialContactSelect name="contact_id" />
                  <select name="role" className="input">
                    <option value="buyer">Comprador</option>
                    <option value="spouse">Cônjuge</option>
                    <option value="representative">Representante</option>
                  </select>
                </Form>
                <Form id={id} operation="interest" title="Adicionar interesse">
                  <label>
                    Empreendimento
                    <select name="development_id" className="input">
                      {developments.data?.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Unidade (opcional)
                    <select name="unit_id" className="input">
                      <option value="">Ainda não definida</option>
                      {units.data?.map((u) => (
                        <option key={u.id} value={u.id}>
                          {label(u.developments, "name")} · {u.unit_code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <input type="checkbox" name="is_primary" /> Interesse
                    principal
                  </label>
                </Form>
                <Form
                  id={id}
                  operation="proposal"
                  title="Vincular proposta existente"
                >
                  <label>
                    Proposta
                    <select name="proposal_id" required className="input">
                      <option value="">Selecione</option>
                      {proposals.data
                        ?.filter((v) => !v.opportunity_id)
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            #{v.proposal_number} · {v.status}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    <input type="checkbox" name="commercial_primary" />{" "}
                    Alternativa principal
                  </label>
                  <small>
                    O vínculo não comprova envio retroativo. Use o módulo de
                    propostas para registrar novos envios.
                  </small>
                </Form>
                <Form
                  id={id}
                  operation="visit"
                  title="Vincular visita e registrar desfecho"
                >
                  <label>
                    Compromisso
                    <select name="event_id" required className="input">
                      <option value="">Selecione</option>
                      {visits.data?.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.title} · {formatDateTime(v.starts_at)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tipo
                    <select name="visit_kind" className="input">
                      <option value="buyer">Com comprador</option>
                      <option value="broker_only">Corretor sozinho</option>
                      <option value="remote">Apresentação remota</option>
                    </select>
                  </label>
                  <label>
                    Desfecho
                    <select name="visit_outcome" className="input">
                      <option value="">Agendada / ainda não realizado</option>
                      <option value="confirmed">Confirmada</option>
                      <option value="completed">Realizada</option>
                      <option value="cancelled">Cancelada</option>
                      <option value="no_show">Não compareceu</option>
                      <option value="rescheduled">
                        Remarcada (ocorrência substituída)
                      </option>
                    </select>
                  </label>
                  <label>
                    Resultado
                    <input name="commercial_result" className="input" />
                  </label>
                  <label>
                    Próxima ação
                    <input name="commercial_next_action" className="input" />
                  </label>
                </Form>
              </>
            )}
          </div>
        </div>
        <section className="card card-body">
          <h3>Contratos documentados</h3>
          {contracts.data?.length ? (
            contracts.data.map((c) => (
              <p key={c.id}>
                {c.id} · {formatDateTime(c.signed_at)} · R${" "}
                {Number(c.amount).toLocaleString("pt-BR")} ·{" "}
                {c.cancelled_at ? "Distratado" : "Assinado"}
              </p>
            ))
          ) : (
            <p>
              Nenhum contrato documentado. Proposta aceita ou reserva não
              equivale a contrato.
            </p>
          )}
        </section>
        {ctx!.role === "admin" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
              gap: 16,
              marginBlock: 16,
            }}
          >
            <Form
              id={id}
              operation="contract"
              title="Confirmar contrato documentado"
            >
              <label>
                Unidade
                <select name="unit_id" required className="input">
                  <option value="">Selecione</option>
                  {units.data?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {label(u.developments, "name")} · {u.unit_code}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assinatura (Brasília)
                <input
                  name="signed_at"
                  type="datetime-local"
                  required
                  className="input"
                />
              </label>
              <label>
                Valor contratado
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  className="input"
                />
              </label>
              <label>
                Documento / referência verificável
                <input name="document_reference" required className="input" />
              </label>
            </Form>
            <Form id={id} operation="receipt" title="Confirmar recebimento">
              <label>
                Contrato
                <select name="contract_id" required className="input">
                  <option value="">Selecione</option>
                  {contracts.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Recebido em (Brasília)
                <input
                  name="received_at"
                  type="datetime-local"
                  required
                  className="input"
                />
              </label>
              <label>
                Valor
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  className="input"
                />
              </label>
              <label>
                Tipo
                <select name="kind" className="input">
                  <option value="entry">Entrada</option>
                  <option value="installment">Parcela</option>
                  <option value="reinforcement">Reforço</option>
                  <option value="keys">Chaves</option>
                  <option value="other">Outro</option>
                </select>
              </label>
              <label>
                Identificador único da transação
                <input name="external_id" required className="input" />
              </label>
              <label>
                Comprovante / referência
                <input name="evidence" required className="input" />
              </label>
            </Form>
          </div>
        )}
        {ctx!.role === "admin" && (
          <Form id={id} operation="cancellation" title="Registrar distrato">
            <label>
              Contrato
              <select name="contract_id" required className="input">
                <option value="">Selecione</option>
                {contracts.data
                  ?.filter((c) => !c.cancelled_at)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Data do distrato (Brasília)
              <input
                name="cancelled_at"
                type="datetime-local"
                required
                className="input"
              />
            </label>
            <label>
              Motivo
              <input name="cancellation_reason" required className="input" />
            </label>
          </Form>
        )}
        <section className="card card-body">
          <h3>Eventos registrados</h3>
          <p>
            Data do acontecimento e data do registro são preservadas
            separadamente. Últimos 100 eventos.
          </p>
          {events.data?.map((e) => (
            <p key={e.id}>
              {e.event_type} · aconteceu {formatDateTime(e.occurred_at)} ·
              registrado {formatDateTime(e.recorded_at)} · {e.source}
            </p>
          ))}
        </section>
      </div>
    </>
  );
}
