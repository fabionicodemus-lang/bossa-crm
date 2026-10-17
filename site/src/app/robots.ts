import type { MetadataRoute } from "next";
import { SITE_URL } from "@/content/site";

// Endereços de teste (preview) não são indexados. No ar, buscadores e IAs são bem-vindos.
export default function robots(): MetadataRoute.Robots {
  // Só libera buscadores quando o site for oficialmente publicado no domínio da Bossa.
  if (process.env.BOSSA_PUBLICADO !== "sim") return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/"] },
      ...["GPTBot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "ClaudeBot", "Claude-SearchBot", "Google-Extended", "Applebot-Extended"].map((ua) => ({ userAgent: ua, allow: "/", disallow: ["/api/"] })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
