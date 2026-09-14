import { PageTopbar } from '@/components/PageTopbar';
import { WhatsAppBrokerInbox } from '@/components/WhatsAppBrokerInbox';
import { requireAdmin } from '@/lib/auth';
import styles from './scrollFix.module.css';

export default async function BrokerMessagesPage() {
  await requireAdmin();

  return <>
    <PageTopbar
      title="Mensagens WhatsApp · Corretores"
      subtitle="Acompanhe as conversas do número dos corretores em uma caixa de entrada única"
    />
    <div className={`page-content ${styles.scrollScope}`}>
      <WhatsAppBrokerInbox />
    </div>
  </>;
}
