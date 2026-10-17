"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { rastrear } from "@/lib/rastreio";
import type { Evento } from "@/lib/eventos";

type Props = { evento: Evento; detalhe?: Record<string, string | number>; children: ReactNode; className?: string; id?: string; as?: "div" | "section" };

/** Dispara o evento uma vez, quando ao menos 40% do bloco aparece na tela. */
export function AoVer({ evento, detalhe, children, className, id, as = "div" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { rastrear(evento, detalhe); io.disconnect(); }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [evento, detalhe]);
  const Tag = as;
  return <Tag ref={ref as never} className={className} id={id}>{children}</Tag>;
}
