import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
        // Restrições compatíveis com Next, anexos, propostas e gravação de áudio.
        { key: 'Content-Security-Policy', value: "base-uri 'self'; object-src 'none'; frame-ancestors 'self'" },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(self)' },
      ],
    }];
  },
  // Os dois agentes utilizam o mesmo motor em src/lib/ai.ts. Fixar os nomes
  // no build impede que uma variável antiga da Vercel mantenha o gpt-5-mini.
  // Não usar fallback com outro modelo: a preferência é exclusivamente Luna.
  env: {
    OPENAI_MODEL: 'gpt-5.6-luna',
    OPENAI_MODEL_FALLBACK: 'gpt-5.6-luna',
  },
};

export default nextConfig;
