"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCrmUI } from "./CrmUI";
const groups = [
  [
    { href: "/tarefas", label: "Tarefas" },
    { href: "/agenda", label: "Calendário" },
  ],
  [
    { href: "/gestao", label: "Visão geral" },
    { href: "/dashboard", label: "Indicadores" },
    { href: "/propostas", label: "Propostas" },
  ],
  [
    { href: "/conversas", label: "Conversas" },
    { href: "/ia", label: "Atendimento IA" },
    { href: "/mensagens-corretores", label: "WhatsApp Comercial", admin: true },
    { href: "/transmissoes", label: "Transmissões e modelos" },
  ],
  [
    { href: "/nara", label: "Nara e Plantão" },
    { href: "/treinamento/nara", label: "Treinamento Nara", admin: true },
    { href: "/plantao-corretores", label: "Escala Plantão", admin: true },
    { href: "/treinamento/plantao", label: "Treinamento Plantão", admin: true },
    { href: "/configuracoes/arquivos-ia", label: "Materiais", edit: true },
  ],
  [
    { href: "/configuracoes", label: "Configurações" },
    { href: "/empreendimentos", label: "Empreendimentos" },
    { href: "/configuracoes/whatsapp", label: "WhatsApp", admin: true },
    { href: "/usuarios", label: "Equipe", admin: true },
    { href: "/minha-conta", label: "Minha conta" },
  ],
  [
    { href: "/leads", label: "Leads" },
    { href: "/arquivados", label: "Arquivados" },
    { href: "/importar", label: "Importar", edit: true },
  ],
];
export function WorkspaceTabs() {
  const pathname = usePathname();
  const { context } = useCrmUI();
  const role = context.role;
  const group = groups.find((g) => g.some((i) => i.href === pathname));
  if (!group) return null;
  return (
    <nav className="workspace-tabs" aria-label="Seções">
      {group
        .filter(
          (i) =>
            !("admin" in i && i.admin && role !== "admin") &&
            !("edit" in i && i.edit && role === "viewer"),
        )
        .map((i) => (
          <Link
            className={pathname === i.href ? "on" : ""}
            href={i.href}
            key={i.href}
          >
            {i.label}
          </Link>
        ))}
    </nav>
  );
}
