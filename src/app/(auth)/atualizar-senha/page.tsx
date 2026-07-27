import { UpdatePasswordForm } from '@/components/UpdatePasswordForm';

export default function UpdatePasswordPage() {
  return <div className="auth-card"><h2>Definir nova senha</h2><p className="intro">Crie uma senha forte com pelo menos oito caracteres.</p><UpdatePasswordForm /></div>;
}
