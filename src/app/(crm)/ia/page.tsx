import Link from 'next/link';
import { PageTopbar } from '@/components/PageTopbar';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { displayPhone, formatDateTime } from '@/lib/format';
import type { Lead } from '@/lib/types';

export default async function AiPage() {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from('leads')
    .select('*, messages(body,created_at,direction)')
    .eq('organization_id', context!.organization.id)
    .eq('kind', 'cliente')
    .eq('stage', 'ia')
    .eq('ai_enabled', true)
    .order('updated_at', { ascending: false });

  const leads = (data ?? []) as Array<Lead & { messages: Array<{ body: string; created_at: string; direction: string }> }>;

  return <><PageTopbar title="Atendimento IA" subtitle="Somente clientes que estão atualmente em atendimento pela Nara" /><div className="page-content"><div className="page-head"><div><h2>Conversas sob responsabilidade da IA</h2><p>Leads qualificados, em negociação ou fechados não aparecem aqui.</p></div><Link href="/clientes" className="btn btn-ghost btn-sm">Abrir pipeline</Link></div>{leads.length === 0 ? <section className="card"><div className="empty-state">Nenhum cliente está sendo atendido pela IA neste momento.</div></section> : <div className="grid grid-3">{leads.map((lead) => {
    const sorted = [...(lead.messages || [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const last = sorted.at(-1);
    return <Link href={`/leads/${lead.id}`} className="card" key={lead.id}><div className="card-head"><h3>{lead.name}</h3><span className="chip chip-orange">🤖 IA ativa</span></div><div className="card-body"><div className="lead-sub">{lead.enterprise || 'Empreendimento não informado'}</div><p className="muted" style={{ lineHeight: 1.55 }}>{last?.body || 'Conversa ainda sem mensagens.'}</p><div className="faint" style={{ fontSize: 10 }}>{displayPhone(lead.phone)}{last ? ` · ${formatDateTime(last.created_at)}` : ''}</div></div></Link>;
  })}</div>}</div></>;
}
