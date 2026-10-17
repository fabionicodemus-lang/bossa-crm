import type { Metadata } from "next";
import { SITE_URL, empresa } from "@/content/site";
import type { Empreendimento } from "@/content/empreendimentos";

export function meta({ titulo, descricao, caminho, imagem }: { titulo: string; descricao: string; caminho: string; imagem?: string }): Metadata {
  const url = SITE_URL + caminho;
  const img = imagem ?? "/img/alma-piscina.jpg";
  return {
    title: { absolute: titulo },
    description: descricao,
    alternates: { canonical: url },
    openGraph: { title: titulo, description: descricao, url, siteName: empresa.nome, locale: "pt_BR", type: "website", images: [{ url: img, width: 1600, height: 900 }] },
    twitter: { card: "summary_large_image", title: titulo, description: descricao, images: [img] },
  };
}

export const organizacaoLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": SITE_URL + "/#organizacao",
  name: empresa.nome,
  url: SITE_URL,
  logo: SITE_URL + "/img/bossa-logo-preto.png",
  foundingDate: String(empresa.fundacao),
  founder: empresa.fundadores.map((n) => ({ "@type": "Person", name: n })),
  description: empresa.definicao,
  slogan: empresa.assinatura,
  email: empresa.email,
  address: { "@type": "PostalAddress", streetAddress: empresa.endereco.rua, addressLocality: empresa.endereco.cidade, addressRegion: empresa.endereco.uf, postalCode: empresa.endereco.cep, addressCountry: "BR" },
  areaServed: ["Porto Belo, SC", "Itapema, SC"],
  sameAs: [empresa.instagram, empresa.facebook],
};

export function empreendimentoLd(e: Empreendimento) {
  return {
    "@context": "https://schema.org",
    "@type": "ApartmentComplex",
    name: e.nome,
    url: `${SITE_URL}/empreendimentos/${e.slug}`,
    description: e.resumo,
    image: SITE_URL + e.capa.src,
    numberOfAccommodationUnits: e.unidades,
    address: { "@type": "PostalAddress", streetAddress: e.endereco, addressLocality: e.cidade, addressRegion: "SC", addressCountry: "BR" },
    containedInPlace: { "@type": "Place", name: `${e.bairro}, ${e.cidade}` },
    additionalProperty: [
      e.distanciaMar && { "@type": "PropertyValue", name: "Distância até a praia", value: e.distanciaMar },
      e.pavimentos && { "@type": "PropertyValue", name: "Pavimentos", value: e.pavimentos },
      { "@type": "PropertyValue", name: e.status === "obra" ? "Entrega prevista" : "Entregue em", value: e.entregaIso },
    ].filter(Boolean),
    containsPlace: e.plantas.map((p) => ({ "@type": "Apartment", name: `${p.nome} · ${e.nome}`, floorSize: { "@type": "QuantitativeValue", value: p.areaNum, unitCode: "MTK" }, ...(p.suites ? { numberOfBedrooms: p.suites } : {}) })),
    provider: { "@id": SITE_URL + "/#organizacao" },
  };
}

export function perguntasLd(itens: { p: string; r: string }[]) {
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: itens.map((q) => ({ "@type": "Question", name: q.p, acceptedAnswer: { "@type": "Answer", text: q.r } })) };
}

export function migalhasLd(itens: { nome: string; href: string }[]) {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: itens.map((m, i) => ({ "@type": "ListItem", position: i + 1, name: m.nome, item: SITE_URL + m.href })) };
}
