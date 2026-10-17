"use client";
import type { ReactNode } from "react";
import { rastrear } from "@/lib/rastreio";
import type { Evento } from "@/lib/eventos";

export function LinkRastreado({ href, evento, detalhe, className, children, externo }: { href: string; evento: Evento; detalhe?: Record<string, string>; className?: string; children: ReactNode; externo?: boolean }) {
  return <a href={href} className={className} target={externo ? "_blank" : undefined} rel={externo ? "noopener" : undefined} onClick={() => rastrear(evento, detalhe)}>{children}</a>;
}
