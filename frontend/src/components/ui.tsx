// Shared UI primitives for the "desk" system: controls are 6px-radius, cards
// 3px (paper), trays 10px. Colour only ever comes from people and urgency.

import {
  forwardRef,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn, initials, personInk, PRIORITY_LABEL, PRIORITY_LEVEL, STATUS_LABEL } from '../lib/utils';
import type { IssueStatus, Priority } from '../lib/types';

type ButtonVariant = 'primary' | 'ink' | 'ghost' | 'danger' | 'quiet';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-cobalt text-card hover:bg-cobalt-deep border-transparent',
  ink: 'bg-ink text-card hover:bg-ink-soft border-transparent',
  ghost: 'border-rule bg-transparent text-ink hover:border-ink hover:bg-card/60',
  danger: 'border-transparent bg-transparent text-alarm hover:bg-alarm-wash',
  quiet: 'border-transparent bg-transparent text-graphite hover:text-ink hover:bg-blotter-deep/70',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-sm gap-1.5',
  md: 'h-10 px-4 text-base gap-2',
  lg: 'h-12 px-5 text-lg gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-md border font-medium transition-[background-color,border-color,color,transform] duration-150',
        'active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45',
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

const FIELD =
  'w-full rounded-md border border-rule bg-card text-ink placeholder:text-graphite/80 transition-colors hover:border-graphite focus:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt/40';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(FIELD, 'h-10 px-3', className)} {...props} />;
});

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(FIELD, 'px-3 py-2.5 leading-relaxed', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(FIELD, 'h-10 w-auto cursor-pointer pl-3 pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ children, htmlFor, className }: { children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn('mb-1.5 block text-sm font-medium text-ink-soft', className)}>
      {children}
    </label>
  );
}

const PRIORITY_TEXT: Record<Priority, string> = { LOW: 'text-prio-low', MEDIUM: 'text-prio-medium', HIGH: 'text-prio-high', URGENT: 'text-prio-urgent' };
const PRIORITY_PIP: Record<Priority, string> = { LOW: 'bg-prio-low', MEDIUM: 'bg-prio-medium', HIGH: 'bg-prio-high', URGENT: 'bg-prio-urgent' };

/** Priority as three coloured pips; urgent issues get a solid red flag instead. */
export function PriorityMark({
  priority,
  showLabel = true,
  inverse = false,
  className,
}: {
  priority: Priority;
  showLabel?: boolean;
  inverse?: boolean;
  className?: string;
}) {
  const level = PRIORITY_LEVEL[priority];
  const urgent = priority === 'URGENT';
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs font-medium', inverse ? (urgent ? 'text-[#FF8F80]' : 'text-card') : PRIORITY_TEXT[priority], className)}
      title={`${PRIORITY_LABEL[priority]} priority`}
    >
      {urgent ? (
        <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
          <path d="M2 11V1.5h7.5L8 4l1.5 2.5H3.2" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      ) : (
        <span className="flex items-end gap-[2px]" aria-hidden="true">
          {[1, 2, 3].map((pip) => (
            <span
              key={pip}
              className={cn('w-[3px] rounded-[1px]', pip <= level ? (inverse ? 'bg-card' : PRIORITY_PIP[priority]) : inverse ? 'bg-card/30' : 'bg-rule')}
              style={{ height: 4 + pip * 2.5 }}
            />
          ))}
        </span>
      )}
      {showLabel ? PRIORITY_LABEL[priority] : <span className="sr-only">{PRIORITY_LABEL[priority]} priority</span>}
    </span>
  );
}

export function StatusText({ status, className }: { status: IssueStatus; className?: string }) {
  return <span className={cn('text-sm text-graphite', className)}>{STATUS_LABEL[status] ?? status}</span>;
}

export function Avatar({
  name,
  seed,
  size = 'md',
  className,
  ring,
}: {
  name: string;
  seed?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  ring?: boolean;
}) {
  const sizes = { xs: 'h-5 w-5 text-[9px]', sm: 'h-7 w-7 text-[11px]', md: 'h-8 w-8 text-xs', lg: 'h-11 w-11 text-sm' };
  return (
    <span
      title={name}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-card',
        ring && 'ring-2 ring-blotter',
        sizes[size],
        className,
      )}
      style={{ backgroundColor: personInk(seed ?? name) }}
    >
      {initials(name)}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-card bg-blotter-deep', className)} aria-hidden="true" />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-rule border-b-2 bg-card px-1 font-mono text-[10px] font-bold text-ink-soft">
      {children}
    </kbd>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-tray border-2 border-dashed border-rule px-6 py-10">
      <p className="display text-2xl text-ink">{title}</p>
      {hint && <p className="max-w-md text-graphite">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
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

/** Radio-group style switch with a sliding ink indicator. Arrow keys move the selection. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  render,
  className,
  vertical,
  tone,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  render?: (value: T, selected: boolean) => ReactNode;
  className?: string;
  vertical?: boolean;
  /** Colour of the selection marker per option (defaults to ink). */
  tone?: (value: T) => string;
}) {
  const group = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (event: KeyboardEvent, index: number) => {
    const next = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!next) return;
    event.preventDefault();
    const target = (index + next + options.length) % options.length;
    onChange(options[target]);
    refs.current[target]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('relative flex rounded-md bg-blotter-deep p-1 shadow-inset', vertical ? 'flex-col' : 'flex-row', className)}
    >
      {options.map((option, index) => {
        const selected = option === value;
        return (
          <button
            key={option}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option)}
            onKeyDown={(event) => onKey(event, index)}
            className={cn(
              'relative z-0 flex flex-1 items-center gap-2 whitespace-nowrap rounded-[4px] px-2.5 py-1.5 text-left text-sm transition-colors',
              selected ? 'text-card' : 'text-ink-soft hover:text-ink',
            )}
          >
            {selected && (
              <motion.span
                layoutId={`seg-${group}`}
                className="absolute inset-0 -z-10 rounded-[4px] bg-ink"
                style={tone ? { backgroundColor: tone(option) } : undefined}
                transition={{ type: 'spring', stiffness: 520, damping: 38 }}
              />
            )}
            {render ? render(option, selected) : option}
          </button>
        );
      })}
    </div>
  );
}
