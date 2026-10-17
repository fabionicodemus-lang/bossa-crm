import Image from "next/image";
import Link from "next/link";
import { empresa, notaLegal } from "@/content/site";

export function Rodape() {
  const e = empresa.endereco;
  return (
    <footer className="rodape">
      <div className="wrap pilha" style={{ gap: 48 }}>
        <div className="rodape__grade">
          <div className="rodape__col">
            <Image src="/img/bossa-logo-branco.png" alt="Bossa Empreendimentos" width={54} height={30} style={{ height: 30, width: "auto" }} />
            <p className="nota" style={{ maxWidth: 320 }}>{empresa.assinatura}</p>
            <p className="nota">{e.rua} · {e.bairro} · {e.cidade} · {e.uf}</p>
          </div>
          <nav className="rodape__col" aria-label="Empreendimentos">
            <p className="rotulo">Empreendimentos</p>
            <Link href="/empreendimentos/alma-seahouses">Alma Seahouses</Link>
            <Link href="/empreendimentos/flow-aptos">Flow Aptos</Link>
            <Link href="/empreendimentos/soul-residence">Soul Residence</Link>
            <Link href="/empreendimentos/jazz-residence">Jazz Residence</Link>
          </nav>
          <nav className="rodape__col" aria-label="A Bossa">
            <p className="rotulo">Bossa</p>
            <Link href="/jeito-bossa">Jeito Bossa</Link>
            <Link href="/nossa-historia">Nossa História</Link>
            <Link href="/obras">Obras</Link>
            <Link href="/porto-belo">Porto Belo e Itapema</Link>
            <Link href="/perguntas">Perguntas frequentes</Link>
          </nav>
          <nav className="rodape__col" aria-label="Atendimento">
            <p className="rotulo">Atendimento</p>
            <Link href="/contato">Contato</Link>
            <Link href="/corretores">Corretores</Link>
            <Link href="/comprar-morando-fora">Comprar morando fora</Link>
            <Link href="/privacidade">Privacidade</Link>
            <a href={empresa.instagram} target="_blank" rel="noopener">@bossaempreendimentos</a>
          </nav>
        </div>
        <p className="nota" style={{ maxWidth: 900 }}>{notaLegal} © {new Date().getFullYear()} {empresa.nome}.</p>
      </div>
    </footer>
  );
}
