import { redirect } from 'next/navigation';
import { PageTopbar } from '@/components/PageTopbar';
import { Importer } from '@/components/Importer';
import type { LeadKind } from '@/lib/types';
import { getCurrentContext } from '@/lib/auth';

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const context = await getCurrentContext();
  if (context!.role === 'viewer') redirect('/dashboard');
  const params = await searchParams;
  const kind: LeadKind = params.tipo === 'corretor' ? 'corretor' : 'cliente';
  return <><PageTopbar title="Importar XLSX" subtitle="Leve os registros do Kommo para as duas pipelines" /><div className="page-content"><div className="page-head"><div><h2>Importador de clientes e corretores</h2><p>A planilha pode conter as duas pipelines no mesmo arquivo.</p></div></div><Importer defaultKind={kind} /></div></>;
}
