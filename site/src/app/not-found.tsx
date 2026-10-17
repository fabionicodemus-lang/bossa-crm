import Link from "next/link";
export default function NaoEncontrada() {
  return (
    <section className="sec">
      <div className="wrap pilha" style={{ maxWidth: 820 }}>
        <p className="rotulo">404</p>
        <h1 className="h1">Esta página não existe mais.</h1>
        <p className="lead">O site da Bossa mudou. O que você procura provavelmente está em um destes caminhos.</p>
        <div className="linha-acoes" style={{ gap: 32 }}>
          <Link className="botao botao--texto" href="/empreendimentos/alma-seahouses">Alma Seahouses</Link>
          <Link className="botao botao--texto" href="/empreendimentos/flow-aptos">Flow Aptos</Link>
          <Link className="botao botao--texto" href="/obras">Obras</Link>
          <Link className="botao botao--texto" href="/contato">Contato</Link>
        </div>
      </div>
    </section>
  );
}
