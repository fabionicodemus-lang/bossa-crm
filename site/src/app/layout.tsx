import type { Metadata, Viewport } from "next";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/literata";
import "@fontsource-variable/urbanist";
import "@fontsource-variable/saira";
import "@fontsource/michroma/400.css";
import "@/styles/globals.css";
import { Cabecalho } from "@/components/Cabecalho";
import { Rodape } from "@/components/Rodape";
import { WhatsAppFixo } from "@/components/WhatsApp";
import { Rastreador } from "@/components/Rastreador";
import { Cookies } from "@/components/Cookies";
import { JsonLd } from "@/components/Blocos";
import { organizacaoLd } from "@/lib/seo";
import { SITE_URL } from "@/content/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Bossa Empreendimentos", template: "%s" },
  icons: { icon: "/icon.png" },
  robots: { index: process.env.BOSSA_PUBLICADO === "sim", follow: process.env.BOSSA_PUBLICADO === "sim" },
};
export const viewport: Viewport = { themeColor: "#f1f1ee", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function Raiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <a href="#conteudo" className="pular">Pular para o conteúdo</a>
        <Cabecalho />
        <main id="conteudo">{children}</main>
        <Rodape />
        <WhatsAppFixo />
        <Cookies />
        <Rastreador />
        <JsonLd dados={organizacaoLd} />
      </body>
    </html>
  );
}
