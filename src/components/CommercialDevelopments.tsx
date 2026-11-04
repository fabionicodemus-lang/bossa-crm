import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Dashboard, Metric } from "@/lib/commercial/model";

type Development = { id: string; name: string };
type Results = Dashboard["metrics"] | null;

const integer = (value: number) => value.toLocaleString("pt-BR");
const currency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function CommercialDevelopments({
  org,
  start,
  end,
  filters,
  developments,
  baseQuery,
}: {
  org: string;
  start: string;
  end: string;
  filters: Record<string, string | undefined>;
  developments: Development[];
  baseQuery: string;
}) {
  if (!developments.length) return null;
  const db = await createClient();
  const visible = developments.slice(0, 12);
  // In the comparison, a selected project must not hide the other projects.
  const comparisonFilters = { ...filters };
  delete comparisonFilters.development;
  const rows = await Promise.all(
    visible.map(async (development) => {
      const { data, error } = await db.rpc("commercial_dashboard", {
        p_org: org,
        p_start: start,
        p_end: end,
        p_filters: { ...comparisonFilters, development: development.id },
      });
      const metrics: Results =
        error || !(data as Dashboard | null)?.metrics
          ? null
          : (data as Dashboard).metrics;
      const params = new URLSearchParams(baseQuery);
      params.set("development", development.id);
      params.delete("metric");
      params.delete("offset");
      return { ...development, metrics, url: "/gestao?" + params.toString() };
    }),
  );
  const val = (metrics: Results, key: Metric) =>
    metrics ? Number(metrics[key]?.value ?? 0) : null;
  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <h3>Empreendimentos — interesse e resultado comprovado</h3>
      </div>
      <div className="card-body" style={{ overflowX: "auto" }}>
        <p>
          Mesmo período e filtros de responsável, corretor e origem do painel.
          Clique no empreendimento para abrir seus registros.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Empreendimento</th>
              <th>Novas intenções</th>
              <th>Qualificadas</th>
              <th>Visitas</th>
              <th>Propostas enviadas</th>
              <th>Contratos assinados</th>
              <th>Valor contratado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td><Link href={row.url}>{row.name}</Link></td>
                {(["new", "qualified", "visits", "proposals", "contracts"] as Metric[]).map((metric) => {
                  const value = val(row.metrics, metric);
                  return <td key={metric}>{value === null ? "Indisponível" : integer(value)}</td>;
                })}
                <td>{val(row.metrics, "value") === null ? "Indisponível" : currency(val(row.metrics, "value")!)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Intenções, qualificações e visitas são associadas aos interesses
          atualmente registrados; um comprador pode aparecer em mais de um
          empreendimento. Portanto, essas colunas não devem ser somadas.
          Propostas são atribuídas pela unidade da proposta e contratos e
          recebimentos pela unidade efetivamente contratada. Visitas ainda não
          possuem vínculo exclusivo com um empreendimento.
        </p>
        {developments.length > visible.length && (
          <p>
            Exibindo os primeiros {visible.length} empreendimentos para limitar
            consultas simultâneas. Selecione um dos demais no filtro acima.
          </p>
        )}
        {rows.some((row) => !row.metrics) && (
          <p role="alert">
            Alguns resultados estão indisponíveis. Confira as migrações e as
            permissões; valores faltantes não foram presumidos como zero.
          </p>
        )}
      </div>
    </section>
  );
}
