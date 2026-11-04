import Link from "next/link";
import { getCurrentContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CommercialOpportunityForm } from "@/components/CommercialOpportunityForm";
import { PageTopbar } from "@/components/PageTopbar";
export default async function New({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; lead_id?: string }>;
}) {
  const ctx = await getCurrentContext();
  const db = await createClient();
  const p = await searchParams;
  if (ctx!.role === "viewer")
    return <p>Sem permissão para cadastrar oportunidades.</p>;
  const { data, error } = await db
    .from("memberships")
    .select("user_id,profiles(full_name)")
    .eq("organization_id", ctx!.organization.id);
  if (error) throw error;
  const selectedContact = p.lead_id
    ? await db.from("leads")
        .select("id,name,kind,phone,enterprise,company,group_name")
        .eq("organization_id", ctx!.organization.id)
        .eq("kind", "cliente")
        .is("archived_at", null)
        .eq("id", p.lead_id)
        .maybeSingle()
    : null;
  const contact = selectedContact?.data
    ? { ...selectedContact.data, kind: "cliente" as const }
    : null;
  const team = (data ?? []).map((m) => ({
    id: m.user_id,
    name:
      (m.profiles as unknown as { full_name: string } | null)?.full_name ??
      m.user_id,
  }));
  return (
    <>
      <PageTopbar
        title="Nova oportunidade"
        subtitle="Uma intenção concreta de compra, com um ou mais participantes"
      />
      <div className="page-content" style={{ maxWidth: 850 }}>
        <Link href="/gestao">← Gestão</Link>
        {p.error && <p role="alert">{p.error}</p>}
        <p>
          Consultar dois empreendimentos na mesma negociação exige apenas uma
          oportunidade. Cadastre os interesses depois de salvar.
        </p>
        {p.lead_id && !contact && (
          <p role="alert">
            Contato não encontrado, arquivado ou indisponível para esta organização.
            Escolha um contato ativo antes de salvar.
          </p>
        )}
        <CommercialOpportunityForm team={team} contact={contact} />
      </div>
    </>
  );
}
