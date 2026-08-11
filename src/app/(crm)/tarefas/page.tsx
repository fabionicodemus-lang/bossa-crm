import { PageTopbar } from '@/components/PageTopbar';
import { TasksManager, type TaskListItem } from '@/components/TasksManager';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/types';

type MembershipRow = {
  user_id: string;
  role: AppRole;
  profiles: { full_name: string; email: string } | Array<{ full_name: string; email: string }> | null;
};

type TaskLeadRow = {
  id: string;
  name: string;
  kind: 'cliente' | 'corretor';
};

type TaskQueryRow = Omit<TaskListItem, 'lead'> & {
  leads: TaskLeadRow | TaskLeadRow[] | null;
};

function statusFromQuery(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'vencidas') return 'overdue' as const;
  if (raw === 'pendentes') return 'pending' as const;
  if (raw === 'concluidas') return 'completed' as const;
  if (raw === 'canceladas') return 'cancelled' as const;
  if (raw === 'todas') return 'all' as const;
  return 'open' as const;
}

function assigneeModeFromQuery(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'minhas') return 'mine' as const;
  return 'all' as const;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const params = await searchParams;
  const orgId = context!.organization.id;
  const isAdmin = context!.role === 'admin';

  let tasksQuery = supabase
    .from('lead_tasks')
    .select('*,leads(id,name,kind)')
    .eq('organization_id', orgId)
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1000);

  if (!isAdmin) tasksQuery = tasksQuery.eq('assigned_to', context!.userId);

  const [{ data: tasksData }, { data: memberships }] = await Promise.all([
    tasksQuery,
    supabase
      .from('memberships')
      .select('user_id,role,profiles(full_name,email)')
      .eq('organization_id', orgId)
      .order('created_at'),
  ]);

  const tasks: TaskListItem[] = ((tasksData ?? []) as TaskQueryRow[]).map((task) => {
    const relatedLead = Array.isArray(task.leads) ? (task.leads[0] ?? null) : task.leads;
    const { leads: _leads, ...base } = task;
    return { ...base, lead: relatedLead } as TaskListItem;
  });

  const members = ((memberships ?? []) as MembershipRow[]).map((item) => {
    const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
    return {
      user_id: item.user_id,
      full_name: profile?.full_name || 'Usuário',
      email: profile?.email || '',
    };
  });

  return <>
    <PageTopbar
      title="Tarefas"
      subtitle={isAdmin
        ? 'Acompanhe suas tarefas, as da equipe e as ações ainda sob responsabilidade da IA.'
        : 'Veja seus prazos, abra o lead e conclua as próximas ações do atendimento.'}
    />
    <div className="page-content">
      <TasksManager
        initialTasks={tasks}
        members={members}
        currentUserId={context!.userId}
        isAdmin={isAdmin}
        referenceNow={new Date().toISOString()}
        initialStatus={statusFromQuery(params.status)}
        initialAssigneeMode={assigneeModeFromQuery(params.responsavel)}
      />
    </div>
  </>;
}
