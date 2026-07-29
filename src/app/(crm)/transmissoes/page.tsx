import { PageTopbar } from '@/components/PageTopbar';
import { BroadcastsManager, type Broadcast, type BroadcastConnection, type BroadcastTemplate } from '@/components/BroadcastsManager';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

type StageCountRow = {
  kind: 'cliente' | 'corretor';
  stage: string;
  phone: string | null;
  opt_out: boolean | null;
  automation_paused: boolean | null;
};

export default async function BroadcastsPage() {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const organizationId = context!.organization.id;

  const [broadcastsResult, templatesResult, connectionsResult, leadsResult] = await Promise.all([
    supabase.from('broadcasts').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(500),
    supabase.from('whatsapp_templates').select('*').eq('organization_id', organizationId).order('status').order('name'),
    supabase.from('whatsapp_connections').select('id,channel,display_phone_number,verified_name,quality_rating,status').eq('organization_id', organizationId).order('channel'),
    supabase.from('leads').select('kind,stage,phone,opt_out,automation_paused').eq('organization_id', organizationId).is('archived_at', null).limit(10000),
  ]);

  const schemaError = [broadcastsResult.error, templatesResult.error].find(Boolean);
  const stageCounts: Record<string, { total: number; eligible: number }> = {};
  for (const lead of (leadsResult.data ?? []) as StageCountRow[]) {
    const key = `${lead.kind}:${lead.stage}`;
    const current = stageCounts[key] ?? { total: 0, eligible: 0 };
    current.total++;
    if (lead.phone && !lead.opt_out && !lead.automation_paused) current.eligible++;
    stageCounts[key] = current;
  }

  return <>
    <PageTopbar title="Transmissões" subtitle="Campanhas segmentadas com modelos aprovados pela Meta e acompanhamento de entrega" />
    {schemaError
      ? <div className="page-content"><div className="error-box">A estrutura de transmissões ainda não está disponível no Supabase. Execute a migração 009_transmissoes_whatsapp.sql e atualize esta página.</div></div>
      : <BroadcastsManager
          organizationId={organizationId}
          canEdit={context!.role !== 'viewer'}
          initialBroadcasts={(broadcastsResult.data ?? []) as Broadcast[]}
          initialTemplates={(templatesResult.data ?? []) as BroadcastTemplate[]}
          connections={(connectionsResult.data ?? []) as BroadcastConnection[]}
          stageCounts={stageCounts}
        />}
  </>;
}
