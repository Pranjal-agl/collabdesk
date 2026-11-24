// Shared UI primitives. Small, composable, dark-glass aesthetic.

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { cn, initials, avatarGradient, PRIORITY_STYLE, STATUS_LABEL } from '../lib/utils';
import type { IssueStatus, Priority } from '../lib/types';

type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-indigo-500 to-cyan-400 text-ink-950 font-semibold shadow-glow-sm hover:shadow-glow hover:brightness-110 border-transparent',
  ghost: 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.09] hover:border-white/20',
  danger: 'border-rose-400/30 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20',
  subtle: 'border-transparent bg-transparent text-slate-400 hover:text-slate-100 hover:bg-white/5',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl border font-medium transition-all duration-200',
        'disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
});

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-xl border border-white/10 bg-ink-900/60 px-3.5 text-sm text-slate-100',
        'placeholder:text-slate-500 transition-colors hover:border-white/20 focus:border-indigo-400/60',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-xl border border-white/10 bg-ink-900/60 px-3.5 py-2.5 text-sm text-slate-100',
        'placeholder:text-slate-500 transition-colors hover:border-white/20 focus:border-indigo-400/60',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-10 rounded-xl border border-white/10 bg-ink-900/60 px-3 text-sm text-slate-100',
        'transition-colors hover:border-white/20 focus:border-indigo-400/60 [&>option]:bg-ink-900',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
      {children}
    </label>
  );
}

export function PriorityChip({ priority, className }: { priority: Priority; className?: string }) {
  const style = PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.MEDIUM;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        style.chip,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} aria-hidden="true" />
      {priority}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: IssueStatus; className?: string }) {
  return (
    <span className={cn('rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-slate-300', className)}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Avatar({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = { sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs', lg: 'h-11 w-11 text-sm' };
  return (
    <span
      title={name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-ink-950 ring-2 ring-ink-950',
        avatarGradient(name),
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-white/5', className)}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-xs font-medium uppercase tracking-[0.28em] text-indigo-300/80">{children}</p>
  );
}

/** Animated counter used by the dashboard stats. */
export function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="glass px-5 py-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold text-white">
        <motion.span
          key={value}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        >
          {value}
        </motion.span>
      </p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
      <div className="text-slate-500">{icon}</div>
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {hint && <p className="max-w-xs text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Politely announces dynamic updates (new issues, comments, presence) to screen readers. */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div aria-live="polite" className="sr-only">
      {message}
    </div>
  );
}

/** Magnetic hover: element is gently pulled toward the cursor on fine pointers. */
export function Magnetic({ children, strength = 0.3, className }: { children: ReactNode; strength?: number; className?: string }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 220, damping: 16, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 220, damping: 16, mass: 0.4 });

  return (
    <motion.div
      className={cn('inline-block', className)}
      style={{ x: springX, y: springY }}
      onMouseMove={(event) => {
        if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
        const rect = event.currentTarget.getBoundingClientRect();
        x.set((event.clientX - (rect.left + rect.width / 2)) * strength);
        y.set((event.clientY - (rect.top + rect.height / 2)) * strength);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}
