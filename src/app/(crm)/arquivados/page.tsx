import Link from 'next/link';
import { PageTopbar } from '@/components/PageTopbar';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { displayPhone, formatDateTime } from '@/lib/format';
import type { Lead } from '@/lib/types';

export default async function ArchivedLeadsPage() {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('organization_id', context!.organization.id)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
    .limit(5000);

  const leads = (data ?? []) as Lead[];

  return <>
    <PageTopbar title="Leads arquivados" subtitle="Contatos retirados das pipelines, com histórico preservado" actions={<div className="page-actions"><Link className="btn btn-ghost btn-sm" href="/clientes">Clientes</Link><Link className="btn btn-ghost btn-sm" href="/corretores">Corretores</Link></div>} />
    <div className="page-content">
      {error ? <div className="error-box">A estrutura de arquivamento ainda não existe no Supabase. Execute a migração 008_arquivamento_exclusao_leads.sql e atualize esta página.</div> : <section className="card">
        <div className="card-head"><h3>Arquivo geral</h3><span className="chip">{leads.length} contato{leads.length === 1 ? '' : 's'}</span></div>
        <div className="card-body">
          <div className="table-wrap"><table><thead><tr><th>Contato</th><th>Tipo</th><th>Empreendimento / imobiliária</th><th>Motivo</th><th>Arquivado em</th><th></th></tr></thead><tbody>
            {leads.length === 0 && <tr><td colSpan={6}><div className="empty-state">Nenhum lead arquivado.</div></td></tr>}
            {leads.map((lead) => <tr key={lead.id}>
              <td><strong>{lead.name}</strong><br /><small className="faint">{displayPhone(lead.phone)}{lead.email ? ` · ${lead.email}` : ''}</small></td>
              <td><span className="chip">{lead.kind === 'cliente' ? 'Cliente' : 'Corretor'}</span></td>
              <td>{lead.kind === 'cliente' ? lead.enterprise || '—' : lead.company || '—'}</td>
              <td>{lead.archived_reason || 'Não informado'}</td>
              <td>{lead.archived_at ? formatDateTime(lead.archived_at) : '—'}</td>
              <td><Link className="btn btn-ghost btn-sm" href={`/leads/${lead.id}`}>Abrir</Link></td>
            </tr>)}
          </tbody></table></div>
        </div>
      </section>}
    </div>
  </>;
}
