import { PageTopbar } from "@/components/PageTopbar";
import { BrokersPage } from "@/components/PipelinePages";

export default function CorretoresPipelinePage() {
  return (
    <>
      <PageTopbar
        title="Pipeline Corretores"
        subtitle="Corretores, imobiliárias e parceiros comerciais"
      />
      <BrokersPage embedded />
    </>
  );
}
