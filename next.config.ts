import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    OPENAI_MODEL: 'gpt-5.6-terra',
    OPENAI_MODEL_FALLBACK: 'gpt-5.6-luna',
  },
};

export default nextConfig;
