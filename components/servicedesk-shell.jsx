'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { SidebarToggle, useSidebar } from './sidebar-controls';
import AnimatedNavIcon from './animated-nav-icon';
import SignOutDialog from './signout-dialog';
import { useLanguage } from './language-provider';
import { useCurrentDate } from './current-date';
import NotificationBell from './notification-bell';
import './header-controls.css';

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
  { href: '/', label: 'Обзор', kind: 'dashboard' },
  { href: '/tickets', label: 'Заявки', kind: 'tickets' },
  { href: '/tickets/new', label: 'Создать заявку', kind: 'create' },
  { href: '/team', label: 'Сотрудники', kind: 'team', admin: true },
  { href: '/reports', label: 'Отчёты', kind: 'reports', admin: true },
];

export function Brand({ compact = false }) {
  const { t } = useLanguage();
  return (
    <Link href="/" className="brand" aria-label={t('ServiceDesk — главная')}>
      <span className="brand-mark">
        <AnimatedNavIcon kind="headset" size={23} />
      </span>
      {!compact && (
        <span>
          Service<span className="brand-light">Desk</span>
          <small>{t('РАБОЧЕЕ ПРОСТРАНСТВО')}</small>
        </span>
      )}
    </Link>
  );
}

export default function ServiceDeskShell({ user: initialUser, children }) {
  const { t } = useLanguage();
  const today = useCurrentDate();
  const [user, setUser] = useState(initialUser);
  const [menu, setMenu] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [ticketCreated, setTicketCreated] = useState(false);
  const menuRef = useRef(null);
  const avatarTriggerRef = useRef(null);
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
  function cancelSignOut() {
    setConfirmSignOut(false);
    window.requestAnimationFrame(() => avatarTriggerRef.current?.focus());
  }
  function toggleAccountMenu() {
    const nextOpen = !menu;
    setMenu(nextOpen);
    if (nextOpen) {
      window.dispatchEvent(new CustomEvent('servicedesk:header-menu', { detail: 'account' }));
    }
  }
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
      if (event.key === 'Escape' && menu) {
        setMenu(false);
        avatarTriggerRef.current?.focus();
      }
    }
    function otherMenu(event) {
      if (event.detail !== 'account') setMenu(false);
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('servicedesk:header-menu', otherMenu);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('servicedesk:header-menu', otherMenu);
    };
  }, [menu]);
  return (
    <UserContext.Provider value={{ ...user, refreshUser: setUser }}>
      <div className={`app-shell ${sidebar.className}`}>
        <a
          className="skip-link"
          href="#main-content"
          inert={sidebar.mobile && sidebar.mobileOpen}
        >
          {t('К основному содержимому')}
        </a>
        {sidebar.mobile && sidebar.mobileOpen && (
          <button
            className="sidebar-scrim"
            onClick={sidebar.close}
            tabIndex={-1}
            aria-label={t('Закрыть меню')}
          />
        )}
        <aside
          className="sidebar"
          id="desk-sidebar"
          ref={sidebar.sidebarRef}
          inert={!sidebar.open}
          aria-hidden={!sidebar.open}
          aria-label={t('Навигация ServiceDesk')}
        >
          <div className="sidebar-brand">
            <Brand />
          </div>
          <div className="workspace-label">
            <span className="workspace-dot" /> {t('Корпоративное пространство')}
          </div>
          <p className="nav-caption">{t('РАБОЧЕЕ ПРОСТРАНСТВО')}</p>
          <nav aria-label={t('Основная навигация')}>
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
                  <span>{t(label)}</span>
                  {pathname === href && <span className="nav-active-dot" />}
                </Link>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="support-note">
              <span className="support-icon">
                <ShieldCheck size={22} />
              </span>
              <strong>{t('Центр поддержки')}</strong>
              <p>
                {t(user.role === 'EMPLOYEE'
                  ? 'Следите за ответами и статусом своих обращений'
                  : 'Просматривайте обращения пользователей и помогайте с решением')}
              </p>
              <Link
                href="/support"
                onClick={sidebar.afterNavigate}
                aria-current={pathname === '/support' ? 'page' : undefined}
              >
                {t(user.role === 'EMPLOYEE' ? 'Мои обращения' : 'Обращения пользователей')}
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
          <header className="topbar" ref={sidebar.headerRef}>
            <div className="topbar-start">
              <SidebarToggle sidebar={sidebar} />
              <span className="topbar-divider" />
              <span className="topbar-title">{t(title)}</span>
            </div>
            <div className="topbar-end">
              <span className="workspace-online">
                <i /> {t('Рабочее пространство')}
              </span>
              <NotificationBell user={user} onNavigate={sidebar.afterNavigate} />
              <div className="avatar-menu" ref={menuRef}>
                <button
                  type="button"
                  className="avatar-trigger"
                  ref={avatarTriggerRef}
                  data-header-menu-trigger
                  aria-label={t('Меню аккаунта')}
                  title={`${user.name} · ${t(roleLabels[user.role])}`}
                  aria-expanded={menu}
                  aria-controls={menu ? 'account-dropdown' : undefined}
                  aria-haspopup="true"
                  onClick={toggleAccountMenu}
                >
                  <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
                </button>
                {menu && (
                  <div className="profile-dropdown" id="account-dropdown">
                    <div className="profile-dropdown-summary">
                      <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
                      <div>
                        <strong>{user.name}</strong>
                        <small>{t(roleLabels[user.role])}</small>
                      </div>
                    </div>
                    <p>{user.email}</p>
                    <Link href="/profile" onClick={() => { setMenu(false); sidebar.afterNavigate(); }}>
                      <AnimatedNavIcon kind="profile" size={16} /> {t('Мой профиль')}
                    </Link>
                    <Link href="/settings" onClick={() => { setMenu(false); sidebar.afterNavigate(); }}>
                      <AnimatedNavIcon kind="settings" size={16} /> {t('Настройки')}
                    </Link>
                    <button onClick={() => { setMenu(false); setConfirmSignOut(true); }}>
                      <AnimatedNavIcon kind="signout" size={16} /> {t('Выйти из аккаунта')}
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
            <span>© {today.slice(0, 4)} ServiceDesk</span>
            <span>
              <span className="footer-dot" /> {t('Ваша команда. Ваш рабочий ритм.')}
            </span>
          </footer>
        </div>
      </div>
      {confirmSignOut && <SignOutDialog onClose={cancelSignOut} />}
    </UserContext.Provider>
  );
}
