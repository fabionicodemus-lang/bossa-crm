import Link from "next/link";
import { PageTopbar } from "@/components/PageTopbar";
import { getCurrentContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { stages } from "@/lib/commercial/model";
import { formatDateTime } from "@/lib/format";
export default async function Opportunities({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getCurrentContext();
  const db = await createClient();
  const p = await searchParams;
  const offset = Math.max(0, Math.min(100000, Number(p.offset) || 0));
  let query = db
    .from("commercial_opportunities")
    .select("id,title,stage,source,created_at,next_action,next_action_due_at", {
      count: "exact",
    })
    .eq("organization_id", ctx!.organization.id)
    .order("created_at", { ascending: false })
    .order("id")
    .range(offset, offset + 49);
  if (p.stage && Object.hasOwn(stages, p.stage))
    query = query.eq("stage", p.stage);
  if (p.owner) query = query.eq("owner_id", p.owner);
  if (p.source) query = query.eq("source", p.source);
  const { data, count, error } = await query;
  const link = (n: number) =>
    "/gestao/oportunidades?" +
    new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(p).filter(
          (v): v is [string, string] => typeof v[1] === "string",
        ),
      ),
      offset: String(n),
    });
  return (
    <>
      <PageTopbar
        title="Oportunidades de compra"
        subtitle="Intenções de compra, com histórico próprio"
        actions={
          <Link href="/gestao/nova" className="btn btn-primary">
            Nova oportunidade
          </Link>
        }
      />
      <div className="page-content">
        <Link href="/gestao">← Gestão</Link>{" · "}
        <Link href="/gestao/vinculos">Revisar vínculos de propostas e visitas</Link>{" · "}
        <Link href="/gestao/etapas">Etapas por fatos confirmados</Link>
        <form
          className="card card-body"
          style={{ display: "flex", gap: 12, marginBlock: 16 }}
        >
          <label>
            Etapa
            <select className="input" name="stage" defaultValue={p.stage ?? ""}>
              <option value="">Todas</option>
              {Object.entries(stages).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary">Filtrar</button>
        </form>
        {error ? (
          <p role="alert">
            Oportunidades indisponíveis. Verifique a implantação da base
            comercial.
          </p>
        ) : (
          <section className="card card-body" style={{ overflowX: "auto" }}>
            <p>{count} oportunidades no estoque atual.</p>
            <table className="table">
              <thead>
                <tr>
                  <th>Oportunidade</th>
                  <th>Etapa</th>
                  <th>Origem</th>
                  <th>Criação</th>
                  <th>Próxima ação</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/gestao/oportunidades/${o.id}`}>
                        {o.title}
                      </Link>
                    </td>
                    <td>{stages[o.stage as keyof typeof stages]}</td>
                    <td>{o.source ?? "Desconhecida"}</td>
                    <td>{formatDateTime(o.created_at)}</td>
                    <td>{o.next_action ?? "Não registrada"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {offset > 0 && (
              <Link href={link(Math.max(0, offset - 50))}>← Anterior </Link>
            )}
            {offset + 50 < (count ?? 0) && (
              <Link href={link(offset + 50)}>Próxima →</Link>
            )}
          </section>
        )}
      </div>
    </>
  );
}
