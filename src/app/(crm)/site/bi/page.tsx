import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageTopbar } from '@/components/PageTopbar';
import { SiteBiWorkspace } from '@/components/SiteBiWorkspace';
import { getCurrentContext } from '@/lib/auth';
import { AMBIENTES_SITE, type AmbienteSite } from '@/lib/site-analytics';
import { configuracaoBi } from '@/lib/site-bi';

export default async function SiteBiPage({ searchParams }: { searchParams: Promise<{ dias?: string; ambiente?: string }> }) {
  const [context, params] = await Promise.all([getCurrentContext(), searchParams]);
  if (!context || context.role === 'viewer') redirect('/hoje');
  const dias = ['7', '30', '90', '365'].includes(params.dias ?? '') ? Number(params.dias) : 30;
  const ambiente = AMBIENTES_SITE.some((a) => a.k === params.ambiente) ? params.ambiente as AmbienteSite : 'oficial';
  return (
    <>
      <PageTopbar title="Análise de dados" subtitle="Site da Bossa · tabela dinâmica" actions={
        <Link href={`/site?dias=${dias}&ambiente=${ambiente}`} className="btn btn-ghost btn-sm">Voltar às estatísticas</Link>
      } />
      <SiteBiWorkspace initial={configuracaoBi(dias, ambiente)} />
    </>
  );
}
