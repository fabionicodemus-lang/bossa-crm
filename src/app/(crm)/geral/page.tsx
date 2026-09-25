import { GeneralPipelineBoard } from '@/components/GeneralPipelineBoard';
import { PageTopbar } from '@/components/PageTopbar';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PIPELINE_LEAD_COLUMNS, toPipelineLeads } from '@/lib/pipeline-lead-select';

export default async function GeneralContactsPage() {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from('leads')
    .select(PIPELINE_LEAD_COLUMNS)
    .eq('organization_id', context!.organization.id)
    .eq('kind', 'geral')
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(5000);

  return <>
    <PageTopbar title="Contatos gerais" subtitle="Números do WhatsApp que ainda não são clientes nem corretores" />
    <div className="page-content">
      <GeneralPipelineBoard
        initialLeads={toPipelineLeads(data)}
        organizationId={context!.organization.id}
        canEdit={context!.role !== 'viewer'}
      />
    </div>
  </>;
}
