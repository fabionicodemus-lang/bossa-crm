import Link from 'next/link';
import { PageTopbar } from '@/components/PageTopbar';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { displayPhone, formatDateTime } from '@/lib/format';
import type { Lead } from '@/lib/types';

interface AiLead extends Lead {
  messages: Array<{ body: string; created_at: string; direction: string }>;
}

export default async function AiPage() {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from('leads')
    .select('*, messages(body,created_at,direction)')
    .eq('organization_id', context!.organization.id)
    .eq('ai_enabled', true)
    .order('updated_at', { ascending: false });

  const contacts = (data ?? []) as unknown as AiLead[];
  const clients = contacts.filter((lead) => lead.kind === 'cliente');
  const brokers = contacts.filter((lead) => lead.kind === 'corretor');

  function cards(items: AiLead[], persona: 'Nara' | 'Plantão') {
    if (items.length === 0) return <section className="card"><div className="empty-state">Nenhum contato está sendo atendido por {persona} neste momento.</div></section>;
    return <div className="grid grid-3">{items.map((lead) => {
      const sorted = [...(lead.messages || [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const last = sorted.at(-1);
      return <Link href={`/leads/${lead.id}`} className="card" key={lead.id}><div className="card-head"><h3>{lead.name}</h3><span className="chip chip-orange">🤖 {persona}</span></div><div className="card-body"><div className="lead-sub">{lead.kind === 'cliente' ? lead.enterprise || 'Empreendimento não informado' : lead.company || 'Imobiliária não informada'}</div>{lead.ai_classification && <div className="chip" style={{ marginTop: 8 }}>{lead.ai_classification} · {lead.temperature}/100</div>}<p className="muted" style={{ lineHeight: 1.55 }}>{last?.body || 'Conversa ainda sem mensagens.'}</p><div className="faint" style={{ fontSize: 10 }}>{displayPhone(lead.phone)}{last ? ` · ${formatDateTime(last.created_at)}` : ''}</div></div></Link>;
    })}</div>;
  }

  return <><PageTopbar title="Atendimento IA" subtitle="Nara atende clientes finais e o Plantão atende corretores parceiros" /><div className="page-content"><div className="page-head"><div><h2>Conversas sob responsabilidade da IA</h2><p>Quando o comercial assume, ou o contato chega à etapa de negociação, a automação é pausada.</p></div></div><section style={{ marginBottom: 28 }}><div className="page-head"><div><h2>Nara · clientes</h2><p>Qualificação de compradores do Flow e do Alma.</p></div><Link href="/clientes" className="btn btn-ghost btn-sm">Abrir pipeline</Link></div>{cards(clients, 'Nara')}</section><section><div className="page-head"><div><h2>Plantão · corretores</h2><p>Atendimento e classificação de parceiros comerciais.</p></div><Link href="/corretores" className="btn btn-ghost btn-sm">Abrir pipeline</Link></div>{cards(brokers, 'Plantão')}</section></div></>;
}
