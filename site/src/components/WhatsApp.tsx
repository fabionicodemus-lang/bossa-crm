"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { LinkWhatsApp } from "./LinkWhatsApp";
import { IconeConversa } from "./Icones";
import { contextoWhatsApp } from "@/lib/contexto";

/** Botão fixo em todas as páginas + barra no celular nas páginas de empreendimento. */
export function WhatsAppFixo() {
  const caminho = usePathname();
  const ctx = contextoWhatsApp(caminho);
  useEffect(() => {
    document.body.dataset.barraWhats = ctx.barra && !caminho.startsWith("/empreendimentos/alma-seahouses") ? "true" : "false";
    return () => { document.body.dataset.barraWhats = "false"; };
  }, [ctx.barra, caminho]);
  if (caminho.startsWith("/empreendimentos/alma-seahouses")) return null;
  return (
    <>
      <div className="whats-fixo">
        <LinkWhatsApp className="whats" mensagem={ctx.mensagem} botao="fixo" empreendimento={ctx.empreendimento} ariaLabel="Falar com a Bossa no WhatsApp">
          <IconeConversa /><span className="whats__texto">Falar no WhatsApp</span>
        </LinkWhatsApp>
      </div>
      {ctx.barra && (
        <div className="whats-barra" role="complementary" aria-label="Contato rápido">
          <span className="whats-barra__texto"><strong id="whats-barra-titulo">{ctx.titulo}</strong>Resposta em minutos, no horário comercial</span>
          <LinkWhatsApp className="whats" mensagem={ctx.mensagem} botao="barra" empreendimento={ctx.empreendimento}><IconeConversa />Conversar</LinkWhatsApp>
        </div>
      )}
    </>
  );
}
