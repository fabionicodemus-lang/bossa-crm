import { PageTopbar } from "@/components/PageTopbar";
import { LeadDirectory } from "@/components/LeadDirectory";
import { getCurrentContext } from "@/lib/auth";
import { loadDirectory } from "@/lib/hoje-data";
export default async function LeadsPage() {
  const data = await loadDirectory((await getCurrentContext())!);
  return (
    <>
      <PageTopbar
        title="Leads"
        subtitle="Todos os contatos e suas informações"
      />
      <div className="page-content">
        <LeadDirectory members={data.members} leads={data.leads} brokerCounts={data.brokerCounts} />
      </div>
    </>
  );
}
