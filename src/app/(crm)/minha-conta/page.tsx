import { PageTopbar } from '@/components/PageTopbar';
import { ChangeOwnPasswordForm } from '@/components/ChangeOwnPasswordForm';
import { getCurrentContext } from '@/lib/auth';

export default async function MyAccountPage() {
  const context = await getCurrentContext();

  return <>
    <PageTopbar title="Minha conta" subtitle="Dados de acesso e segurança da sua conta" />
    <div className="page-content">
      <div className="page-head">
        <div><h2>{context!.fullName}</h2><p>Altere sua própria senha diretamente pelo CRM.</p></div>
        <span className="chip">{context!.role}</span>
      </div>
      <section className="card" style={{ maxWidth: 760 }}>
        <div className="card-head"><h3>Alterar senha</h3><span className="chip chip-green">Sem confirmação por e-mail</span></div>
        <ChangeOwnPasswordForm email={context!.email} />
      </section>
    </div>
  </>;
}
