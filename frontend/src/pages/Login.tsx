// Sign-in. The left side shows the product doing its one job: a teammate's
// cursor picks up a card and moves it, and the board marks what changed.
// Demo mode offers one-click seeded accounts, including a user from another
// company to show tenant isolation.

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from 'react';
import { Navigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../lib/auth';
import { DEMO_MODE } from '../lib/config';
import { ApiError, type Priority } from '../lib/types';
import { cn, personInk } from '../lib/utils';
import { Logo } from '../components/Layout';
import { Avatar, Button, Input, Label, PriorityMark } from '../components/ui';
import { CuttingMat, RevealLines, type MatPointer } from '../components/motion';

const DEMO_ACCOUNTS = [
  { id: '00000000-0000-0000-0000-000000000001', email: 'alice@acme.com', name: 'Alice Admin', note: 'Admin at Acme, sees the audit log' },
  { id: '00000000-0000-0000-0000-000000000002', email: 'bob@acme.com', name: 'Bob Member', note: 'Member at Acme' },
  { id: '00000000-0000-0000-0000-000000000003', email: 'eve@evil.com', name: 'Eve Attacker', note: 'Another company, can’t see Acme’s work' },
];

export function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const pageRef = useRef<HTMLElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const bobCursor = useRef<HTMLDivElement>(null);

  // The mat dents under your cursor and under Bob's scripted one.
  const getPointers = useCallback((): MatPointer[] => {
    const page = pageRef.current?.getBoundingClientRect();
    if (!page) return [];
    const list: MatPointer[] = [];
    if (pointer.current) list.push({ x: pointer.current.x, y: pointer.current.y, color: '#18211C' });
    const bob = bobCursor.current?.getBoundingClientRect();
    if (bob && bob.width > 0 && Number(getComputedStyle(bobCursor.current!).opacity) > 0.2) {
      list.push({ x: bob.left - page.left + 4, y: bob.top - page.top + 4, color: BOB_INK });
    }
    return list;
  }, []);

  if (user) return <Navigate to="/projects" replace />;

  const signIn = async (address: string, secret: string, key: string) => {
    setError('');
    setPending(key);
    try {
      await login(address.trim(), secret);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Couldn’t reach the server. Check your connection and try again.');
      setPending(null);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void signIn(email, password, 'form');
  };

  return (
    <main
      ref={pageRef}
      className="relative min-h-screen overflow-hidden"
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        pointer.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      }}
      onPointerLeave={() => {
        pointer.current = null;
      }}
    >
      <CuttingMat getPointers={getPointers} className="opacity-90 [mask-image:linear-gradient(90deg,black_0%,black_55%,transparent_80%)]" />
      <div className="relative mx-auto grid min-h-screen max-w-[1440px] grid-cols-1 gap-x-16 px-5 sm:px-8 lg:grid-cols-12 lg:px-12">
        {/* Story */}
        <section className="flex flex-col pt-8 lg:col-span-7 lg:pb-12 lg:pt-10">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="display text-xl leading-none">CollabDesk</span>
          </div>

          <div className="mt-12 lg:mt-auto">
            <h1 className="display-tight max-w-[11ch] text-[3.25rem] text-ink sm:text-4xl xl:text-[5.5rem]">
              <RevealLines lines={['See who', 'moved what,', 'the moment', 'they move it.']} delay={0.1} />
            </h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 max-w-[52ch] text-lg leading-relaxed text-ink-soft"
            >
              CollabDesk is a shared issue board for small teams. Drag a card and everyone sees it land. Edit at the same time and nobody’s work gets
              quietly overwritten.
            </motion.p>
          </div>

          <div className="mt-10 hidden md:block lg:mb-auto">
            <ScriptedBoard cursorRef={bobCursor} />
          </div>
        </section>

        {/* Form */}
        <section className="flex items-start pb-12 pt-10 lg:col-span-5 lg:items-center lg:pt-0">
          <motion.div
            initial={{ opacity: 0, y: 24, rotate: 1.5 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 160, damping: 22, delay: 0.35 }}
            className="paper w-full max-w-md p-7 sm:p-9"
          >
            <h2 className="display text-2xl">Sign in</h2>
            <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
              <div>
                <Label htmlFor="email">Work email</Label>
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
              </div>

              {error && (
                <p role="alert" className="rounded-md bg-alarm-wash px-3 py-2.5 text-sm text-alarm">
                  {error}
                </p>
              )}

              <Button type="submit" variant="primary" size="lg" loading={pending === 'form'} disabled={pending !== null} className="mt-1 w-full">
                Sign in
              </Button>
            </form>

            {DEMO_MODE && (
              <div className="mt-8 border-t border-rule/70 pt-6">
                <h3 className="font-medium">Or jump straight in as someone</h3>
                <p className="mt-1 text-sm text-graphite">Open a second browser as Bob to watch changes travel between you.</p>
                <ul className="mt-4 flex flex-col gap-1">
                  {DEMO_ACCOUNTS.map((account) => (
                    <li key={account.email}>
                      <button
                        type="button"
                        disabled={pending !== null}
                        onClick={() => void signIn(account.email, 'admin123', account.email)}
                        className="group flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-blotter/70 disabled:opacity-60"
                      >
                        <Avatar name={account.name} seed={account.id} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{account.name.split(' ')[0]}</span>
                          <span className="block text-sm text-graphite">{account.note}</span>
                        </span>
                        <span className="hidden shrink-0 text-sm font-medium text-cobalt opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 sm:inline">
                          {pending === account.email ? 'Signing in…' : 'Sign in'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        </section>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Scripted board: Bob drags "Write authz test matrix" from To do to In review.
// Pure illustration — hidden from assistive tech, static under reduced motion.
// ---------------------------------------------------------------------------

const BOB_INK = personInk('00000000-0000-0000-0000-000000000002');
const COLS = ['To do', 'In progress', 'In review'];
const MINI_INK = ['#4D5F86', '#B26B00', '#6C46C2'];
const MINI_WASH = ['#DCE3F0', '#F4E2BC', '#E5DCF6'];
const COL_LEFT = [0, 34, 68]; // % of board width
const CARD_W = 32; // %
const ROW_TOP = [46, 116, 186]; // px

type Card = { id: string; title: string; priority: Priority; col: number; row: number };
const STATIC_CARDS: Card[] = [
  { id: 'a', title: 'Accessibility audit', priority: 'URGENT', col: 0, row: 0 },
  { id: 'c', title: 'Prototype navigation', priority: 'MEDIUM', col: 1, row: 0 },
  { id: 'd', title: 'Rate-limit middleware', priority: 'HIGH', col: 1, row: 1 },
  { id: 'e', title: 'Optimistic rollback', priority: 'MEDIUM', col: 2, row: 0 },
];
const MOVER = { id: 'b', title: 'Write authz test matrix', priority: 'HIGH' as Priority };

// phase: 0 rest · 1 cursor on card · 2 lifted · 3 carried · 4 dropped + marked
const TIMELINE = [700, 650, 1100, 2900, 900];

function ScriptedBoard({ cursorRef }: { cursorRef: RefObject<HTMLDivElement> }) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState(reduce ? 4 : 0);

  useEffect(() => {
    if (reduce) return;
    const timer = setTimeout(() => setPhase((current) => (current + 1) % TIMELINE.length), TIMELINE[phase]);
    return () => clearTimeout(timer);
  }, [phase, reduce]);

  const moved = phase >= 3;
  const col = moved ? 2 : 0;
  const row = 1;
  const lifted = phase === 2 || phase === 3;
  const cardLeft = `calc(${COL_LEFT[col]}% + 8px)`;
  const cardTop = ROW_TOP[row];
  const counts = [moved ? 1 : 2, 2, moved ? 2 : 1];

  // Cursor: parks bottom-right, then rides on the card while carrying.
  const cursorLeft = phase === 0 ? '86%' : `calc(${COL_LEFT[col] + CARD_W * 0.62}% + 8px)`;
  const cursorTop = phase === 0 ? 300 : cardTop + 30;

  return (
    <div aria-hidden="true" className="relative h-[330px] w-full max-w-[720px] select-none">
      {COLS.map((label, index) => (
        <div
          key={label}
          className="absolute top-0 h-[290px] rounded-tray border-t-[3px] shadow-inset"
          style={{ left: `${COL_LEFT[index]}%`, width: `${CARD_W}%`, borderTopColor: MINI_INK[index], backgroundColor: `color-mix(in srgb, ${MINI_WASH[index]} 42%, #CBD2C8)` }}
        >
          <div className="flex items-center justify-between px-3 pt-2.5">
            <span className="display flex items-center gap-1.5 text-lg">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: MINI_INK[index] }} />
              {label}
            </span>
            <motion.span
              key={counts[index]}
              initial={{ y: -6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="rounded-full px-1.5 font-mono text-xs font-bold"
              style={{ backgroundColor: MINI_WASH[index], color: MINI_INK[index] }}
            >
              {counts[index]}
            </motion.span>
          </div>
        </div>
      ))}

      {STATIC_CARDS.map((card) => (
        <MiniCard key={card.id} card={card} style={{ left: `calc(${COL_LEFT[card.col]}% + 8px)`, top: ROW_TOP[card.row] }} />
      ))}

      {/* The card being moved */}
      <motion.div
        className="absolute z-10"
        style={{ width: `calc(${CARD_W}% - 16px)` }}
        initial={false}
        animate={{
          left: cardLeft,
          top: cardTop,
          rotate: lifted ? -3.5 : 0,
          scale: lifted ? 1.05 : 1,
          opacity: phase === 0 && !reduce ? [0, 1] : 1,
        }}
        transition={{
          left: phase === 0 ? { duration: 0 } : { type: 'spring', stiffness: 70, damping: 16 },
          top: phase === 0 ? { duration: 0 } : { type: 'spring', stiffness: 70, damping: 16 },
          rotate: { type: 'spring', stiffness: 260, damping: 18 },
          scale: { duration: 0.2 },
          opacity: { duration: 0.4 },
        }}
      >
        <div className={cn('paper px-3 py-2.5 transition-shadow duration-200', lifted && 'shadow-lifted')}>
          <PriorityMark priority={MOVER.priority} showLabel={false} />
          <p className="mt-1.5 text-sm font-medium leading-snug">
            <span key={phase === 4 ? 'marked' : 'plain'} className={phase === 4 ? 'marker-swipe' : undefined}>
              {MOVER.title}
            </span>
          </p>
          <motion.p
            initial={false}
            animate={{ opacity: phase === 4 ? 1 : 0, height: phase === 4 ? 'auto' : 0 }}
            className="overflow-hidden text-xs font-medium"
            style={{ color: BOB_INK }}
          >
            <span className="block pt-1.5">Bob moved this</span>
          </motion.p>
        </div>
      </motion.div>

      {/* Bob's cursor */}
      {!reduce && (
        <motion.div
          ref={cursorRef}
          className="absolute z-20"
          initial={false}
          animate={{ left: cursorLeft, top: cursorTop, opacity: phase === 4 ? 0 : 1 }}
          transition={{
            left: phase === 0 ? { duration: 0 } : { type: 'spring', stiffness: phase >= 3 ? 70 : 120, damping: 16 },
            top: phase === 0 ? { duration: 0 } : { type: 'spring', stiffness: phase >= 3 ? 70 : 120, damping: 16 },
            opacity: { duration: 0.3 },
          }}
        >
          <svg width="18" height="20" viewBox="0 0 18 20" style={{ color: BOB_INK }}>
            <path d="M1.5 1.5v15l4.2-3.6 2.7 6 2.6-1.2-2.6-5.8h5.6z" fill="currentColor" stroke="#FBFCF8" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          <span className="ml-3 inline-block -translate-y-1 rounded-[4px] px-1.5 py-0.5 text-xs font-semibold text-card" style={{ backgroundColor: BOB_INK }}>
            Bob
          </span>
        </motion.div>
      )}
    </div>
  );
}

function MiniCard({ card, style }: { card: Card; style: CSSProperties }) {
  return (
    <div className="paper absolute px-3 py-2.5" style={{ ...style, width: `calc(${CARD_W}% - 16px)` }}>
      <PriorityMark priority={card.priority} showLabel={false} />
      <p className="mt-1.5 text-sm font-medium leading-snug">{card.title}</p>
    </div>
  );
}
