"use client";
import { useEffect, useState } from "react";
const itens = [
  ["opcoes-flow", "Plantas"], ["the-roof", "Lazer"], ["vistas", "Alturas"],
  ["engenharia", "Engenharia"], ["construcao", "Ver a obra"],
  ["localizacao-flow", "Localização"], ["visita", "Agendar visita"],
];
export function NavegacaoFlow() {
  const [aberto, setAberto] = useState(false), [ativo, setAtivo] = useState("");
  useEffect(() => {
    window.dispatchEvent(new Event("flow:menu"));
  }, [aberto]);
  useEffect(() => {
    const atualizar = () => {
      let atual = "";
      for (const [id] of itens) {
        const r = document.getElementById(id)?.getBoundingClientRect();
        if (r && r.top < 210) atual = id;
      }
      setAtivo(atual);
    };
    addEventListener("scroll", atualizar, { passive: true }); atualizar();
    return () => removeEventListener("scroll", atualizar);
  }, []);
  return <nav className="fl-nav" aria-label="Navegação do Flow" data-aberto={aberto} onKeyDown={e => { if(e.key === "Escape") {setAberto(false); document.getElementById("fl-explorar")?.focus();} }}>
    <button id="fl-explorar" className="fl-nav-abrir" aria-expanded={aberto} aria-controls="fl-nav-itens" onClick={() => setAberto(!aberto)}>Explorar o Flow <span aria-hidden="true">{aberto ? "−" : "+"}</span></button>
    <div id="fl-nav-itens" className="fl-nav-itens">{itens.map(([id, nome]) => <a key={id} href={`#${id}`} className={id === "visita" ? "fl-nav-visita" : undefined} aria-current={ativo === id ? "location" : undefined} onClick={e => {
      e.preventDefault(); setAberto(false);
      requestAnimationFrame(() => { const el = document.getElementById(id); if(!el) return; el.tabIndex = -1; el.focus({preventScroll:true}); el.scrollIntoView({block:"start"}); });
    }}>{nome}</a>)}</div>
  </nav>;
}
