import Image from "next/image";
import Link from "next/link";
import type { Empreendimento, Edicao, FichaItem } from "@/content/empreendimentos";

export const pct = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Percentual grande: a vírgula da fonte mono ocupa uma casa inteira, então é apertada. */
export function Pct({ n }: { n: number }) {
  const [a, b] = pct(n).split(",");
  return <>{a}<span className="virgula">,</span>{b}<small>%</small></>;
}

export function Cota({ valor, crescer = true }: { valor: string; crescer?: boolean }) {
  return <div className={`cota${crescer ? " cota--crescer" : ""}`}><span className="cota__valor">{valor}</span></div>;
}

export function Ficha({ itens }: { itens: FichaItem[] }) {
  return (
    <dl className="ficha">
      {itens.map((f) => (
        <div className="ficha__item" key={f.legenda}>
          <dt className="sr">{f.legenda}</dt>
          <dd className="ficha__numero" style={{ margin: 0 }}>{f.numero}{f.unidade && <small>{f.unidade}</small>}</dd>
          <dd className="ficha__legenda" aria-hidden="true">{f.legenda}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CartaoEmpreendimento({ e, prioridade = false }: { e: Empreendimento; prioridade?: boolean }) {
  const classe = e.universo === "alma" ? "t-alma" : e.universo === "flow" ? "t-flow" : "";
  return (
    <Link href={`/empreendimentos/${e.slug}`} className="cartao">
      <div className="cartao__foto">
        <Image src={e.cartao.src} alt={e.cartao.alt} fill sizes="(max-width: 860px) 100vw, 50vw" priority={prioridade} />
        <span className="cartao__status">{e.statusCartao}</span>
      </div>
      <h3 className={`cartao__nome ${classe}`}>{e.nome}</h3>
      <p className="cartao__dados">{e.linhaCartao}</p>
    </Link>
  );
}

export function Andamento({ ed, nome, cor = "var(--tinta)", compacto = false }: { ed: Edicao; nome: string; cor?: string; compacto?: boolean }) {
  return (
    <div className="pilha">
      <div className="linha-acoes" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <div className="pilha-p">
          <p className="rotulo">{nome} · edição nº {String(ed.numero).padStart(2, "0")} · {ed.mesExtenso}</p>
          <p className="obra-pct" style={{ margin: 0 }}><Pct n={ed.percentual} /></p>
        </div>
        <p className="nota">+{pct(ed.avanco)}% no mês</p>
      </div>
      <div className="obra-barra" style={{ color: cor }} role="img" aria-label={`Obra ${pct(ed.percentual)}% concluída`}><span style={{ width: `${ed.percentual}%` }} /></div>
      {!compacto && (
        <dl className="etapas">
          {ed.etapas.map((et) => (
            <div className="etapa" key={et.nome}><dt>{et.nome}</dt><dd>{pct(et.pct)}%</dd><i><b style={{ width: `${et.pct}%` }} /></i></div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** Linhas em escala: prazo prometido × entrega real. */
export function ProvaEntrega({ titulo, prometidoPct, realPct, frase, periodo }: { titulo: string; prometidoPct?: number; realPct: number; frase: string; periodo: string }) {
  return (
    <div className="prova">
      <p className="rotulo">{titulo}</p>
      {prometidoPct !== undefined && (
        <div className="prova__linha"><span className="prova__rotulo">Prazo</span><div className="prova__trilho"><span className="prova__seg prova__seg--prometido" style={{ width: `${prometidoPct}%` }} /></div></div>
      )}
      <div className="prova__linha"><span className="prova__rotulo">{prometidoPct !== undefined ? "Entrega real" : "Obra"}</span><div className="prova__trilho"><span className="prova__seg prova__seg--real" style={{ width: `${realPct}%` }} /></div></div>
      <p className="nota mono">{periodo}</p>
      <p className="h3" style={{ fontWeight: 300 }}>{frase}</p>
    </div>
  );
}

export function JsonLd({ dados }: { dados: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(dados).replace(/</g, "\\u003c") }} />;
}

export function Migalhas({ itens }: { itens: { nome: string; href: string }[] }) {
  return (
    <nav aria-label="Você está em" className="nota" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {itens.map((m, i) => (
        <span key={m.href}>{i < itens.length - 1 ? <><Link href={m.href} style={{ textDecoration: "none" }}>{m.nome}</Link> <span aria-hidden="true">/</span></> : <span aria-current="page">{m.nome}</span>}</span>
      ))}
    </nav>
  );
}
