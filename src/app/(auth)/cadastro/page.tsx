import { redirect } from 'next/navigation';
import { SignupForm } from '@/components/SignupForm';

export default function SignupPage() {
  if (process.env.NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP === 'false') redirect('/login');
  return <div className="auth-card"><h2>Criar usuário</h2><p className="intro">O primeiro usuário cria a conta da empresa. Os próximos devem ser convidados pelo administrador.</p><SignupForm /></div>;
}
