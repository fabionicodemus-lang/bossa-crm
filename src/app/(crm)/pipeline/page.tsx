import { redirect } from "next/navigation";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo = "cliente" } = await searchParams;
  if (tipo === "corretor") redirect("/corretores");
  if (tipo === "geral") redirect("/geral");
  redirect("/clientes");
}
