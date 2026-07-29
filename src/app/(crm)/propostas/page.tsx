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

export default async function ProposalsPage() {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const organizationId = context!.organization.id;

  const [proposalsResult, developmentsResult, unitsResult, leadsResult] = await Promise.all([
    supabase.from('proposals').select('*').eq('organization_id', organizationId).order('updated_at', { ascending: false }),
    supabase.from('developments').select('id,name,delivery_date,default_payment_plan').eq('organization_id', organizationId).eq('active', true).order('name'),
    supabase.from('development_units').select('id,development_id,unit_code,status,list_price,entry_amount,installment_count,installment_amount,reinforcement_count,reinforcement_amount,keys_amount,payment_plan').eq('organization_id', organizationId).order('floor', { ascending: false, nullsFirst: false }).order('unit_code'),
    supabase.from('leads').select('id,kind,name,phone,enterprise,company,group_name').eq('organization_id', organizationId).is('archived_at', null).order('name'),
  ]);

  const schemaError = [proposalsResult.error, developmentsResult.error, unitsResult.error, leadsResult.error].find(Boolean);

  return <>
    <PageTopbar title="Propostas" subtitle="Simulação, histórico por lead e planilha geral da operação comercial" />
    {schemaError
      ? <div className="page-content"><div className="error-box">A estrutura de propostas ou arquivamento ainda não está disponível no Supabase. Execute as migrações 007 e 008 e atualize esta página.</div></div>
      : <ProposalsManager
          organizationId={organizationId}
          currentUserId={context!.userId}
          currentUserName={context!.fullName}
          canEdit={context!.role !== 'viewer'}
          initialProposals={(proposalsResult.data ?? []) as Proposal[]}
          developments={(developmentsResult.data ?? []) as ProposalDevelopment[]}
          units={(unitsResult.data ?? []) as ProposalUnit[]}
          leads={(leadsResult.data ?? []) as ProposalLead[]}
        />}
  </>;
}
