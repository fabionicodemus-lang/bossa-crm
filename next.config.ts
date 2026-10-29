import type { NextConfig } from 'next';
import { inspectManualPilot } from './src/lib/homologation/manual-pilot';
import { REMOTE_SUPABASE_ORIGIN, REMOTE_VERCEL_PROJECT } from './src/lib/homologation/policy';

const isolatedBuild = process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_PROJECT_ID === REMOTE_VERCEL_PROJECT || Boolean(process.env.BOSSA_HOMOLOGATION_MODE);
const localBuild = isolatedBuild && !process.env.VERCEL_ENV && process.env.BOSSA_HOMOLOGATION_MODE === 'local'
  && process.env.BOSSA_HOMOLOGATION_SUPABASE_URL === 'http://127.0.0.1:54521';

const remoteBuild = isolatedBuild && process.env.VERCEL_ENV === 'preview'
  && process.env.VERCEL_PROJECT_ID === REMOTE_VERCEL_PROJECT && process.env.BOSSA_HOMOLOGATION_MODE === 'remote'
  && process.env.VERCEL_GIT_COMMIT_REF === 'feat/commercial-metrics-foundation'
  && /^[a-f0-9]{40}$/.test(process.env.VERCEL_GIT_COMMIT_SHA ?? '')
  && process.env.BOSSA_HOMOLOGATION_COMMIT === process.env.VERCEL_GIT_COMMIT_SHA
  && process.env.BOSSA_HOMOLOGATION_SUPABASE_URL === REMOTE_SUPABASE_ORIGIN
  && process.env.NEXT_PUBLIC_SUPABASE_URL === REMOTE_SUPABASE_ORIGIN
  && Boolean(process.env.BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY)
  && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY === process.env.BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY;

const manualBuild = isolatedBuild && inspectManualPilot(process.env, false).ready;

const nextConfig: NextConfig = {
  ...(manualBuild ? { images: { unoptimized: true } } : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  // Os dois agentes utilizam o mesmo motor em src/lib/ai.ts. Fixar os nomes
  // no build impede que uma variável antiga da Vercel mantenha o gpt-5-mini.
  // Não usar fallback com outro modelo: a preferência é exclusivamente Luna.
  env: {
    NEXT_PUBLIC_BOSSA_HOMOLOGATION: isolatedBuild ? 'required' : 'off',
    NEXT_PUBLIC_BOSSA_HOMOLOGATION_COMMIT: isolatedBuild
      ? (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.BOSSA_HOMOLOGATION_COMMIT ?? '') : '',
    NEXT_PUBLIC_BOSSA_HOMOLOGATION_MODE: isolatedBuild ? (manualBuild ? 'manual-pilot' : remoteBuild ? 'remote' : localBuild ? 'local' : 'blocked') : '',
    NEXT_PUBLIC_BOSSA_HOMOLOGATION_PROJECT: (remoteBuild || manualBuild) ? REMOTE_VERCEL_PROJECT : '',
    NEXT_PUBLIC_BOSSA_HOMOLOGATION_ENVIRONMENT_ID: isolatedBuild ? (process.env.BOSSA_HOMOLOGATION_ENVIRONMENT_ID ?? '') : '',
    NEXT_PUBLIC_BOSSA_HOMOLOGATION_ORIGIN: (remoteBuild || manualBuild) ? `https://${process.env.VERCEL_URL ?? ''}` : '',
    BOSSA_HOMOLOGATION_BUILD_ATTESTATION_KEY: remoteBuild ? (process.env.BOSSA_HOMOLOGATION_ATTESTATION_PUBLIC_KEY ?? '') : '',
    // Never ship an inherited production URL or key in a Preview JavaScript bundle.
    ...(isolatedBuild ? {
      NEXT_PUBLIC_SUPABASE_URL: (localBuild || remoteBuild || manualBuild) ? process.env.BOSSA_HOMOLOGATION_SUPABASE_URL! : '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: (localBuild || remoteBuild || manualBuild) ? (process.env.BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY ?? '') : '',
    } : {}),
    OPENAI_MODEL: 'gpt-5.6-luna',
    OPENAI_MODEL_FALLBACK: 'gpt-5.6-luna',
  },
};

export default nextConfig;
