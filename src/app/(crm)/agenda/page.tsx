import { AgendaCalendar } from '@/components/AgendaCalendar';
import { MicrosoftCalendarPanel } from '@/components/MicrosoftCalendarPanel';
import { PageTopbar } from '@/components/PageTopbar';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/types';

type MembershipRow = {
  user_id: string;
  role: AppRole;
  profiles: { full_name: string; email: string } | Array<{ full_name: string; email: string }> | null;
};

export default async function AgendaPage() {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from('memberships')
    .select('user_id,role,profiles(full_name,email)')
    .eq('organization_id', context!.organization.id)
    .order('created_at');
  const members = ((memberships ?? []) as MembershipRow[]).map((item) => {
    const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
    return { user_id: item.user_id, full_name: profile?.full_name || 'Usuário', email: profile?.email || '', role: item.role };
  });
  const canEdit = ['admin', 'comercial'].includes(context!.role);
  return <>
    <PageTopbar title="Agenda" subtitle="Reuniões, apresentações, visitas, ligações e tarefas da equipe — inclusive as marcadas pela Nara e pelo Plantão." />
    <div className="page-content">
      <MicrosoftCalendarPanel canEdit={canEdit} />
      <AgendaCalendar members={members} currentUserId={context!.userId} canEdit={canEdit} />
    </div>
  </>;
}
