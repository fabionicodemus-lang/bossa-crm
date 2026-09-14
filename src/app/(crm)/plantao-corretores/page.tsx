import { PageTopbar } from '@/components/PageTopbar';
import { PlantaoScheduleManager } from '@/components/PlantaoScheduleManager';
import { requireAdmin } from '@/lib/auth';

export default async function PlantaoCorretoresPage() {
  const context = await requireAdmin();

  return <>
    <PageTopbar
      title="Plantão IA · Corretores"
      subtitle="Defina exatamente quando a IA atende e quando as conversas ficam para o comercial"
    />
    <div className="page-content">
      <PlantaoScheduleManager organizationId={context.organization.id} userId={context.userId} />
    </div>
  </>;
}
