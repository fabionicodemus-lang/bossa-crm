import { PasswordResetForm } from '@/components/PasswordResetForm';

export default function ResetPage() {
  return <div className="auth-card"><h2>Recuperar senha</h2><p className="intro">Informe o e-mail do seu usuário para receber um link seguro.</p><PasswordResetForm /></div>;
}
