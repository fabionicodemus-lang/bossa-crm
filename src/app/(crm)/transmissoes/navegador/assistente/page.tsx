import { ChatGPTCampaignRunner } from '@/components/ChatGPTCampaignRunner';
import { PageTopbar } from '@/components/PageTopbar';
import { getCurrentContext } from '@/lib/auth';

export const metadata = { title: 'Execução com ChatGPT | Bossa CRM' };

export default async function ChatGPTCampaignPage() {
  const context = await getCurrentContext();
  return <>
    <PageTopbar title="Transmissão com ChatGPT" subtitle="WhatsApp Web · acompanhamento passo a passo · mesma fila do Bossa CRM" />
    <ChatGPTCampaignRunner canEdit={context!.role !== 'viewer'} />
  </>;
}
