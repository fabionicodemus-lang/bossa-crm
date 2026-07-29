import { PageTopbar } from '@/components/PageTopbar';
import { PipelineBoard } from '@/components/PipelineBoard';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Lead } from '@/lib/types';

export default async function ClientsPage() {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const { data } = await supabase.from('leads').select('*').eq('organization_id', context!.organization.id).eq('kind', 'cliente').is('archived_at', null).order('updated_at', { ascending: false }).limit(5000);
  return <><PageTopbar title="Clientes finais" subtitle="Pipeline comercial e histórico unificado" /><div className="page-content"><PipelineBoard initialLeads={(data ?? []) as Lead[]} kind="cliente" organizationId={context!.organization.id} canEdit={context!.role !== 'viewer'} /></div></>;
}
