import Link from 'next/link';
import { PageTopbar } from '@/components/PageTopbar';
import { BrowserCampaignManager } from '@/components/BrowserCampaignManager';
import { getCurrentContext } from '@/lib/auth';

export default async function BrowserCampaignsPage() {
  const context = await getCurrentContext();
  return <>
    <PageTopbar title="Transmissão pelo navegador" subtitle="WhatsApp Web aberto no Chrome ou Edge • fila compartilhada • revisão por operador" />
    <div className="page-content" style={{ paddingBottom: 0 }}>
      <Link href="/transmissoes" style={{ color: 'var(--primary, #b67b3e)', fontSize: 13 }}>← Transmissões tradicionais</Link>
    </div>
    <BrowserCampaignManager organizationId={context!.organization.id} canEdit={context!.role !== 'viewer'} />
  </>;
}
