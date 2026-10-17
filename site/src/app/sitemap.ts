import type { MetadataRoute } from "next";
import { SITE_URL } from "@/content/site";
import { empreendimentos, emObra } from "@/content/empreendimentos";

export default function sitemap(): MetadataRoute.Sitemap {
  const u = (p: string, prioridade = 0.6): MetadataRoute.Sitemap[number] => ({ url: `${SITE_URL}${p}`, lastModified: new Date(), priority: prioridade });
  return [
    u("/", 1),
    u("/empreendimentos", 0.8),
    ...empreendimentos.map((e) => u(`/empreendimentos/${e.slug}`, e.status === "obra" ? 0.9 : 0.6)),
    ...emObra.flatMap((e) => e.plantas.map((p) => u(`/empreendimentos/${e.slug}/plantas/${p.slug}`, 0.7))),
    u("/obras", 0.7),
    ...emObra.flatMap((e) => e.edicoes.map((ed) => u(`/obras/${e.slug}/${ed.mes}`, 0.5))),
    u("/jeito-bossa"), u("/nossa-historia"), u("/porto-belo"), u("/perguntas"),
    u("/comprar-morando-fora"), u("/corretores", 0.4), u("/contato", 0.5), u("/privacidade", 0.1),
  ];
}
