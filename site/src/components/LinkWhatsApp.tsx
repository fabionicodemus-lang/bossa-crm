"use client";
import { useEffect, useState, type ReactNode } from "react";
import { linkWhatsApp, rastrear } from "@/lib/rastreio";
import { WHATSAPP } from "@/content/site";

type Props = { mensagem: string; botao: string; empreendimento?: string; planta?: string; className?: string; children: ReactNode; ariaLabel?: string };

/** Abre o WhatsApp da Nara com a mensagem pronta e o código de visita, e registra click_whatsapp. */
export function LinkWhatsApp({ mensagem, botao, empreendimento, planta, className, children, ariaLabel }: Props) {
  const [href, setHref] = useState(() => linkWhatsApp(WHATSAPP, mensagem).replace(/\(ref\.[^)]*\)/, ""));
  useEffect(() => setHref(linkWhatsApp(WHATSAPP, mensagem)), [mensagem]);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className={className}
      aria-label={ariaLabel}
      onClick={() => { setHref(linkWhatsApp(WHATSAPP, mensagem)); rastrear("click_whatsapp", { botao, empreendimento, planta }); }}
    >
      {children}
    </a>
  );
}
