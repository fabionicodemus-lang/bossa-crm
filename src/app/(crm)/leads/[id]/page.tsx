import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageTopbar } from '@/components/PageTopbar';
import { LeadDetail } from '@/components/LeadDetail';
import { LeadLifecycleActions } from '@/components/LeadLifecycleActions';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Activity, AppRole, Lead, LeadTask, Message, TeamMember } from '@/lib/types';

type MembershipRow = {
  user_id: string;
  role: AppRole;
  profiles: { full_name: string; email: string } | Array<{ full_name: string; email: string }> | null;
};

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getCurrentContext();
  const supabase = await createClient();
  const orgId = context!.organization.id;
  const { data: leadData } = await supabase.from('leads').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle();
  if (!leadData) notFound();
  const lead = leadData as Lead;
  const channel = lead.kind === 'cliente' ? 'clientes' : 'corretores';
  const admin = createAdminClient();
  const [{ data: messages }, { data: activities }, { data: tasks }, { data: memberships }, { count: connections }] = await Promise.all([
    supabase.from('messages').select('*').eq('lead_id', id).order('created_at', { ascending: true }).limit(1000),
    supabase.from('activities').select('*').eq('lead_id', id).order('created_at', { ascending: false }).limit(500),
    supabase.from('lead_tasks').select('*').eq('lead_id', id).order('status').order('due_at', { ascending: true, nullsFirst: false }).limit(500),
    supabase.from('memberships').select('user_id,role,profiles(full_name,email)').eq('organization_id', orgId).order('created_at'),
    admin.from('whatsapp_connections').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('channel', channel).eq('status', 'connected'),
  ]);

  const teamMembers: TeamMember[] = ((memberships ?? []) as MembershipRow[]).map((item) => {
    const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
    return { user_id: item.user_id, role: item.role, full_name: profile?.full_name || 'Usuário', email: profile?.email || '' };
  });

  const backPath = lead.archived_at ? '/arquivados' : lead.kind === 'cliente' ? '/clientes' : '/corretores';
  const actions = <>
    <LeadLifecycleActions leadId={lead.id} leadName={lead.name} leadKind={lead.kind} role={context!.role} archivedAt={lead.archived_at ?? null} />
    <Link className="btn btn-ghost btn-sm" href={backPath}>← Voltar</Link>
  </>;

  return <>
    <PageTopbar title={lead.name} subtitle={lead.archived_at ? 'Lead arquivado · histórico preservado' : lead.kind === 'cliente' ? 'Atendimento híbrido, WhatsApp, tarefas e histórico' : 'Relacionamento híbrido com corretor, tarefas e histórico'} actions={actions} />
    <div className="page-content">
      {lead.archived_at && <div className="info-box"><strong>Este lead está arquivado.</strong> Ele não aparece nas pipelines e não pode receber novas ações até ser restaurado.</div>}
      <LeadDetail initialLead={lead} initialMessages={(messages ?? []) as Message[]} initialActivities={(activities ?? []) as Activity[]} initialTasks={(tasks ?? []) as LeadTask[]} teamMembers={teamMembers} whatsappConnected={(connections ?? 0) > 0} canEdit={context!.role !== 'viewer' && !lead.archived_at} />
    </div>
  </>;
}
