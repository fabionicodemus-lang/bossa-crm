import type { NextConfig } from "next";
import path from "node:path";

// O site mora na pasta site/ do repositório do CRM: a raiz do projeto é esta pasta, não a de cima.
const raiz = path.resolve(__dirname);

const config: NextConfig = {
  turbopack: { root: raiz },
  outputFileTracingRoot: raiz,
  images: { formats: ["image/avif", "image/webp"], qualities: [70, 80] },
  poweredByHeader: false,
  async redirects() {
    // URLs do site antigo (Wix) para as novas, para preservar o que o Google já conhece.
    return [
      { source: "/jazzresidence", destination: "/empreendimentos/jazz-residence", permanent: true },
      { source: "/soulresidence", destination: "/empreendimentos/soul-residence", permanent: true },
      { source: "/flow-aptos", destination: "/empreendimentos/flow-aptos", permanent: true },
      { source: "/alma", destination: "/empreendimentos/alma-seahouses", permanent: true },
      { source: "/a-bossa", destination: "/nossa-historia", permanent: true },
      { source: "/c%C3%B3pia-equipe", destination: "/corretores", permanent: true },
      { source: "/cópia-equipe", destination: "/corretores", permanent: true },
      { source: "/politica-de-privacidade", destination: "/privacidade", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
