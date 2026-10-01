import { PageTopbar } from '@/components/PageTopbar';
import { WhatsAppBrokerInbox } from '@/components/WhatsAppBrokerInbox';
import { getCurrentContext } from '@/lib/auth';
import styles from '../mensagens-corretores/scrollFix.module.css';

export default async function AiPage() {
  await getCurrentContext();

  return <>
    <PageTopbar
      title="Atendimento IA"
      subtitle="Acompanhe as conversas que estão sob responsabilidade da Nara e do Plantão"
    />
    <div className={`page-content ${styles.scrollScope}`}>
      <WhatsAppBrokerInbox mode="ai" />
    </div>
  </>;
}
