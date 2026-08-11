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
  { href: '/tarefas', icon: '✅', label: 'Tarefas' },
  { href: '/empreendimentos', icon: '🏢', label: 'Empreendimentos' },
  { href: '/configuracoes/arquivos-ia', icon: '🗂️', label: 'Arquivos da IA', roles: ['admin', 'comercial'] },
  { href: '/propostas', icon: '🧾', label: 'Propostas' },
  { href: '/transmissoes', icon: '📣', label: 'Transmissões' },
  { href: '/arquivados', icon: '🗄️', label: 'Leads arquivados' },
  { section: 'Sistema', roles: ['admin'] },
  { href: '/treinamento/nara', icon: '🎓', label: 'Treinar a Nara', roles: ['admin'] },
  { href: '/treinamento/plantao', icon: '🌙', label: 'Treinar o Plantão', roles: ['admin'] },
  { href: '/configuracoes/whatsapp', icon: '📱', label: 'Canais WhatsApp', roles: ['admin'] },
  // Modelos da Meta virou aba de Transmissões: um caminho só para a mesma coisa.
  { href: '/usuarios', icon: '👥', label: 'Usuários', roles: ['admin'] },
];

export function Sidebar({ context, aiCount, overdueTaskCount }: { context: UserContext; aiCount: number; overdueTaskCount: number }) {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="logo"><div className="logo-title">bossa<span>.</span>crm</div><div className="logo-sub">CONSTRUIR COM BOSSA</div></div>
      <nav className="sidebar-nav">
        {links.map((item, index) => {
          if ('section' in item) return item.roles && !item.roles.includes(context.role) ? null : <div className="nav-label" key={`${item.section}-${index}`}>{item.section}</div>;
          if (item.roles && !item.roles.includes(context.role)) return null;
          const active = pathname === item.href.split('?')[0] || (item.href.startsWith('/leads/') && pathname.startsWith('/leads/'));
          return <Link className={`nav-link ${active ? 'active' : ''}`} href={item.href} key={item.href}><span>{item.icon}</span><span className="nav-text">{item.label}</span>{item.href === '/ia' && aiCount > 0 && <span className="nav-badge">{aiCount}</span>}{item.href === '/tarefas' && overdueTaskCount > 0 && <span className="nav-badge">{overdueTaskCount}</span>}</Link>;
        })}
      </nav>
      <div className="sidebar-user">
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', color: '#8a8178', marginBottom: '6px', textTransform: 'uppercase' }}>Versão 1.2.0</div>
        <div className="user-chip"><div className="avatar">{initials(context.fullName)}</div><div className="user-info"><div className="user-name">{context.fullName}</div><div className="user-role">{context.role}</div></div></div>
        <Link className={`btn btn-ghost btn-block btn-sm ${pathname === '/minha-conta' ? 'active' : ''}`} href="/minha-conta">⚙️ Minha conta e senha</Link>
        <SignOutButton />
      </div>
    </aside>
  );
}
