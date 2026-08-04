import { AlmaSalesTableImporter } from '@/components/AlmaSalesTableImporter';
import { PageTopbar } from '@/components/PageTopbar';
import {
  DevelopmentsManager,
  type Development,
  type DevelopmentFile,
  type DevelopmentTypology,
  type DevelopmentUnit,
} from '@/components/DevelopmentsManager';
import { DevelopmentLogosPanel, type DevelopmentLogoItem } from '@/components/DevelopmentLogosPanel';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export default async function DevelopmentsPage() {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const organizationId = context!.organization.id;
  const canEdit = context!.role !== 'viewer';

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
  const developmentRows = developmentsResult.data ?? [];
  const typologyRows = (typologiesResult.data ?? []) as DevelopmentTypology[];
  const unitRows = (unitsResult.data ?? []) as DevelopmentUnit[];

  return <>
    <PageTopbar title="Empreendimentos" subtitle="Cadastro, marcas, tipologias, materiais, estoque e condições comerciais" />
    {schemaError
      ? <div className="page-content"><div className="error-box">A estrutura deste módulo ainda não existe no Supabase. Execute as migrações 007 e 010 e atualize esta página.</div></div>
      : <>
          <DevelopmentLogosPanel
            organizationId={organizationId}
            canEdit={canEdit}
            initialDevelopments={developmentRows as DevelopmentLogoItem[]}
          />
          <div className="page-content" style={{ paddingBottom: 0 }}>
            <AlmaSalesTableImporter
              organizationId={organizationId}
              canEdit={canEdit}
              developments={developmentRows as Development[]}
              typologies={typologyRows}
              units={unitRows}
            />
          </div>
          <DevelopmentsManager
            organizationId={organizationId}
            canEdit={canEdit}
            initialDevelopments={developmentRows as Development[]}
            initialTypologies={typologyRows}
            initialUnits={unitRows}
            initialFiles={(filesResult.data ?? []) as DevelopmentFile[]}
          />
        </>}
  </>;
}
