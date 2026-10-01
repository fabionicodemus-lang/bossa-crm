"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CalendarRange,
  MessageCircle,
  Send,
  UsersRound,
  Handshake,
  Users,
  CheckSquare,
  FileText,
  Building2,
  ChartNoAxesCombined,
  Sparkles,
  Settings,
  Moon,
  Sun,
} from "lucide-react";
import type { UserContext } from "@/lib/types";
import { initials } from "@/lib/format";
import { SignOutButton } from "./SignOutButton";
import { useCrmUI } from "./CrmUI";

const links = [
  { href: "/hoje", label: "Hoje", icon: CalendarDays, paths: ["/hoje"] },
  {
    href: "/conversas",
    label: "Conversas",
    icon: MessageCircle,
    paths: ["/conversas", "/ia", "/mensagens-corretores"],
  },
  {
    href: "/transmissoes",
    label: "Transmissões",
    icon: Send,
    paths: ["/transmissoes"],
  },
  {
    href: "/clientes",
    label: "Pipeline Clientes",
    icon: UsersRound,
    paths: ["/clientes"],
  },
  {
    href: "/corretores",
    label: "Pipeline Corretores",
    icon: Handshake,
    paths: ["/corretores"],
  },
  {
    href: "/leads",
    label: "Leads",
    icon: Users,
    paths: ["/leads", "/arquivados", "/importar", "/geral"],
  },
  {
    href: "/tarefas",
    label: "Tarefas",
    icon: CheckSquare,
    paths: ["/tarefas"],
  },
  {
    href: "/agenda",
    label: "Agenda",
    icon: CalendarRange,
    paths: ["/agenda"],
  },
  {
    href: "/propostas",
    label: "Propostas",
    icon: FileText,
    paths: ["/propostas"],
  },
  {
    href: "/empreendimentos",
    label: "Empreendimentos",
    icon: Building2,
    paths: ["/empreendimentos"],
  },
  {
    href: "/gestao",
    label: "Gestão",
    icon: ChartNoAxesCombined,
    paths: ["/gestao", "/dashboard"],
  },
  {
    href: "/nara",
    label: "Nara",
    icon: Sparkles,
    paths: [
      "/nara",
      "/treinamento",
      "/plantao-corretores",
      "/configuracoes/arquivos-ia",
    ],
    restricted: true,
  },
  {
    href: "/configuracoes",
    label: "Configurações",
    icon: Settings,
    paths: ["/configuracoes", "/usuarios", "/minha-conta"],
  },
];
export function Sidebar({
  context,
  aiCount,
  overdueTaskCount,
}: {
  context: UserContext;
  aiCount: number;
  overdueTaskCount: number;
}) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useCrmUI();
  const active = links.find((item) =>
    item.paths.some(
      (path) => pathname === path || pathname.startsWith(path + "/"),
    ),
  );
  return (
    <aside className="sidebar">
      <Link className="logo" href="/hoje" aria-label="Bossa CRM, início">
        <Image
          src="/bossa-logo.png"
          alt="Bossa"
          width={98}
          height={17}
          priority
        />
        <span>CRM</span>
      </Link>
      <nav className="sidebar-nav" aria-label="Navegação principal">
        {links
          .filter((item) => !item.restricted || context.role !== "viewer")
          .map((item) => {
            const count =
              item.href === "/hoje"
                ? overdueTaskCount
                : item.href === "/nara"
                  ? aiCount
                  : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-current={active === item ? "page" : undefined}
                className={`nav-link ${active === item ? "active" : ""}`}
              >
                <item.icon size={16} strokeWidth={1.7} />
                <span className="nav-text">{item.label}</span>
                {count > 0 && (
                  <span
                    className={`nav-badge ${item.href === "/hoje" ? "overdue" : ""}`}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
      </nav>
      <div className="sidebar-user">
        <div className="user-chip">
          <Link href="/minha-conta" className="avatar" title="Minha conta">
            {initials(context.fullName)}
          </Link>
          <Link href="/minha-conta" className="user-info">
            <div className="user-name">{context.fullName.split(" ")[0]}</div>
            <div className="user-role">
              {context.role === "admin"
                ? "Gestor comercial"
                : context.role === "comercial"
                  ? "Comercial"
                  : "Consulta"}
            </div>
          </Link>
          <button
            type="button"
            className="icon-button"
            onClick={toggleTheme}
            aria-label={
              theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"
            }
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}
