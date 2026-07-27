import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingForm } from '@/components/OnboardingForm';

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership } = await supabase.from('memberships').select('organization_id').eq('user_id', user.id).limit(1).maybeSingle();
  if (membership) redirect('/dashboard');

  return (
    <main className="onboarding">
      <div className="card onboarding-card">
        <div className="card-head"><h3>Configuração inicial do Bossa CRM</h3></div>
        <div className="card-body">
          <h1 style={{ font: '600 31px Fraunces, serif', margin: '0 0 8px' }}>Crie o ambiente da empresa</h1>
          <p className="muted" style={{ lineHeight: 1.6 }}>Se você recebeu um convite, a empresa será vinculada automaticamente. Caso seja o primeiro usuário, crie agora o ambiente da Bossa.</p>
          <OnboardingForm suggestedName="Bossa Empreendimentos" />
        </div>
      </div>
    </main>
  );
}
