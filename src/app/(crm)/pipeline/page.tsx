import Link from "next/link";
import {
  ClientsPage,
  BrokersPage,
  GeneralContactsPage as GeneralPage,
} from "@/components/PipelinePages";
export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo = "cliente" } = await searchParams;
  return (
    <>
      <nav className="pipeline-tabs" aria-label="Pipeline">
        {[
          { id: "cliente", label: "Clientes diretos" },
          { id: "corretor", label: "Corretores" },
          { id: "geral", label: "Geral" },
        ].map((t) => (
          <Link
            className={tipo === t.id ? "on" : ""}
            href={`/pipeline?tipo=${t.id}`}
            key={t.id}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tipo === "corretor" ? (
        <BrokersPage />
      ) : tipo === "geral" ? (
        <GeneralPage />
      ) : (
        <ClientsPage />
      )}
    </>
  );
}
