'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { SidebarToggle, useSidebar } from './sidebar-controls';
import AnimatedNavIcon from './animated-nav-icon';

const UserContext = createContext(null);
export const useCurrentUser = () => useContext(UserContext);
export const roleLabels = {
  EMPLOYEE: 'Сотрудник',
  AGENT: 'Исполнитель',
  ADMIN: 'Администратор',
};
export function initials(name = '') {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'S'
  );
}
const navigation = [
  { href: '/', label: 'Dashboard', kind: 'dashboard' },
  { href: '/tickets', label: 'Все заявки', kind: 'tickets' },
  { href: '/tickets/new', label: 'Создать заявку', kind: 'create' },
  { href: '/my-tickets', label: 'Мои заявки', kind: 'my-tickets' },
  { href: '/team', label: 'Сотрудники', kind: 'team', admin: true },
  { href: '/reports', label: 'Отчёты', kind: 'reports', admin: true },
];

export function Brand({ compact = false }) {
  return (
    <Link href="/" className="brand" aria-label="ServiceDesk — главная">
      <span className="brand-mark">
        <AnimatedNavIcon kind="headset" size={23} />
      </span>
      {!compact && (
        <span>
          Service<span className="brand-light">Desk</span>
          <small>WORKSPACE</small>
        </span>
      )}
    </Link>
  );
}

export default function ServiceDeskShell({ user: initialUser, children }) {
  const [user, setUser] = useState(initialUser);
  const [menu, setMenu] = useState(false);
  const [ticketCreated, setTicketCreated] = useState(false);
  const menuRef = useRef(null);
  const sidebar = useSidebar();
  const pathname = usePathname();
  const item = [
    ...navigation,
    { href: '/support', label: 'Поддержка' },
    { href: '/settings', label: 'Настройки' },
    { href: '/profile', label: 'Профиль' },
  ].find((entry) => entry.href === pathname);
  const title =
    item?.label ||
    (pathname.startsWith('/tickets/') ? 'Детали заявки' : 'ServiceDesk');
  useEffect(() => {
    setMenu(false);
  }, [pathname]);
  useEffect(() => {
    let timeout;
    function onTicketCreated() {
      clearTimeout(timeout);
      setTicketCreated(true);
      timeout = setTimeout(() => setTicketCreated(false), 2500);
    }
    window.addEventListener('servicedesk:ticket-created', onTicketCreated);
    return () => {
      window.removeEventListener('servicedesk:ticket-created', onTicketCreated);
      clearTimeout(timeout);
    };
  }, []);
  useEffect(() => {
    function outside(event) {
      if (!menuRef.current?.contains(event.target)) setMenu(false);
    }
    function escape(event) {
      if (event.key === 'Escape') setMenu(false);
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  return (
    <UserContext.Provider value={{ ...user, refreshUser: setUser }}>
      <div className={`app-shell ${sidebar.className}`}>
        <a
          className="skip-link"
          href="#main-content"
          inert={sidebar.mobile && sidebar.mobileOpen}
        >
          К основному содержимому
        </a>
        {sidebar.mobile && sidebar.mobileOpen && (
          <button
            className="sidebar-scrim"
            onClick={sidebar.close}
            tabIndex={-1}
            aria-label="Закрыть меню"
          />
        )}
        <aside
          className="sidebar"
          id="desk-sidebar"
          ref={sidebar.sidebarRef}
          inert={!sidebar.open}
          aria-hidden={!sidebar.open}
          aria-label="Навигация ServiceDesk"
        >
          <div className="sidebar-brand">
            <Brand />
          </div>
          <div className="workspace-label">
            <span className="workspace-dot" /> Корпоративное пространство
          </div>
          <p className="nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</p>
          <nav aria-label="Основная навигация">
            {navigation
              .filter((entry) => !entry.admin || user.role === 'ADMIN')
              .map(({ href, label, kind }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={sidebar.afterNavigate}
                  className={`nav-item ${pathname === href || (href === '/tickets' && pathname.startsWith('/tickets/') && pathname !== '/tickets/new') ? 'active' : ''}`}
                  aria-current={pathname === href ? 'page' : undefined}
                >
                  <AnimatedNavIcon kind={kind} success={kind === 'create' && ticketCreated} />
                  <span>{label}</span>
                  {pathname === href && <span className="nav-active-dot" />}
                </Link>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="support-note">
              <span className="support-icon">
                <ShieldCheck size={22} />
              </span>
              <strong>Центр поддержки</strong>
              <p>
                {user.role === 'EMPLOYEE'
                  ? 'Следите за ответами и статусом своих обращений'
                  : 'Просматривайте обращения пользователей и помогайте с решением'}
              </p>
              <Link
                href="/support"
                onClick={sidebar.afterNavigate}
                aria-current={pathname === '/support' ? 'page' : undefined}
              >
                {user.role === 'EMPLOYEE' ? 'Мои обращения' : 'Обращения пользователей'}
                <AnimatedNavIcon kind="support" size={14} />
              </Link>
            </div>
            <div className="sidebar-version">
              <span>ServiceDesk</span>
              <span>v1.0</span>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="topbar-start">
              <SidebarToggle sidebar={sidebar} />
              <span className="topbar-divider" />
              <span className="topbar-title">{title}</span>
            </div>
            <div
              className="topbar-end"
              inert={sidebar.mobile && sidebar.mobileOpen}
            >
              <span className="workspace-online">
                <i /> Рабочее пространство
              </span>
              <div className="avatar-menu" ref={menuRef}>
                <button
                  className="avatar-trigger"
                  aria-expanded={menu}
                  aria-haspopup="true"
                  onClick={() => setMenu((value) => !value)}
                >
                  <span className="avatar">{initials(user.name)}</span>
                  <span className="avatar-text">
                    <strong>{user.name}</strong>
                    <small>{roleLabels[user.role]}</small>
                  </span>
                  <ChevronDown size={15} />
                </button>
                {menu && (
                  <div className="profile-dropdown">
                    <p>{user.email}</p>
                    <Link href="/profile">
                      <AnimatedNavIcon kind="profile" size={16} /> Мой профиль
                    </Link>
                    <Link href="/settings">
                      <AnimatedNavIcon kind="settings" size={16} /> Настройки
                    </Link>
                    <button onClick={() => signOut({ callbackUrl: '/login' })}>
                      <AnimatedNavIcon kind="signout" size={16} /> Выйти из аккаунта
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>
          <main
            id="main-content"
            className="main-content"
            inert={sidebar.mobile && sidebar.mobileOpen}
          >
            {children}
          </main>
          <footer
            className="app-footer"
            inert={sidebar.mobile && sidebar.mobileOpen}
          >
            <span>© {new Date().getFullYear()} ServiceDesk</span>
            <span>
              <span className="footer-dot" /> Ваша команда. Ваш рабочий ритм.
            </span>
          </footer>
        </div>
      </div>
    </UserContext.Provider>
  );
}
