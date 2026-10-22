import type { NextConfig } from 'next';

const isolatedBuild = process.env.VERCEL_ENV === 'preview' || Boolean(process.env.BOSSA_HOMOLOGATION_MODE);
const localBuild = isolatedBuild && !process.env.VERCEL_ENV && process.env.BOSSA_HOMOLOGATION_MODE === 'local'
  && process.env.BOSSA_HOMOLOGATION_SUPABASE_URL === 'http://127.0.0.1:54521';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Os dois agentes utilizam o mesmo motor em src/lib/ai.ts. Fixar os nomes
  // no build impede que uma variável antiga da Vercel mantenha o gpt-5-mini.
  // Não usar fallback com outro modelo: a preferência é exclusivamente Luna.
  env: {
    NEXT_PUBLIC_BOSSA_HOMOLOGATION: isolatedBuild ? 'required' : 'off',
    NEXT_PUBLIC_BOSSA_HOMOLOGATION_COMMIT: isolatedBuild
      ? (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.BOSSA_HOMOLOGATION_COMMIT ?? '') : '',
    // Never ship an inherited production URL or key in a Preview JavaScript bundle.
    ...(isolatedBuild ? {
      NEXT_PUBLIC_SUPABASE_URL: localBuild ? process.env.BOSSA_HOMOLOGATION_SUPABASE_URL! : '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: localBuild ? (process.env.BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY ?? '') : '',
    } : {}),
    OPENAI_MODEL: 'gpt-5.6-luna',
    OPENAI_MODEL_FALLBACK: 'gpt-5.6-luna',
  },
};

export default nextConfig;
