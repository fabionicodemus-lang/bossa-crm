import Link from "next/link";
import { PageTopbar } from "@/components/PageTopbar";
import { getCurrentContext } from "@/lib/auth";
import { redirect } from "next/navigation";
export default async function NaraPage() {
  const context = (await getCurrentContext())!;
  if (context.role === "viewer") redirect("/hoje");
  return (
    <>
      <PageTopbar
        title="Nara e Plantão"
        subtitle="Conhecimento, materiais e operação dos assistentes"
      />
      <div className="page-content hub-grid">
        {[
          {
            href: "/ia",
            label: "Atendimentos da IA",
            desc: "Conversas de clientes e corretores em andamento.",
          },
          {
            href: "/configuracoes/arquivos-ia",
            label: "Materiais",
            desc: "Fotos, vídeos, plantas e documentos dos empreendimentos.",
          },
          ...(context.role === "admin"
            ? [
                {
                  href: "/treinamento/nara",
                  label: "Treinar a Nara",
                  desc: "Instruções, testes e versões do conhecimento.",
                },
                {
                  href: "/treinamento/plantao",
                  label: "Treinar o Plantão",
                  desc: "Conhecimento para relacionamento com corretores.",
                },
                {
                  href: "/plantao-corretores",
                  label: "Escala do Plantão",
                  desc: "Horários e responsáveis pelo atendimento.",
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
