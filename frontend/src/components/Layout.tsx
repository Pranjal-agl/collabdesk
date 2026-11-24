// Authed app shell: glass sidebar (nav, connection status, user), main outlet.

import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, ShieldCheck, LogOut, Globe, Wifi, WifiOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../lib/auth';
import { ws, type WsState } from '../lib/ws';
import { cn } from '../lib/utils';
import { Avatar, Button } from './ui';
import { DEMO_MODE } from '../lib/config';

const NAV = [
  { to: '/projects', label: 'Projects', icon: LayoutDashboard, end: true },
  { to: '/audit', label: 'Audit log', icon: ShieldCheck, adminOnly: true },
];

export function Layout() {
  const { user, logout, logoutAll } = useAuth();
  const [conn, setConn] = useState<WsState>('DISCONNECTED');
  const location = useLocation();

  useEffect(() => ws.onState(setConn), []);

  if (!user) return null;

  const live = conn === 'CONNECTED';

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/[0.07] bg-ink-900/40 px-4 py-6 backdrop-blur-xl md:flex">
        <NavLink to="/projects" className="mb-8 flex items-center gap-2.5 px-2">
          <Logo />
          <span className="font-display text-lg font-semibold tracking-tight text-white">CollabDesk</span>
        </NavLink>

        <nav className="flex flex-col gap-1" aria-label="Primary">
          {NAV.filter((item) => !item.adminOnly || user.role === 'ADMIN').map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all',
                  isActive
                    ? 'border border-white/10 bg-white/[0.07] text-white shadow-glow-sm'
                    : 'border border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-100',
                )
              }
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-4">
          {/* Connection status */}
          <div
            className={cn(
              'flex items-center gap-2.5 rounded-xl border px-3 py-2 text-xs',
              live ? 'border-emerald-400/20 bg-emerald-400/5 text-emerald-300' : 'border-amber-400/20 bg-amber-400/5 text-amber-300',
            )}
            role="status"
          >
            {live ? (
              <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 animate-pulse-dot" aria-hidden="true" />
            )}
            <span className="animate-pulse-dot">{live ? 'Live connection' : conn === 'CONNECTING' ? 'Reconnecting…' : 'Offline'}</span>
          </div>

          {DEMO_MODE && (
            <p className="rounded-xl border border-indigo-400/20 bg-indigo-400/5 px-3 py-2 text-[11px] leading-relaxed text-indigo-200/70">
              Demo mode — data lives in memory and a bot teammate works alongside you.
            </p>
          )}

          {/* User card */}
          <div className="glass p-3">
            <div className="flex items-center gap-3">
              <Avatar name={user.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{user.name}</p>
                <p className="truncate text-xs text-slate-500">{user.email}</p>
              </div>
            </div>
            <span className="mt-2 inline-block rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">
              {user.role}
            </span>
            <div className="mt-3 flex gap-2">
              <Button variant="ghost" size="sm" className="flex-1" onClick={logout} icon={<LogOut className="h-3.5 w-3.5" aria-hidden="true" />}>
                Log out
              </Button>
              <Button
                variant="subtle"
                size="sm"
                title="Sign out every device"
                aria-label="Sign out every device"
                onClick={() => {
                  if (confirm('Sign out every device? All active sessions will be revoked immediately.')) void logoutAll();
                }}
                icon={<Globe className="h-3.5 w-3.5" aria-hidden="true" />}
              />
            </div>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/[0.07] bg-ink-950/70 px-4 py-3 backdrop-blur-xl md:hidden">
          <NavLink to="/projects" className="flex items-center gap-2">
            <Logo />
            <span className="font-display font-semibold text-white">CollabDesk</span>
          </NavLink>
          <div className="flex items-center gap-3">
            <span className={cn('h-2 w-2 rounded-full', live ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse-dot')} title={live ? 'Live' : 'Reconnecting'} />
            <Avatar name={user.name} size="sm" />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8 md:py-10">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-7 w-7', className)} aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="#13131f" />
      <path d="M8 22V10l8 7 8-7v12" stroke="url(#logo-g)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
