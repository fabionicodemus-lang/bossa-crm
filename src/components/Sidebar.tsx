'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AppRole, UserContext } from '@/lib/types';
import { initials } from '@/lib/format';
import { SignOutButton } from './SignOutButton';

type NavItem = { section: string; roles?: AppRole[] } | { href: string; icon: string; label: string; roles?: AppRole[] };

const links: NavItem[] = [
  { href: '/dashboard', icon: '📊', label: 'Dashboard' },
  { section: 'Clientes finais' },
  { href: '/clientes', icon: '🧲', label: 'Pipeline de Leads' },
  { href: '/ia', icon: '🤖', label: 'Atendimento IA' },
  { href: '/importar?tipo=cliente', icon: '📥', label: 'Importar XLSX', roles: ['admin', 'comercial'] },
  { section: 'Corretores' },
  { href: '/corretores', icon: '🤝', label: 'Pipeline Corretores' },
  { href: '/importar?tipo=corretor', icon: '📥', label: 'Importar corretores', roles: ['admin', 'comercial'] },
  { section: 'Comercial' },
  { href: '/empreendimentos', icon: '🏢', label: 'Empreendimentos' },
  { href: '/propostas', icon: '🧾', label: 'Propostas' },
  { section: 'Sistema', roles: ['admin'] },
  { href: '/treinamento/nara', icon: '🎓', label: 'Treinar a Nara', roles: ['admin'] },
  { href: '/treinamento/plantao', icon: '🌙', label: 'Treinar o Plantão', roles: ['admin'] },
  { href: '/configuracoes/arquivos-ia', icon: '🗂️', label: 'Arquivos da IA', roles: ['admin'] },
  { href: '/configuracoes/whatsapp', icon: '📱', label: 'Canais WhatsApp', roles: ['admin'] },
  { href: '/usuarios', icon: '👥', label: 'Usuários', roles: ['admin'] },
];

export function Sidebar({ context, aiCount }: { context: UserContext; aiCount: number }) {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="logo"><div className="logo-title">bossa<span>.</span>crm</div><div className="logo-sub">CONSTRUIR COM BOSSA</div></div>
      <nav className="sidebar-nav">
        {links.map((item, index) => {
          if ('section' in item) return item.roles && !item.roles.includes(context.role) ? null : <div className="nav-label" key={`${item.section}-${index}`}>{item.section}</div>;
          if (item.roles && !item.roles.includes(context.role)) return null;
          const active = pathname === item.href.split('?')[0] || (item.href.startsWith('/leads/') && pathname.startsWith('/leads/'));
          return <Link className={`nav-link ${active ? 'active' : ''}`} href={item.href} key={item.href}><span>{item.icon}</span><span className="nav-text">{item.label}</span>{item.href === '/ia' && aiCount > 0 && <span className="nav-badge">{aiCount}</span>}</Link>;
        })}
      </nav>
      <div className="sidebar-user">
        <div className="user-chip"><div className="avatar">{initials(context.fullName)}</div><div className="user-info"><div className="user-name">{context.fullName}</div><div className="user-role">{context.role}</div></div></div>
        <SignOutButton />
      </div>
    </aside>
  );
}
