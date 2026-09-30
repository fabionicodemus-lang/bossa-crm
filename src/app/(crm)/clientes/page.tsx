import { PageTopbar } from "@/components/PageTopbar";
import { ClientsPage } from "@/components/PipelinePages";

export default function ClientesPipelinePage() {
  return (
    <>
      <PageTopbar
        title="Pipeline Clientes"
        subtitle="Clientes finais e oportunidades comerciais"
      />
      <ClientsPage embedded />
    </>
  );
}
