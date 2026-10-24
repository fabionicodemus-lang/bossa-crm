import { notFound } from "next/navigation";
import { empreendimentos, getEmpreendimento } from "@/content/empreendimentos";
import { meta } from "@/lib/seo";
import { almaMeta } from "@/content/alma";
import { flowMeta } from "@/content/flow";
import { PaginaEmpreendimento } from "@/components/PaginaEmpreendimento";
import { FlowLanding } from "@/components/flow/FlowLanding";
import { AlmaLanding } from "@/components/alma/AlmaLanding";
import { PaginaEntregue } from "@/components/PaginaEntregue";

export const dynamicParams = false;
export function generateStaticParams() { return empreendimentos.map((e) => ({ slug: e.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const e = getEmpreendimento((await params).slug);
  if (!e) return {};
  if(e.slug === "alma-seahouses") return meta({ ...almaMeta, caminho: `/empreendimentos/${e.slug}` });
  if(e.slug === "flow-aptos") return meta({ ...flowMeta, caminho: `/empreendimentos/${e.slug}` });
  return meta({ titulo: e.metaTitle, descricao: e.metaDescription, caminho: `/empreendimentos/${e.slug}`, imagem: e.capa.src });
}

export default async function Pagina({ params }: { params: Promise<{ slug: string }> }) {
  const e = getEmpreendimento((await params).slug);
  if (!e) notFound();
  if (e.slug === "flow-aptos") return <FlowLanding e={e} />;
  if (e.slug === "alma-seahouses") return <AlmaLanding e={e} />;
  return e.status === "obra" ? <PaginaEmpreendimento e={e} /> : <PaginaEntregue e={e} />;
}
