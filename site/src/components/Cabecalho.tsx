"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const MENU = [
  { href: "/empreendimentos", nome: "Empreendimentos" },
  { href: "/jeito-bossa", nome: "Jeito Bossa" },
  { href: "/nossa-historia", nome: "Nossa História" },
  { href: "/obras", nome: "Obras" },
  { href: "/contato", nome: "Contato" },
];

export function Cabecalho() {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  useEffect(() => setAberto(false), [caminho]);
  const ativo = (h: string) => caminho === h || caminho.startsWith(h + "/");
  return (
    <header className="cabecalho">
      <div className="wrap cabecalho__in">
        <Link href="/" className="cabecalho__logo" aria-label="Bossa Empreendimentos, início">
          <Image src="/img/bossa-logo-preto.png" alt="Bossa Empreendimentos" width={54} height={30} priority />
        </Link>
        <nav aria-label="Principal">
          <ul className="cabecalho__menu">
            {MENU.map((m) => (
              <li key={m.href}><Link href={m.href} aria-current={ativo(m.href) ? "page" : undefined}>{m.nome}</Link></li>
            ))}
          </ul>
        </nav>
        <Link href="/contato" className="botao botao--contorno cabecalho__cta">Falar com a Bossa</Link>
        <button className="cabecalho__abrir" aria-expanded={aberto} aria-controls="menu-cel" onClick={() => setAberto((a) => !a)}>
          {aberto ? "Fechar" : "Menu"}
        </button>
      </div>
      <div id="menu-cel" className="menu-cel wrap" data-aberto={aberto}>
        <ul>
          {MENU.map((m) => (<li key={m.href}><Link href={m.href} aria-current={ativo(m.href) ? "page" : undefined}>{m.nome}</Link></li>))}
          <li><Link href="/perguntas">Perguntas frequentes</Link></li>
        </ul>
      </div>
    </header>
  );
}
