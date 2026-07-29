import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/Sidebar';

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const { count } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', context!.organization.id)
    .eq('kind', 'cliente')
    .eq('stage', 'ia')
    .eq('ai_enabled', true)
    .is('archived_at', null);

  return <main className="crm-shell"><Sidebar context={context!} aiCount={count ?? 0} /><section className="crm-main">{children}</section></main>;
}
