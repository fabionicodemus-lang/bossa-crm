import Image from "next/image";
import Link from "next/link";
import { soulDisponivel, type Empreendimento } from "@/content/empreendimentos";
import { notaLegal, pendente } from "@/content/site";
import { Ficha, JsonLd, Migalhas, ProvaEntrega, Cota } from "./Blocos";
import { Galeria } from "./Galeria";
import { LinkWhatsApp } from "./LinkWhatsApp";
import { VerEmpreendimento } from "./VerEmpreendimento";
import { AoVer } from "./AoVer";
import { empreendimentoLd, migalhasLd } from "@/lib/seo";

export function PaginaEntregue({ e }: { e: Empreendimento }) {
  const isSoul = e.slug === "soul-residence";
  const migalhas = [{ nome: "Início", href: "/" }, { nome: "Empreendimentos", href: "/empreendimentos" }, { nome: e.nome, href: `/empreendimentos/${e.slug}` }];
  return (
    <>
      <VerEmpreendimento slug={e.slug} estagio="entregue" />
      <JsonLd dados={empreendimentoLd(e)} />
      <JsonLd dados={migalhasLd(migalhas)} />
      <section className="sec" style={{ paddingBottom: 48 }}>
        <div className="wrap pilha" style={{ gap: 32 }}>
          <Migalhas itens={migalhas} />
          <div className="dupla" style={{ alignItems: "end" }}>
            <div className="pilha"><p className="rotulo">{e.rotulo}</p><h1 className="h1">{e.nome}</h1></div>
            <p className="lead" style={{ paddingBottom: 8 }}>{e.resumo}</p>
          </div>
        </div>
      </section>
      <div className="abertura-foto"><Image src={e.capa.src} alt={e.capa.alt} fill priority sizes="100vw" style={{ objectPosition: isSoul ? "center" : "center 30%" }} /></div>

      <AoVer as="section" evento="view_history" detalhe={{ empreendimento: e.slug }} className="sec">
        <div className="wrap dupla" style={{ alignItems: "start" }}>
          {isSoul
            ? <ProvaEntrega titulo="Da obra à entrega" realPct={100} periodo="fev/2020 → dez/2023, no prazo contratado" frase="Mesmo com a pandemia, o Soul foi entregue na data prometida." />
            : <ProvaEntrega titulo="Da obra à entrega" realPct={100} periodo="nov/2017 → set/2019" frase="Entregue um ano e oito meses antes do prazo. O Habite-se saiu 15 dias depois." />}
          <Ficha itens={e.ficha} />
        </div>
      </AoVer>

      <section className="sec sec--elev">
        <div className="wrap pilha" style={{ gap: 32 }}>
          <div className="pilha"><p className="rotulo">{isSoul ? "Pronto e habitado" : "Como ficou"}</p><h2 className="h2">{isSoul ? "O que mostramos no lançamento, entregue." : "O primeiro Bossa, pronto."}</h2></div>
          <Galeria fotos={e.galeria} empreendimento={e.slug} />
          <p className="nota">Fotos reais do empreendimento entregue.</p>
        </div>
      </section>

      {isSoul && (
        <section className="sec">
          <div className="wrap dupla" style={{ alignItems: "center" }}>
            <div className="ratio-4-3" style={{ position: "relative" }}><Image src="/img/soul-suite.jpg" alt="Suíte de um apartamento do Soul Residence" fill sizes="(max-width: 860px) 100vw, 50vw" /></div>
            <div className="pilha">
              <p className="rotulo">Pronto para morar</p>
              <h2 className="h2">Um apartamento disponível.</h2>
              <div style={{ maxWidth: 320 }}><Cota valor={`${soulDisponivel.area} · ${soulDisponivel.suites} suítes`} /></div>
              {!pendente(soulDisponivel.detalhe) && <p className="p">{soulDisponivel.detalhe}</p>}
              <div className="linha-acoes">
                <LinkWhatsApp className="botao" botao="soul_disponivel" empreendimento={e.slug} mensagem="Olá! Quero saber mais sobre o apartamento disponível no Soul Residence.">Conversar sobre este apartamento</LinkWhatsApp>
                <Link href="/contato#visita" className="botao botao--contorno">Agendar visita</Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="sec">
        <div className="wrap pilha">
          <p className="rotulo">Continue</p>
          <div className="linha-acoes" style={{ gap: 32 }}>
            <Link className="botao botao--texto" href="/empreendimentos/alma-seahouses">Alma Seahouses, em obra</Link>
            <Link className="botao botao--texto" href="/empreendimentos/flow-aptos">Flow Aptos, em obra</Link>
            <Link className="botao botao--texto" href="/nossa-historia">Nossa História</Link>
          </div>
          <p className="nota" style={{ marginTop: 24 }}>{notaLegal}</p>
        </div>
      </section>
    </>
  );
}
