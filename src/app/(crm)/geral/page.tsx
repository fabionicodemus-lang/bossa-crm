import { PageTopbar } from "@/components/PageTopbar";
import { GeneralContactsPage } from "@/components/PipelinePages";

export default function ContatosGeraisPage() {
  return (
    <>
      <PageTopbar
        title="Contatos gerais"
        subtitle="Contatos ainda não classificados como cliente ou corretor"
      />
      <GeneralContactsPage embedded />
    </>
  );
}
