import Link from "next/link";
import { PageTopbar } from "@/components/PageTopbar";
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
      <PageTopbar
        title="Pipeline"
        subtitle="Clientes diretos, corretores e contatos gerais"
      />
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
        <BrokersPage embedded />
      ) : tipo === "geral" ? (
        <GeneralPage embedded />
      ) : (
        <ClientsPage embedded />
      )}
    </>
  );
}
