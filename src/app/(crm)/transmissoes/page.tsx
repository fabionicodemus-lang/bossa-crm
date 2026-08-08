import { PageTopbar } from '@/components/PageTopbar';
import type { Broadcast, BroadcastConnection } from '@/components/BroadcastsManager';
import type { MetaTemplateRow } from '@/components/MetaTemplatesManager';
import { BroadcastsWorkspace } from '@/components/BroadcastsWorkspace';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

type StageCountRow = {
  kind: 'cliente' | 'corretor';
  stage: string;
  phone: string | null;
  opt_out: boolean | null;
  automation_paused: boolean | null;
};

type BroadcastMessageRow = {
  status: string | null;
  raw_payload: Record<string, unknown> | null;
};

export default async function BroadcastsPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const { aba } = await searchParams;
  const context = await getCurrentContext();
  const supabase = await createClient();
  const organizationId = context!.organization.id;

  const [broadcastsResult, templatesResult, connectionsResult, leadsResult, messagesResult] = await Promise.all([
    supabase.from('broadcasts').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(500),
    supabase.from('whatsapp_templates').select('*').eq('organization_id', organizationId).order('status').order('name'),
    supabase.from('whatsapp_connections').select('id,channel,display_phone_number,verified_name,quality_rating,status').eq('organization_id', organizationId).order('channel'),
    supabase.from('leads').select('kind,stage,phone,opt_out,automation_paused').eq('organization_id', organizationId).is('archived_at', null).limit(10000),
    supabase.from('messages').select('status,raw_payload').eq('organization_id', organizationId).eq('direction', 'out').limit(20000),
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

  const deliveryCounts: Record<string, { sent: number; delivered: number; read: number }> = {};
  for (const message of (messagesResult.data ?? []) as BroadcastMessageRow[]) {
    const broadcastId = String(message.raw_payload?.broadcast_id ?? '');
    if (!broadcastId) continue;
    const current = deliveryCounts[broadcastId] ?? { sent: 0, delivered: 0, read: 0 };
    if (message.status === 'read') current.read++;
    else if (message.status === 'delivered') current.delivered++;
    else if (message.status === 'sent') current.sent++;
    deliveryCounts[broadcastId] = current;
  }

  const broadcasts = ((broadcastsResult.data ?? []) as Broadcast[]).map((broadcast) => {
    const delivery = deliveryCounts[broadcast.id];
    return delivery ? {
      ...broadcast,
      sent_count: delivery.sent,
      delivered_count: delivery.delivered,
      read_count: delivery.read,
    } : broadcast;
  });

  const initialTab = aba === 'modelos' ? 'modelos' : 'campanhas';

  return <>
    <PageTopbar title="Transmissões" subtitle="Modelos aprovados pela Meta, campanhas segmentadas e acompanhamento de entrega" />
    {schemaError
      ? <div className="page-content"><div className="error-box">A estrutura de transmissões ainda não está disponível no Supabase. Execute a migração 009_transmissoes_whatsapp.sql e atualize esta página.</div></div>
      : <BroadcastsWorkspace
          organizationId={organizationId}
          canEdit={context!.role !== 'viewer'}
          initialTab={initialTab}
          initialBroadcasts={broadcasts}
          initialTemplates={(templatesResult.data ?? []) as MetaTemplateRow[]}
          connections={(connectionsResult.data ?? []) as BroadcastConnection[]}
          stageCounts={stageCounts}
        />}
  </>;
}
