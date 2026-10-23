import { createClient } from "@/lib/supabase/server";
import { stages } from "@/lib/commercial/model";

type StageDuration = {
  stage: string;
  sample_size: number;
  median_hours: number;
  p90_hours: number;
};

const days = (hours: number) =>
  (hours / 24).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export async function CommercialStageDuration({
  org,
  start,
  end,
  filters,
}: {
  org: string;
  start: string;
  end: string;
  filters: Record<string, string | undefined>;
}) {
  const db = await createClient();
  const { data, error } = await db.rpc("commercial_stage_durations", {
    p_org: org,
    p_start: start,
    p_end: end,
    p_filters: filters,
  });
  if (error) return (
    <section className="card card-body" style={{ marginTop: 16 }}>
      <h3>Tempo por etapa</h3>
      <p role="alert">Tempo por etapa indisponível; confira a migração comercial.</p>
    </section>
  );
  const durations = (data ?? []) as StageDuration[];
  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <h3>Tempo de permanência por etapa</h3>
      </div>
      <div className="card-body" style={{ overflowX: "auto" }}>
        <p>
          Mediana e percentil 90 (P90) das transições efetivamente encerradas no período.
          A amostra indica quantas passagens de etapa foram registradas; sem estimar
          histórico antigo ou duração das oportunidades ainda abertas.
        </p>
        {durations.length === 0
          ? <p>Ainda não existem transições concluídas e documentadas neste período.</p>
          : <table className="table">
            <thead>
              <tr><th>Etapa anterior</th><th>Passagens</th><th>Mediana</th><th>P90</th></tr>
            </thead>
            <tbody>
              {durations.map((row) => (
                <tr key={row.stage}>
                  <td>{stages[row.stage as keyof typeof stages] ?? row.stage}</td>
                  <td>{row.sample_size.toLocaleString("pt-BR")}</td>
                  <td>{days(Number(row.median_hours))} dias</td>
                  <td>{days(Number(row.p90_hours))} dias</td>
                </tr>
              ))}
            </tbody>
          </table>}
        <small>
          O resultado mede somente etapas com entrada e saída registradas, e
          usa a carteira atualmente atribuída nos filtros. Não representa o
          tempo total das oportunidades que continuam abertas.
        </small>
      </div>
    </section>
  );
}
