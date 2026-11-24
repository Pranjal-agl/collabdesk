// Authed app shell: a slim top bar (wordmark, nav, connection, account) over
// a full-width work area, so the board gets every pixel.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { ChevronDown, LogOut, MonitorSmartphone, Search } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ws, type WsState } from '../lib/ws';
import { cn, knownName, rememberPerson, setDirectory } from '../lib/utils';
import { api } from '../lib/api';
import { usePeople } from '../lib/usePeople';
import { scrollToTop } from '../lib/smoothScroll';
import { CommandPalette, OPEN_PALETTE_EVENT } from './CommandPalette';
import { DEMO_MODE } from '../lib/config';
import { Avatar, Kbd } from './ui';

export function Layout() {
  const { user } = useAuth();
  const [conn, setConn] = useState<WsState>('DISCONNECTED');
  const location = useLocation();
  const outlet = useOutlet();
  usePeople();

  useEffect(() => ws.onState(setConn), []);
  useEffect(() => scrollToTop(), [location.pathname]);
  useEffect(() => {
    if (!user) return;
    api
      .listUsers()
      .then(setDirectory)
      .catch(() => undefined); // names fall back to presence + session
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // The JWT carries no display name, so the login form guesses one from the
    // email; prefer the real one from the directory/presence when we have it.
    if (user) rememberPerson(user.id, user.name, true);
  }, [user]);

  if (!user) return null;

  const nav = [
    { to: '/projects', label: 'Projects' },
    ...(user.role === 'ADMIN' ? [{ to: '/audit', label: 'Audit log' }] : []),
  ];

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-card">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-rule bg-blotter/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:gap-6 sm:px-6 lg:px-8">
          <NavLink to="/projects" className="flex items-center gap-2 rounded-md">
            <Logo />
            <span className="display hidden text-xl leading-none text-ink sm:inline">CollabDesk</span>
          </NavLink>

          <nav aria-label="Primary" className="flex items-center gap-1">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'relative whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-medium transition-colors sm:px-2.5',
                    isActive ? 'text-ink' : 'text-graphite hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {item.label}
                    {isActive && (
                      <motion.span layoutId="nav-underline" className="absolute inset-x-2.5 -bottom-[11px] h-[3px] rounded-full bg-ink" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
              className="flex h-9 items-center gap-2 rounded-md border border-rule bg-card/60 px-2.5 text-sm text-graphite transition-colors hover:border-graphite hover:text-ink"
              aria-keyshortcuts="Control+K Meta+K"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              <span className="hidden md:inline">Search</span>
              <span className="hidden items-center gap-0.5 md:flex">
                <Kbd>{navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'}</Kbd>
                <Kbd>K</Kbd>
              </span>
            </button>
            <ConnectionStatus state={conn} />
            <AccountMenu />
          </div>
        </div>
      </header>

      {DEMO_MODE && <DemoNotice />}

      <main id="main" className="relative mx-auto w-full max-w-[1440px] flex-1 px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        {/* popLayout keeps the outgoing page in the tree while the new one
            mounts, so shared elements (a project's title) can fly between them. */}
        <LayoutGroup>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.16, 1, 0.3, 1], delay: 0.05 } }}
              exit={{ opacity: 0, y: -10, transition: { duration: 0.16, ease: 'easeIn' } }}
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        </LayoutGroup>
      </main>
      <CommandPalette />
    </div>
  );
}

function ConnectionStatus({ state }: { state: WsState }) {
  const live = state === 'CONNECTED';
  const label = live ? 'Live' : state === 'CONNECTING' ? 'Reconnecting' : 'Offline';
  return (
    <span role="status" className="flex items-center gap-2 text-sm text-graphite" title={live ? 'Changes from teammates appear as they happen' : 'Trying to reach the server — your edits are still saved'}>
      <span className={cn('h-2 w-2 rounded-full', live ? 'bg-person-moss' : 'animate-blink bg-alarm')} aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </span>
  );
}

function DemoNotice() {
  const [hidden, setHidden] = useState(() => sessionStorage.getItem('cd_demo_notice') === 'hidden');
  if (hidden) return null;
  return (
    <div className="border-b border-rule bg-blotter-deep/60">
      <p className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-2 text-sm text-ink-soft sm:px-6 lg:px-8">
        <span>
          You’re in the demo workspace. Bob works alongside you, and everything resets when you reload.
        </span>
        <button
          type="button"
          className="ml-auto shrink-0 rounded px-1.5 text-graphite underline-offset-2 hover:text-ink hover:underline"
          onClick={() => {
            sessionStorage.setItem('cd_demo_notice', 'hidden');
            setHidden(true);
          }}
        >
          Dismiss
        </button>
      </p>
    </div>
  );
}

function AccountMenu() {
  const { user, logout, logoutAll } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!user) return null;
  const name = knownName(user.id) ?? user.name;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2 transition-colors hover:bg-blotter-deep"
      >
        <Avatar name={name} seed={user.id} size="sm" />
        <span className="hidden text-sm font-medium sm:inline">{name.split(' ')[0]}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-graphite transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className="paper absolute right-0 top-full mt-2 w-64 overflow-hidden shadow-lifted"
          >
            <div className="border-b border-rule/70 px-4 py-3">
              <p className="font-medium">{name}</p>
              <p className="truncate text-sm text-graphite">{user.email}</p>
              <p className="mt-1 text-xs text-graphite">{user.role === 'ADMIN' ? 'Admin' : 'Member'} of this workspace</p>
            </div>
            <MenuItem icon={<LogOut className="h-4 w-4" aria-hidden="true" />} onClick={() => void logout()}>
              Sign out
            </MenuItem>
            <MenuItem
              icon={<MonitorSmartphone className="h-4 w-4" aria-hidden="true" />}
              onClick={() => {
                if (confirm('Sign out on every device? Each active session ends immediately.')) void logoutAll();
              }}
            >
              Sign out on every device
            </MenuItem>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-ink-soft hover:bg-blotter/60 hover:text-ink">
      <span className="text-graphite">{icon}</span>
      {children}
    </button>
  );
}

/** Two index cards, one marked: the board, at favicon scale. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-7 w-7', className)} aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="#18211C" />
      <rect x="7" y="9" width="12" height="15" rx="1.5" fill="#FBFCF8" />
      <rect x="13" y="6" width="12" height="15" rx="1.5" fill="#E4F04A" stroke="#18211C" strokeWidth="1.5" />
    </svg>
  );
}
