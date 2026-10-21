import Link from "next/link";
import { getCurrentContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CommercialOpportunityForm } from "@/components/CommercialOpportunityForm";
import { PageTopbar } from "@/components/PageTopbar";
export default async function New({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
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
        <CommercialOpportunityForm team={team} />
      </div>
    </>
  );
}
