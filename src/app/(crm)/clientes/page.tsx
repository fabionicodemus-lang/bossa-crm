import { PageTopbar } from '@/components/PageTopbar';
import { PipelineBoard } from '@/components/PipelineBoard';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PIPELINE_LEAD_COLUMNS, toPipelineLeads } from '@/lib/pipeline-lead-select';

export default async function ClientsPage() {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const { data } = await supabase.from('leads').select(PIPELINE_LEAD_COLUMNS).eq('organization_id', context!.organization.id).eq('kind', 'cliente').is('archived_at', null).order('updated_at', { ascending: false }).limit(5000);
  return <><PageTopbar title="Clientes finais" subtitle="Pipeline comercial e histórico unificado" /><div className="page-content"><PipelineBoard initialLeads={toPipelineLeads(data)} kind="cliente" organizationId={context!.organization.id} canEdit={context!.role !== 'viewer'} /></div></>;
}
