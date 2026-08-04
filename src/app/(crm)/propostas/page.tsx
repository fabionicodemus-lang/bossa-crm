import { PageTopbar } from '@/components/PageTopbar';
import {
  ProposalsManager,
  type Proposal,
  type ProposalDevelopment,
  type ProposalLead,
  type ProposalUnit,
} from '@/components/ProposalsManager';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const PROPOSAL_LEADS_LIMIT_PER_KIND = 5000;

export default async function ProposalsPage() {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const organizationId = context!.organization.id;

  const [proposalsResult, developmentsResult, unitsResult, clientsResult, brokersResult] = await Promise.all([
    supabase.from('proposals').select('*').eq('organization_id', organizationId).order('updated_at', { ascending: false }),
    supabase.from('developments').select('id,name,delivery_date,logo_path,default_payment_plan').eq('organization_id', organizationId).eq('active', true).order('name'),
    supabase.from('development_units').select('id,development_id,unit_code,status,list_price,entry_amount,installment_count,installment_amount,reinforcement_count,reinforcement_amount,keys_amount,payment_plan').eq('organization_id', organizationId).order('floor', { ascending: false, nullsFirst: false }).order('unit_code'),
    supabase.from('leads').select('id,kind,name,phone,enterprise,company,group_name').eq('organization_id', organizationId).eq('kind', 'cliente').is('archived_at', null).order('name').limit(PROPOSAL_LEADS_LIMIT_PER_KIND),
    supabase.from('leads').select('id,kind,name,phone,enterprise,company,group_name').eq('organization_id', organizationId).eq('kind', 'corretor').is('archived_at', null).order('name').limit(PROPOSAL_LEADS_LIMIT_PER_KIND),
  ]);

  const schemaError = [
    proposalsResult.error,
    developmentsResult.error,
    unitsResult.error,
    clientsResult.error,
    brokersResult.error,
  ].find(Boolean);
  const leads = [...(clientsResult.data ?? []), ...(brokersResult.data ?? [])]
    .sort((first, second) => first.name.localeCompare(second.name, 'pt-BR')) as ProposalLead[];

  return <>
    <PageTopbar title="Propostas" subtitle="Simulação por datas, histórico por lead, PDF e planilha geral da operação comercial" />
    {schemaError
      ? <div className="page-content"><div className="error-box">A estrutura de propostas precisa das migrações 007, 008 e 010. Execute as migrações pendentes no Supabase e atualize esta página.</div></div>
      : <ProposalsManager
          organizationId={organizationId}
          currentUserId={context!.userId}
          currentUserName={context!.fullName}
          canEdit={context!.role !== 'viewer'}
          initialProposals={(proposalsResult.data ?? []) as Proposal[]}
          developments={(developmentsResult.data ?? []) as ProposalDevelopment[]}
          units={(unitsResult.data ?? []) as ProposalUnit[]}
          leads={leads}
        />}
  </>;
}
