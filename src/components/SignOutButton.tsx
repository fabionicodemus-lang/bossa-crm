'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await createClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  }
  return <button className="btn btn-ghost btn-sm btn-block" onClick={signOut}>Sair</button>;
}
