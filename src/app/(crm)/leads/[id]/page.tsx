import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageTopbar } from '@/components/PageTopbar';
import { LeadDetail } from '@/components/LeadDetail';
import { LeadLifecycleActions } from '@/components/LeadLifecycleActions';
import { stages as commercialStages } from '@/lib/commercial/model';
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
    const email = profile?.email || '';
    const displayName = email.toLowerCase() === 'contato@bossaempreendimentos.com.br'
      ? 'Cíntia'
      : profile?.full_name || 'Usuário';
    return { user_id: item.user_id, role: item.role, full_name: displayName, email };
  });

  const backPath = lead.archived_at
    ? '/arquivados'
    : lead.kind === 'cliente'
      ? '/clientes'
      : lead.kind === 'corretor'
        ? '/corretores'
        : '/geral';
  const subtitle = lead.archived_at
    ? 'Lead arquivado · histórico preservado'
    : lead.kind === 'cliente'
      ? 'Atendimento híbrido, WhatsApp, tarefas e histórico'
      : lead.kind === 'corretor'
        ? 'Relacionamento híbrido com corretor, tarefas e histórico'
        : 'Contato geral do WhatsApp · sem automação de IA';
  // The new ledger may not have been deployed yet: leave the legacy detail available.
  const { data: opportunities, error: opportunityError } = lead.kind === 'cliente'
    ? await supabase.from('commercial_opportunities')
        .select('id,title,stage,next_action,created_at')
        .eq('organization_id', orgId)
        .eq('primary_contact_id', id)
        .order('created_at', { ascending: false })
        .limit(12)
    : { data: null, error: null };
  const actions = <>
    <LeadLifecycleActions leadId={lead.id} leadName={lead.name} leadKind={lead.kind} role={context!.role} archivedAt={lead.archived_at ?? null} />
    <Link className="btn btn-ghost btn-sm" href={backPath}>← Voltar</Link>
  </>;

  return <>
    <PageTopbar title={lead.name} subtitle={subtitle} actions={actions} />
    <div className="page-content">
      {lead.archived_at && <div className="info-box"><strong>Este lead está arquivado.</strong> Ele não aparece nas pipelines e não pode receber novas ações até ser restaurado.</div>}
      {lead.kind === 'cliente' && !opportunityError && (
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <h3>Oportunidades de compra</h3>
            {context!.role !== 'viewer' && !lead.archived_at && (
              <Link
                className="btn btn-primary btn-sm"
                href={`/gestao/nova?lead_id=${encodeURIComponent(lead.id)}`}
              >
                Nova oportunidade
              </Link>
            )}
          </div>
          <div className="card-body">
            {opportunities?.length
              ? opportunities.map((op) => (
                <p key={op.id}>
                  <Link href={`/gestao/oportunidades/${op.id}`}>{op.title}</Link>
                  {' · '}
                  {commercialStages[op.stage as keyof typeof commercialStages] ?? op.stage}
                  {' · próxima ação: '}
                  {op.next_action || 'não definida'}
                </p>
              ))
              : <p>Nenhuma intenção de compra registrada na nova Gestão.</p>}
            <small>
              A mesma pessoa pode ter mais de uma compra independente. Consultas
              a dois empreendimentos na mesma negociação ficam em uma oportunidade.
            </small>
          </div>
        </section>
      )}
      <LeadDetail initialLead={lead} initialMessages={(messages ?? []) as Message[]} initialActivities={(activities ?? []) as Activity[]} initialTasks={(tasks ?? []) as LeadTask[]} teamMembers={teamMembers} whatsappConnected={(connections ?? 0) > 0} canEdit={context!.role !== 'viewer' && !lead.archived_at} />
    </div>
  </>;
}
