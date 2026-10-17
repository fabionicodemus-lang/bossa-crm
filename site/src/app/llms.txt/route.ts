import { SITE_URL, empresa, perguntas } from "@/content/site";
import { empreendimentos } from "@/content/empreendimentos";

export const dynamic = "force-static";

// Resumo em texto simples para assistentes de IA (padrão llms.txt).
export function GET() {
  const e = empresa.endereco;
  const linhas = [
    "# Bossa Empreendimentos",
    "",
    "> Incorporadora fundada em 2017 que atua em Porto Belo e Itapema, Santa Catarina, Brasil. Constrói poucos empreendimentos por vez para acompanhar cada obra de perto. Entregou o Jazz Residence (2019, um ano e oito meses antes do prazo) e o Soul Residence (2023, no prazo). Em obra: Alma Seahouses e Flow Aptos, no Balneário Perequê, Porto Belo.",
    "",
    `Endereço: ${e.rua}, ${e.bairro}, ${e.cidade} - ${e.uf}. E-mail: ${empresa.email}.`,
    "",
    "## Empreendimentos",
    ...empreendimentos.map((x) => `- [${x.nome}](${SITE_URL}/empreendimentos/${x.slug}): ${x.metaDescription}`),
    "",
    "## Plantas",
    ...empreendimentos.filter((x) => x.status === "obra").flatMap((x) => x.plantas.map((p) => `- [${x.nome} · ${p.nome}](${SITE_URL}/empreendimentos/${x.slug}/plantas/${p.slug}): ${p.area}, ${p.suites} suítes.`)),
    "",
    "## Páginas",
    `- [Obras, edições mensais](${SITE_URL}/obras)`,
    `- [Jeito Bossa](${SITE_URL}/jeito-bossa)`,
    `- [Nossa história](${SITE_URL}/nossa-historia)`,
    `- [Porto Belo e Itapema](${SITE_URL}/porto-belo)`,
    `- [Perguntas frequentes](${SITE_URL}/perguntas)`,
    `- [Comprar morando fora do Brasil](${SITE_URL}/comprar-morando-fora)`,
    `- [Contato](${SITE_URL}/contato)`,
    "",
    "## Perguntas frequentes",
    ...perguntas.flatMap((q) => [`### ${q.p}`, q.r, ""]),
  ];
  return new Response(linhas.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
