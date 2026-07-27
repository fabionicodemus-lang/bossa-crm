import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageTopbar } from '@/components/PageTopbar';
import { LeadDetail } from '@/components/LeadDetail';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Activity, Lead, Message } from '@/lib/types';

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
  const [{ data: messages }, { data: activities }, { count: connections }] = await Promise.all([
    supabase.from('messages').select('*').eq('lead_id', id).order('created_at', { ascending: true }).limit(1000),
    supabase.from('activities').select('*').eq('lead_id', id).order('created_at', { ascending: false }).limit(500),
    admin.from('whatsapp_connections').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('channel', channel).eq('status', 'connected'),
  ]);

  return <><PageTopbar title={lead.name} subtitle={lead.kind === 'cliente' ? 'Ficha do cliente, WhatsApp e histórico completo' : 'Ficha do corretor, WhatsApp e relacionamento'} actions={<Link className="btn btn-ghost btn-sm" href={lead.kind === 'cliente' ? '/clientes' : '/corretores'}>← Voltar à pipeline</Link>} /><div className="page-content"><LeadDetail initialLead={lead} initialMessages={(messages ?? []) as Message[]} initialActivities={(activities ?? []) as Activity[]} whatsappConnected={(connections ?? 0) > 0} canEdit={context!.role !== 'viewer'} /></div></>;
}
