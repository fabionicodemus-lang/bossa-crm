import Link from "next/link";
import { PageTopbar } from "@/components/PageTopbar";
import { getCurrentContext } from "@/lib/auth";
export default async function SettingsPage() {
  const context = (await getCurrentContext())!;
  return (
    <>
      <PageTopbar
        title="Configurações"
        subtitle="Empreendimentos, integrações e equipe"
      />
      <div className="page-content hub-grid">
        {[
          {
            href: "/empreendimentos",
            label: "Empreendimentos",
            desc: "Produtos, tabelas e unidades disponíveis.",
          },
          {
            href: "/minha-conta",
            label: "Minha conta",
            desc: "Nome, senha e dados de acesso.",
          },
          {
            href: "/transmissoes",
            label: "Transmissões e modelos",
            desc: "Campanhas e modelos de mensagem da Meta.",
          },
          ...(context.role === "admin"
            ? [
                {
                  href: "/configuracoes/whatsapp",
                  label: "WhatsApp",
                  desc: "Canais, conexões e integração Meta.",
                },
                {
                  href: "/usuarios",
                  label: "Equipe e permissões",
                  desc: "Usuários e níveis de acesso ao CRM.",
                },
              ]
            : []),
        ].map((i) => (
          <Link className="card hub-card" href={i.href} key={i.href}>
            <h2>{i.label}</h2>
            <p>{i.desc}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
