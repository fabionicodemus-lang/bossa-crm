import { redirect } from 'next/navigation';
import { PageTopbar } from '@/components/PageTopbar';
import { NaraFunnelPanel } from '@/components/NaraFunnelPanel';
import { getCurrentContext } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function NaraFunnelPage() {
  const context = await getCurrentContext();
  if (!context) redirect('/login');
  if (context.role === 'viewer') redirect('/hoje');
  const today = new Date(new Date().getTime() - 3 * 3600000);
  const initialTo = today.toISOString().slice(0, 10);
  const initialFrom = new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10);
  return <>
    <PageTopbar title="Funil explícito da Nara" subtitle="Contatos e eventos observados, com cobertura e limites transparentes" />
    <NaraFunnelPanel initialFrom={initialFrom} initialTo={initialTo} />
  </>;
}
