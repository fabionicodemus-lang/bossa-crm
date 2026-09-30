import { PageTopbar } from "@/components/PageTopbar";
import { PipelineBoard } from "@/components/PipelineBoard";
import { GeneralPipelineBoard } from "@/components/GeneralPipelineBoard";
import { getCurrentContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  PIPELINE_LEAD_COLUMNS,
  toPipelineLeads,
} from "@/lib/pipeline-lead-select";

export async function ClientsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select(PIPELINE_LEAD_COLUMNS)
    .eq("organization_id", context!.organization.id)
    .eq("kind", "cliente")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(5000);
  return (
    <>
      {!embedded && (
        <PageTopbar
          title="Clientes finais"
          subtitle="Pipeline comercial e histórico unificado"
        />
      )}
      <div className="page-content">
        <PipelineBoard
          initialLeads={toPipelineLeads(data)}
          kind="cliente"
          organizationId={context!.organization.id}
          canEdit={context!.role !== "viewer"}
        />
      </div>
    </>
  );
}

export async function BrokersPage({ embedded = false }: { embedded?: boolean } = {}) {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select(PIPELINE_LEAD_COLUMNS)
    .eq("organization_id", context!.organization.id)
    .eq("kind", "corretor")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(5000);
  return (
    <>
      {!embedded && (
        <PageTopbar
          title="Corretores"
          subtitle="Relacionamento com imobiliárias e parceiros"
        />
      )}
      <div className="page-content">
        <PipelineBoard
          initialLeads={toPipelineLeads(data)}
          kind="corretor"
          organizationId={context!.organization.id}
          canEdit={context!.role !== "viewer"}
        />
      </div>
    </>
  );
}

export async function GeneralContactsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select(PIPELINE_LEAD_COLUMNS)
    .eq("organization_id", context!.organization.id)
    .eq("kind", "geral")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(5000);

  return (
    <>
      {!embedded && (
        <PageTopbar
          title="Contatos gerais"
          subtitle="Números do WhatsApp que ainda não são clientes nem corretores"
        />
      )}
      <div className="page-content">
        <GeneralPipelineBoard
          initialLeads={toPipelineLeads(data)}
          organizationId={context!.organization.id}
          canEdit={context!.role !== "viewer"}
        />
      </div>
    </>
  );
}
