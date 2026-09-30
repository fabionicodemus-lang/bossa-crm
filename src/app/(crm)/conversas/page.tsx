import { PageTopbar } from "@/components/PageTopbar";
import { LeadDirectory } from "@/components/LeadDirectory";
import { getCurrentContext } from "@/lib/auth";
import { loadDirectory } from "@/lib/hoje-data";
export default async function ConversationsPage() {
  const data = await loadDirectory((await getCurrentContext())!);
  return (
    <>
      <PageTopbar
        title="Conversas"
        subtitle="Atendimento humano, Nara e Plantão"
      />
      <div className="page-content">
        <LeadDirectory
          members={data.members}
          conversations
          leads={[...data.leads].sort((a, b) =>
            b.updated_at.localeCompare(a.updated_at),
          )}
        />
      </div>
    </>
  );
}
