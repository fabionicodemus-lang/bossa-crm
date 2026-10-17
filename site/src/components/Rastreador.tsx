"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { iniciar, rastrear } from "@/lib/rastreio";

function tipoPagina(c: string) {
  if (c === "/") return "home";
  if (/^\/empreendimentos\/[^/]+\/plantas\//.test(c)) return "planta";
  if (/^\/empreendimentos\/[^/]+$/.test(c)) return "empreendimento";
  if (c.startsWith("/obras")) return "obras";
  return c.split("/")[1] || "outra";
}

/** page_view a cada troca de página, return_visit na volta em outro dia e scroll_depth em 25/50/75/90%. */
export function Rastreador() {
  const caminho = usePathname();
  const inicio = useRef(Date.now());
  useEffect(() => {
    const { voltou, visitante } = iniciar();
    if (voltou !== null) rastrear("return_visit", { dias: voltou, visita: visitante.visitas });
  }, []);
  useEffect(() => {
    inicio.current = Date.now();
    rastrear("page_view", { tipo_pagina: tipoPagina(caminho) });
    const marcos = [25, 50, 75, 90];
    const vistos = new Set<number>();
    const aoRolar = () => {
      const h = document.documentElement;
      const pct = ((h.scrollTop + innerHeight) / h.scrollHeight) * 100;
      for (const m of marcos) if (pct >= m && !vistos.has(m)) { vistos.add(m); rastrear("scroll_depth", { pct: m, tipo_pagina: tipoPagina(caminho) }); }
    };
    addEventListener("scroll", aoRolar, { passive: true });
    return () => removeEventListener("scroll", aoRolar);
  }, [caminho]);
  return null;
}
