import Link from "next/link";
import { notFound } from "next/navigation";
import { emObra, getEmpreendimento } from "@/content/empreendimentos";
import { meta, migalhasLd } from "@/lib/seo";
import { Andamento, JsonLd, Migalhas, pct } from "@/components/Blocos";
import { AoVer } from "@/components/AoVer";
import { SITE_URL } from "@/content/site";

export const dynamicParams = false;
export function generateStaticParams() { return emObra.flatMap((e) => e.edicoes.map((ed) => ({ slug: e.slug, mes: ed.mes }))); }

async function achar(params: Promise<{ slug: string; mes: string }>) {
  const { slug, mes } = await params; const e = getEmpreendimento(slug); const ed = e?.edicoes.find((x) => x.mes === mes);
  return e && ed ? { e, ed } : null;
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string; mes: string }> }) {
  const r = await achar(params); if (!r) return {};
  return meta({ titulo: `${r.e.nome} · Obra em ${r.ed.mesExtenso}: ${pct(r.ed.percentual)}%`, descricao: `${r.ed.titulo} ${r.ed.subtitulo}`.slice(0, 155), caminho: `/obras/${r.e.slug}/${r.ed.mes}`, imagem: r.e.capa.src });
}

export default async function Edicao({ params }: { params: Promise<{ slug: string; mes: string }> }) {
  const r = await achar(params); if (!r) notFound();
  const { e, ed } = r;
  const migalhas = [{ nome: "Início", href: "/" }, { nome: "Obras", href: "/obras" }, { nome: `${e.nome} · ${ed.mesExtenso}`, href: `/obras/${e.slug}/${ed.mes}` }];
  const artigo = { "@context": "https://schema.org", "@type": "Article", headline: `${e.nome}: ${ed.titulo}`, datePublished: `${ed.mes}-01`, author: { "@type": "Person", name: "Fábio Nicodemus", jobTitle: "Diretor de incorporações" }, publisher: { "@id": SITE_URL + "/#organizacao" }, about: e.nome };
  return (
    <AoVer evento="view_construction" detalhe={{ empreendimento: e.slug, edicao: ed.numero, percentual: ed.percentual }}>
      <JsonLd dados={artigo} /><JsonLd dados={migalhasLd(migalhas)} />
      <section className="sec">
        <div className="wrap pilha" style={{ gap: 32 }}>
          <Migalhas itens={migalhas} />
          <p className="rotulo">{e.nome} · edição nº {String(ed.numero).padStart(2, "0")} · {ed.mesExtenso}</p>
          <h1 className="h1" style={{ maxWidth: 1000 }}>{ed.titulo}</h1>
          <p className="lead">{ed.subtitulo}</p>
        </div>
      </section>
      <section style={{ paddingBottom: 96 }}>
        <div className="wrap dupla" style={{ alignItems: "start" }}>
          <Andamento ed={ed} nome="Andamento total" />
          {ed.frentes && (
            <div className="pilha">
              <p className="rotulo">Onde cada frente está hoje</p>
              <ul className="lista-dados">{ed.frentes.map((f) => <li key={f.pav + f.servico}><span>{f.servico}</span><span>{f.pav}</span></li>)}</ul>
            </div>
          )}
        </div>
      </section>
      {ed.carta && (
        <section className="sec sec--elev">
          <div className="wrap pilha" style={{ maxWidth: 900 }}>
            <p className="rotulo">Carta do diretor</p>
            {ed.carta.map((p) => <p className="p" key={p.slice(0, 20)}>{p}</p>)}
            <p className="rotulo">Fábio Nicodemus · Diretor de incorporações</p>
          </div>
        </section>
      )}
      {ed.reportagem && (
        <AoVer as="section" evento="view_engineering" detalhe={{ empreendimento: e.slug, tema: ed.reportagem.titulo }} className="sec">
          <div className="wrap dupla" style={{ alignItems: "start" }}>
            <div className="pilha"><p className="rotulo">Reportagem</p><h2 className="h2">{ed.reportagem.titulo}</h2><p className="p">{ed.reportagem.texto}</p></div>
            <ol className="lista-simples" style={{ counterReset: "p" }}>
              {ed.reportagem.passos.map((p, i) => (
                <li key={p.titulo} style={{ display: "grid", gridTemplateColumns: "48px minmax(0,1fr)", gap: 16 }}>
                  <span className="cota__valor">{String(i + 1).padStart(2, "0")}</span>
                  <div><strong style={{ fontWeight: 500 }}>{p.titulo}</strong><p className="nota" style={{ marginTop: 4 }}>{p.texto}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </AoVer>
      )}
      {ed.proximo && (
        <section className="sec sec--elev">
          <div className="wrap linha-acoes" style={{ justifyContent: "space-between" }}>
            <div className="pilha-p" style={{ maxWidth: 700 }}><p className="rotulo">Próximo mês</p><p className="p">{ed.proximo}</p></div>
            <Link className="botao botao--contorno" href={`/empreendimentos/${e.slug}`}>Conhecer o {e.nome.split(" ")[0]}</Link>
          </div>
        </section>
      )}
    </AoVer>
  );
}
