import { CommercialContactSelect } from "./CommercialContactSelect";
import { saveCommercial } from "@/app/(crm)/gestao/actions";
import { stages, losses } from "@/lib/commercial/model";
import type { ProposalLead } from "./proposals/model";
type Opportunity = {
  id?: string;
  title?: string;
  stage?: string;
  source?: string | null;
  owner_id?: string | null;
  next_action?: string | null;
  next_action_due_at?: string | null;
  loss_reason?: string | null;
  loss_note?: string | null;
  qualification?: Record<string, string>;
};
export function CommercialOpportunityForm({
  opportunity = {},
  contact,
  broker,
  team,
}: {
  opportunity?: Opportunity;
  contact?: ProposalLead | null;
  broker?: ProposalLead | null;
  team: { id: string; name: string }[];
}) {
  const o = opportunity;
  return (
    <form
      action={saveCommercial}
      className="card card-body"
      style={{ display: "grid", gap: 14 }}
    >
      <input type="hidden" name="operation" value="opportunity" />
      <input type="hidden" name="opportunity_id" value={o.id ?? ""} />
      <label>
        Intenção de compra
        <input
          name="title"
          defaultValue={o.title}
          required
          maxLength={200}
          placeholder="Ex.: apartamento para morar com a família"
          className="input"
        />
      </label>
      <label>
        Contato principal
        <CommercialContactSelect name="primary_contact_id" initial={contact} />
      </label>
      <label>
        Corretor vinculado
        <CommercialContactSelect
          name="broker_id"
          kind="corretor"
          initial={broker}
        />
      </label>
      <label>
        Responsável
        <select
          name="owner_id"
          defaultValue={o.owner_id ?? ""}
          className="input"
        >
          <option value="">Sem responsável</option>
          {team.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Etapa
        <select name="stage" defaultValue={o.stage ?? "new"} className="input">
          {Object.entries(stages).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Origem inicial
        <input
          name="source"
          defaultValue={o.source ?? ""}
          className="input"
          placeholder="Deixe vazio quando desconhecida"
        />
      </label>
      <fieldset style={{ display: "grid", gap: 12 }}>
        <legend>Qualificação</legend>
        {[
          ["need", "Necessidade"],
          ["product", "Produto compatível"],
          ["horizon", "Horizonte de compra"],
          ["commercial_fit", "Compatibilidade comercial"],
        ].map(([name, label]) => (
          <label key={name}>
            {label}
            <input
              name={name}
              defaultValue={o.qualification?.[name] ?? ""}
              className="input"
            />
          </label>
        ))}
      </fieldset>
      <label>
        Próxima ação
        <input
          name="next_action"
          defaultValue={o.next_action ?? ""}
          className="input"
        />
      </label>
      <label>
        Prazo (Brasília)
        <input
          type="datetime-local"
          name="next_action_due_at"
          defaultValue={
            o.next_action_due_at
              ? new Date(new Date(o.next_action_due_at).getTime() - 3 * 3600000)
                  .toISOString()
                  .slice(0, 16)
              : ""
          }
          className="input"
        />
      </label>
      <label>
        Motivo da alteração de responsável/corretor
        <input name="attribution_reason" className="input" />
      </label>
      <label>
        Motivo de perda
        <select
          name="loss_reason"
          defaultValue={o.loss_reason ?? ""}
          className="input"
        >
          <option value="">Não se aplica</option>
          {Object.entries(losses).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        Observação da perda
        <textarea
          name="loss_note"
          defaultValue={o.loss_note ?? ""}
          className="input"
        />
      </label>
      <button className="btn btn-primary">Salvar oportunidade</button>
    </form>
  );
}
