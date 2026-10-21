import { notFound } from "next/navigation";
import { emObra, getEmpreendimento } from "@/content/empreendimentos";
import { almaMetaPlanta } from "@/content/alma";
import { meta } from "@/lib/seo";
import { PaginaEmpreendimento } from "@/components/PaginaEmpreendimento";
import { FlowLanding } from "@/components/flow/FlowLanding";
import { AlmaLanding } from "@/components/alma/AlmaLanding";

export const dynamicParams = false;
export function generateStaticParams() {
  return emObra.flatMap((e) => e.plantas.map((p) => ({ slug: e.slug, planta: p.slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; planta: string }> }) {
  const { slug, planta } = await params;
  const e = getEmpreendimento(slug); const p = e?.plantas.find((x) => x.slug === planta);
  if (!e || !p) return {};
  if (e.slug === "alma-seahouses") return meta({ ...almaMetaPlanta(p), caminho: `/empreendimentos/${e.slug}/plantas/${p.slug}` });
  const suites = p.suites ? `${p.suites} suítes ` : "";
  return meta({
    titulo: `${p.nome} · ${suites}${p.area} · ${e.nome}`,
    descricao: `${p.nome} do ${e.nome}: ${p.area}${p.suites ? `, ${p.suites} suítes` : ""}${p.vagas ? `, ${p.vagas} vagas` : ""}. ${p.descricao} A ${e.distanciaMar} da Praia do Perequê, Porto Belo.`,
    caminho: `/empreendimentos/${e.slug}/plantas/${p.slug}`,
    imagem: p.imagens[0].src,
  });
}

export default async function Pagina({ params }: { params: Promise<{ slug: string; planta: string }> }) {
  const { slug, planta } = await params;
  const e = getEmpreendimento(slug);
  if (!e || !e.plantas.some((p) => p.slug === planta)) notFound();
  if (e.slug === "alma-seahouses") return <AlmaLanding e={e} plantaInicial={planta} />;
  return e.slug === "flow-aptos" ? <FlowLanding e={e} plantaInicial={planta} /> : <PaginaEmpreendimento e={e} plantaInicial={planta} />;
}
