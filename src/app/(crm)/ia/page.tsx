import Link from 'next/link';
import { PageTopbar } from '@/components/PageTopbar';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { displayPhone, formatDateTime } from '@/lib/format';
import { stageLabel } from '@/lib/stages';
import type { Lead } from '@/lib/types';

interface AiLead extends Lead {
  messages: Array<{ body: string; created_at: string; direction: string }>;
}

export default async function AiPage() {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const { data } = await supabase.from('leads')
    .select('*, messages(body,created_at,direction)')
    .eq('organization_id', context!.organization.id)
    .eq('owner_mode', 'ai')
    .eq('ai_enabled', true)
    .is('archived_at', null)
    .order('updated_at', { ascending: false });
  const contacts = (data ?? []) as unknown as AiLead[];
  const clients = contacts.filter((lead) => lead.kind === 'cliente');
  const brokers = contacts.filter((lead) => lead.kind === 'corretor');

  function cards(items: AiLead[], persona: 'Nara' | 'Plantão') {
    if (items.length === 0) return <section className="card"><div className="empty-state">Nenhum contato está sob responsabilidade de {persona} neste momento.</div></section>;
    return <div className="grid grid-3">{items.map((lead) => {
      const sorted = [...(lead.messages || [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const last = sorted.at(-1);
      return <Link href={`/leads/${lead.id}`} className="card" key={lead.id}>
        <div className="card-head"><h3>{lead.name}</h3><span className="chip chip-orange">🤖 {persona}</span></div>
        <div className="card-body">
          <div className="lead-sub">{lead.kind === 'cliente' ? lead.enterprise || 'Empreendimento não informado' : lead.company || 'Imobiliária não informada'}</div>
          <div className="lead-meta" style={{ marginTop: 8 }}>{lead.priority_class && <span className="chip chip-orange">{lead.priority_class}</span>}{lead.ai_classification && <span className="chip">{lead.ai_classification} · {lead.temperature}/100</span>}<span className="chip">{stageLabel(lead.kind, lead.stage)}</span></div>
          <p className="muted" style={{ lineHeight: 1.55 }}>{last?.body || 'Conversa ainda sem mensagens.'}</p>
          {lead.next_action && <p style={{ fontSize: 11 }}><strong>Próxima ação:</strong> {lead.next_action}</p>}
          <div className="faint" style={{ fontSize: 10 }}>{displayPhone(lead.phone)}{last ? ` · ${formatDateTime(last.created_at)}` : ''}</div>
        </div>
      </Link>;
    })}</div>;
  }

  return <>
    <PageTopbar title="Atendimento IA" subtitle="Nara e Plantão respondem, classificam e preparam a passagem para o humano" />
    <div className="page-content">
      <div className="page-head"><div><h2>Conversas sob responsabilidade da IA</h2><p>Após o aceite do consultor, a IA fica em silêncio, mas continua analisando classificação, notas e próxima ação.</p></div></div>
      <section style={{ marginBottom: 28 }}><div className="page-head"><div><h2>Nara · clientes</h2><p>Triagem, qualificação, nutrição e passagem para o comercial.</p></div><Link href="/clientes" className="btn btn-ghost btn-sm">Abrir pipeline</Link></div>{cards(clients, 'Nara')}</section>
      <section><div className="page-head"><div><h2>Plantão · corretores</h2><p>Classificação de relacionamento e identificação de cliente ativo.</p></div><Link href="/corretores" className="btn btn-ghost btn-sm">Abrir pipeline</Link></div>{cards(brokers, 'Plantão')}</section>
    </div>
  </>;
}
