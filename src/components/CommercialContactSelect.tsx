"use client";
import { useState } from "react";
import { SearchableLeadSelect } from "./proposals/SearchableLeadSelect";
import type { ProposalLead } from "./proposals/model";
export function CommercialContactSelect({
  name,
  kind = "cliente",
  initial,
}: {
  name: string;
  kind?: "cliente" | "corretor";
  initial?: ProposalLead | null;
}) {
  const [selected, setSelected] = useState<ProposalLead | null>(
    initial ?? null,
  );
  const id = selected?.id ?? "";
  // A sentinel selects the correct existing search endpoint without loading the full contact base.
  const seed: ProposalLead = selected ?? {
    id: "",
    kind,
    name: "",
    phone: null,
    enterprise: null,
    company: null,
    group_name: null,
  };
  return (
    <>
      <input type="hidden" name={name} value={id} />
      <SearchableLeadSelect
        key={id}
        leads={[seed]}
        value={id}
        onChange={() => {}}
        onSelect={setSelected}
        placeholder={
          kind === "corretor"
            ? "Buscar corretor ou imobiliária…"
            : "Buscar cliente…"
        }
      />
      {selected && (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setSelected(null)}
        >
          Limpar seleção
        </button>
      )}
    </>
  );
}
