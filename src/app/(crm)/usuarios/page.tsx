import { PageTopbar } from '@/components/PageTopbar';
import { InviteUserForm } from '@/components/InviteUserForm';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/format';
import { UsersTable, type MembershipItem } from '@/components/UsersTable';

type MembershipQueryRow = Omit<MembershipItem, 'profiles'> & {
  profiles: MembershipItem['profiles'] | MembershipItem['profiles'][];
};

export default async function UsersPage() {
  const context = await requireAdmin();
  const supabase = await createClient();
  const [{ data: memberships }, { data: invites }] = await Promise.all([
    supabase.from('memberships').select('id,user_id,role,created_at,profiles(full_name,email)').eq('organization_id', context.organization.id).order('created_at'),
    supabase.from('pending_invites').select('id,email,role,created_at,accepted_at').eq('organization_id', context.organization.id).is('accepted_at', null).order('created_at', { ascending: false }),
  ]);

  const normalizedMemberships: MembershipItem[] = ((memberships ?? []) as MembershipQueryRow[]).map((item) => {
    const profile = Array.isArray(item.profiles) ? (item.profiles[0] ?? null) : (item.profiles ?? null);

    return {
      id: item.id,
      user_id: item.user_id,
      role: item.role,
      created_at: item.created_at,
      profiles: profile,
    };
  });

  return <><PageTopbar title="Usuários" subtitle="Cadastros, convites e permissões de acesso" /><div className="page-content"><div className="grid grid-2"><section className="card"><div className="card-head"><h3>Convidar novo usuário</h3></div><div className="card-body"><InviteUserForm /><div className="info-box">O convidado recebe um e-mail para definir a própria senha. Nunca compartilhe uma senha única entre várias pessoas.</div></div></section><section className="card"><div className="card-head"><h3>Perfis de acesso</h3></div><div className="card-body info-list"><div className="info-row"><span>Admin</span><strong>Usuários, integrações e todos os dados</strong></div><div className="info-row"><span>Comercial</span><strong>Pipelines, conversas e importação</strong></div><div className="info-row"><span>Leitura</span><strong>Consulta sem alterações</strong></div></div></section></div><section className="card" style={{ marginTop: 14 }}><div className="card-head"><h3>Usuários ativos</h3></div><UsersTable initialItems={normalizedMemberships} currentUserId={context.userId} /></section>{(invites ?? []).length > 0 && <section className="card" style={{ marginTop: 14 }}><div className="card-head"><h3>Convites pendentes</h3></div><div className="table-wrap"><table><thead><tr><th>E-mail</th><th>Permissão</th><th>Enviado</th></tr></thead><tbody>{invites!.map((item) => <tr key={item.id}><td>{item.email}</td><td>{item.role}</td><td>{formatDateTime(item.created_at)}</td></tr>)}</tbody></table></div></section>}</div></>;
}
