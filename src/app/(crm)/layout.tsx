import { Suspense } from 'react';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/Sidebar';
import type { UserContext } from '@/lib/types';

// As contagens do menu (Atendimento IA e tarefas atrasadas) carregam em paralelo
// com a tela. Enquanto isso o menu aparece sem os números.
async function SidebarWithCounts({ context }: { context: UserContext }) {
  const supabase = await createClient();
  const orgId = context.organization.id;
  const now = new Date().toISOString();

  let overdueQuery = supabase
    .from('lead_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .in('status', ['pending', 'overdue'])
    .lt('due_at', now);
  if (context.role !== 'admin') overdueQuery = overdueQuery.eq('assigned_to', context.userId);

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

  return <Sidebar context={context} aiCount={aiCount ?? 0} overdueTaskCount={overdueTaskCount ?? 0} />;
}

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const context = await getCurrentContext();

  return (
    <main className="crm-shell">
      <Suspense fallback={<Sidebar context={context!} aiCount={0} overdueTaskCount={0} />}>
        <SidebarWithCounts context={context!} />
      </Suspense>
      <section className="crm-main">{children}</section>
    </main>
  );
}
