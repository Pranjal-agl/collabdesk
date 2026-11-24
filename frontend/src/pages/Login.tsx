// Sign-in: split-screen showcase. Left side sells the product with animated
// mini-board + pillars; right side is the form. Demo mode offers one-click
// seeded credentials (including a cross-tenant user, to show isolation).

import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap, Radio, ShieldCheck, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../lib/auth';
import { DEMO_MODE } from '../lib/config';
import { ApiError } from '../lib/types';
import { Logo } from '../components/Layout';
import { Button, Input, Label, Magnetic } from '../components/ui';

const PILLARS = [
  { icon: Zap, title: 'Optimistic by default', body: 'Every mutation applies instantly and rolls back cleanly when the server disagrees.' },
  { icon: Radio, title: 'Real-time, reconnecting', body: 'Presence, live boards and comment threads over WebSockets with exponential-backoff recovery.' },
  { icon: ShieldCheck, title: 'Authorization, enforced', body: 'Row-level tenancy, rotating refresh tokens and server-side checks on every resource.' },
];

const DEMO_ACCOUNTS = [
  { email: 'alice@acme.com', password: 'admin123', label: 'Alice · Admin' },
  { email: 'bob@acme.com', password: 'admin123', label: 'Bob · Member' },
  { email: 'eve@evil.com', password: 'admin123', label: 'Eve · Other tenant' },
];

const MINI_CARDS = [
  { title: 'Ship v1 dashboard', col: 0, accent: 'border-indigo-400/40' },
  { title: 'Authz test matrix', col: 0, accent: 'border-rose-400/40' },
  { title: 'Optimistic rollback', col: 1, accent: 'border-cyan-400/40' },
  { title: 'Landing page copy', col: 2, accent: 'border-emerald-400/40' },
];

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(DEMO_MODE ? 'alice@acme.com' : '');
  const [password, setPassword] = useState(DEMO_MODE ? 'admin123' : '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/projects" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      toast.success(`Welcome back${email ? '' : ''}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen" role="main">
      {/* Brand panel */}
      <section className="relative hidden flex-1 flex-col justify-between overflow-hidden p-12 lg:flex" aria-hidden="true">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="font-display text-lg font-semibold tracking-tight text-white">CollabDesk</span>
        </div>

        <div className="max-w-lg">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-3 text-xs font-medium uppercase tracking-[0.3em] text-indigo-300/80"
          >
            Multi-tenant · Real-time · Conflict-safe
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-white"
          >
            Project management that <span className="text-gradient">never lies</span> to you.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-4 max-w-md text-sm leading-relaxed text-slate-400"
          >
            The UI shows the truth: optimistic updates reconcile with the server, live cursors of presence, and permissions enforced in the database — not hidden in the interface.
          </motion.p>

          {/* Animated mini board */}
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="mt-10 grid grid-cols-3 gap-3">
            {[0, 1, 2].map((col) => (
              <div key={col} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-2">
                <div className="mb-2 h-1.5 w-10 rounded-full bg-white/10" />
                {MINI_CARDS.filter((card) => card.col === col).map((card, i) => (
                  <motion.div
                    key={card.title}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: [0, -5, 0] }}
                    transition={{
                      opacity: { delay: 0.6 + col * 0.15 + i * 0.12 },
                      y: { delay: 1 + i * 0.4 + col * 0.2, duration: 4, repeat: Infinity, ease: 'easeInOut' },
                    }}
                    className={`mb-2 rounded-lg border ${card.accent} bg-ink-800/80 px-2.5 py-2 text-[11px] text-slate-300 shadow-card`}
                  >
                    {card.title}
                  </motion.div>
                ))}
              </div>
            ))}
          </motion.div>
        </div>

        <ul className="grid max-w-xl grid-cols-3 gap-4">
          {PILLARS.map((pillar, i) => (
            <motion.li
              key={pillar.title}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 + i * 0.12 }}
              className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5"
            >
              <pillar.icon className="mb-2 h-4 w-4 text-indigo-300" />
              <p className="text-xs font-semibold text-slate-200">{pillar.title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{pillar.body}</p>
            </motion.li>
          ))}
        </ul>
      </section>

      {/* Form panel */}
      <section className="flex w-full items-center justify-center px-6 lg:w-[480px] lg:shrink-0 lg:border-l lg:border-white/[0.07]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="glass-strong w-full max-w-sm p-8"
        >
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo />
            <span className="font-display text-lg font-semibold text-white">CollabDesk</span>
          </div>

          <p className="mb-1 text-xs font-medium uppercase tracking-[0.28em] text-indigo-300/80">Sign in</p>
          <h1 className="font-display text-2xl font-semibold text-white">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">Your board kept itself busy while you were away.</p>

          <form onSubmit={submit} className="mt-7 flex flex-col gap-4" noValidate={false}>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" />
            </div>

            {error && (
              <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3.5 py-2.5 text-xs text-rose-300">
                {error}
              </p>
            )}

            <Magnetic strength={0.18} className="w-full">
              <Button type="submit" size="lg" loading={loading} className="w-full" icon={!loading ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : undefined}>
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </Magnetic>
          </form>

          {DEMO_MODE && (
            <div className="mt-6 border-t border-white/[0.07] pt-5">
              <p className="mb-2.5 text-[11px] uppercase tracking-[0.18em] text-slate-500">One-click demo accounts</p>
              <div className="flex flex-wrap gap-2">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(account.password);
                      setError('');
                    }}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-indigo-400/40 hover:text-white"
                  >
                    {account.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
                Tip: open a second browser, sign in as Bob, and watch presence + live updates work across sessions. Eve belongs to another tenant — her data is unreachable.
              </p>
            </div>
          )}

          <button type="button" onClick={() => navigate('/projects')} className="sr-only">
            Continue
          </button>
        </motion.div>
      </section>
    </main>
  );
}
