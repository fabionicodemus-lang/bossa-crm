import { notFound } from "next/navigation";
import { empreendimentos, getEmpreendimento } from "@/content/empreendimentos";
import { meta } from "@/lib/seo";
import { PaginaEmpreendimento } from "@/components/PaginaEmpreendimento";
import { PaginaEntregue } from "@/components/PaginaEntregue";

export const dynamicParams = false;
export function generateStaticParams() { return empreendimentos.map((e) => ({ slug: e.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const e = getEmpreendimento((await params).slug);
  if (!e) return {};
  return meta({ titulo: e.metaTitle, descricao: e.metaDescription, caminho: `/empreendimentos/${e.slug}`, imagem: e.capa.src });
}

export default async function Pagina({ params }: { params: Promise<{ slug: string }> }) {
  const e = getEmpreendimento((await params).slug);
  if (!e) notFound();
  return e.status === "obra" ? <PaginaEmpreendimento e={e} /> : <PaginaEntregue e={e} />;
}
