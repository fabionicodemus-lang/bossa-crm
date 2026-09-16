import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Os dois agentes utilizam o mesmo motor em src/lib/ai.ts. Fixar os nomes
  // no build impede que uma variável antiga da Vercel mantenha o gpt-5-mini.
  // Não usar fallback com outro modelo: a preferência é exclusivamente Luna.
  env: {
    OPENAI_MODEL: 'gpt-5.6-luna',
    OPENAI_MODEL_FALLBACK: 'gpt-5.6-luna',
  },
};

export default nextConfig;
