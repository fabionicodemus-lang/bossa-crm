import { getCurrentContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodRange, metricDefinitions } from "@/lib/commercial/model";
export async function GET(request: Request) {
  const ctx = await getCurrentContext({ redirectIfMissing: false });
  if (!ctx) return Response.json({ error: "Não autenticado" }, { status: 401 });
  const p = Object.fromEntries(new URL(request.url).searchParams);
  if (!Object.hasOwn(metricDefinitions, p.metric))
    return Response.json({ error: "Indicador inválido" }, { status: 400 });
  let range;
  try {
    range = periodRange(p);
  } catch {
    return Response.json({ error: "Período inválido" }, { status: 400 });
  }
  const db = await createClient();
  const filters = Object.fromEntries(
    ["development", "owner", "broker", "source", "format"]
      .filter((k) => p[k])
      .map((k) => [k, p[k]]),
  );
  const { data, error } = await db.rpc("commercial_detail", {
    p_org: ctx.organization.id,
    p_start: range.start,
    p_end: range.end,
    p_metric: p.metric,
    p_filters: filters,
    p_offset: Number(p.offset) || 0,
  });
  if (error)
    return Response.json({ error: "Exportação indisponível" }, { status: 503 });
  const cell = (v: unknown) =>
    `"${String(v ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""')}"`;
  const csv = [
    ["Oportunidade", "ID", "Data UTC", "Valor BRL"],
    ...data.rows.map(
      (r: {
        title: string;
        entity_id: string;
        occurred_at: string;
        amount: number;
      }) => [r.title, r.entity_id, r.occurred_at, r.amount],
    ),
  ]
    .map((row) => row.map(cell).join(";"))
    .join("\r\n");
  return new Response("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="indicadores-bossa-pagina.csv"',
      "Cache-Control": "no-store",
    },
  });
}
