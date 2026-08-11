import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/Sidebar';

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const orgId = context!.organization.id;
  const now = new Date().toISOString();

  let overdueQuery = supabase
    .from('lead_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .in('status', ['pending', 'overdue'])
    .lt('due_at', now);
  if (context!.role !== 'admin') overdueQuery = overdueQuery.eq('assigned_to', context!.userId);

  const [{ count: aiCount }, { count: overdueTaskCount }] = await Promise.all([
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('kind', 'cliente')
      .eq('stage', 'ia')
      .eq('ai_enabled', true)
      .is('archived_at', null),
    overdueQuery,
  ]);

  return <main className="crm-shell"><Sidebar context={context!} aiCount={aiCount ?? 0} overdueTaskCount={overdueTaskCount ?? 0} /><section className="crm-main">{children}</section></main>;
}
