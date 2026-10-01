import { PageTopbar } from '@/components/PageTopbar';
import { WhatsAppBrokerInbox } from '@/components/WhatsAppBrokerInbox';
import { requireAdmin } from '@/lib/auth';
import styles from './scrollFix.module.css';

export default async function BrokerMessagesPage() {
  await requireAdmin();

  return <>
    <PageTopbar
      title="WhatsApp Comercial"
      subtitle="Caixa de entrada das conversas comerciais do WhatsApp"
    />
    <div className={`page-content ${styles.scrollScope}`}>
      <WhatsAppBrokerInbox />
    </div>
  </>;
}
