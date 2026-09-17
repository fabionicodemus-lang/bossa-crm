import { PageTopbar } from '@/components/PageTopbar';
import { ChangeOwnNameForm } from '@/components/ChangeOwnNameForm';
import { ChangeOwnPasswordForm } from '@/components/ChangeOwnPasswordForm';
import { getCurrentContext } from '@/lib/auth';

export default async function MyAccountPage() {
  const context = await getCurrentContext();

  return <>
    <PageTopbar title="Minha conta" subtitle="Nome de usuário, dados de acesso e segurança da sua conta" />
    <div className="page-content">
      <div className="page-head">
        <div><h2>{context!.fullName}</h2><p>Atualize seu nome de exibição ou altere sua senha diretamente pelo CRM.</p></div>
        <span className="chip">{context!.role}</span>
      </div>
      <section className="card" style={{ maxWidth: 760, marginBottom: 16 }}>
        <div className="card-head"><h3>Nome do usuário</h3><span className="chip chip-green">Editável por você</span></div>
        <ChangeOwnNameForm initialName={context!.fullName} />
      </section>
      <section className="card" style={{ maxWidth: 760 }}>
        <div className="card-head"><h3>Alterar senha</h3><span className="chip chip-green">Sem confirmação por e-mail</span></div>
        <ChangeOwnPasswordForm email={context!.email} />
      </section>
    </div>
  </>;
}
