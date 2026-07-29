import { PageTopbar } from '@/components/PageTopbar';
import { PipelineBoard } from '@/components/PipelineBoard';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Lead } from '@/lib/types';

export default async function BrokersPage() {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const { data } = await supabase.from('leads').select('*').eq('organization_id', context!.organization.id).eq('kind', 'corretor').is('archived_at', null).order('updated_at', { ascending: false }).limit(5000);
  return <><PageTopbar title="Corretores" subtitle="Relacionamento com imobiliárias e parceiros" /><div className="page-content"><PipelineBoard initialLeads={(data ?? []) as Lead[]} kind="corretor" organizationId={context!.organization.id} canEdit={context!.role !== 'viewer'} /></div></>;
}
