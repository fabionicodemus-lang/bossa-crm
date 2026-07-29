import { PageTopbar } from '@/components/PageTopbar';
import {
  DevelopmentsManager,
  type Development,
  type DevelopmentFile,
  type DevelopmentTypology,
  type DevelopmentUnit,
} from '@/components/DevelopmentsManager';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export default async function DevelopmentsPage() {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const organizationId = context!.organization.id;

  const [developmentsResult, typologiesResult, unitsResult, filesResult] = await Promise.all([
    supabase.from('developments').select('*').eq('organization_id', organizationId).order('name'),
    supabase.from('development_typologies').select('*').eq('organization_id', organizationId).order('code'),
    supabase.from('development_units').select('*').eq('organization_id', organizationId)
      .order('floor', { ascending: false, nullsFirst: false }).order('unit_code'),
    supabase.from('development_files').select('*').eq('organization_id', organizationId)
      .order('created_at', { ascending: false }),
  ]);

  const schemaError = [developmentsResult.error, typologiesResult.error, unitsResult.error, filesResult.error]
    .find(Boolean);

  return <>
    <PageTopbar title="Empreendimentos" subtitle="Cadastro, tipologias, materiais, estoque e condições comerciais" />
    {schemaError
      ? <div className="page-content"><div className="error-box">A estrutura deste módulo ainda não existe no Supabase. Execute o arquivo 007_empreendimentos_estoque_propostas.sql e atualize esta página.</div></div>
      : <DevelopmentsManager
          organizationId={organizationId}
          canEdit={context!.role !== 'viewer'}
          initialDevelopments={(developmentsResult.data ?? []) as Development[]}
          initialTypologies={(typologiesResult.data ?? []) as DevelopmentTypology[]}
          initialUnits={(unitsResult.data ?? []) as DevelopmentUnit[]}
          initialFiles={(filesResult.data ?? []) as DevelopmentFile[]}
        />}
  </>;
}
