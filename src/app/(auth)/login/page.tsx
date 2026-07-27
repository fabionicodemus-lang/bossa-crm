import { Suspense } from 'react';
import { LoginForm } from '@/components/LoginForm';

export default function LoginPage() {
  const allowSignup = process.env.NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP !== 'false';
  return <div className="auth-card"><h2>Bem-vindo de volta</h2><p className="intro">Entre com seu usuário para acessar a operação comercial da Bossa.</p><Suspense><LoginForm allowSignup={allowSignup} /></Suspense></div>;
}
