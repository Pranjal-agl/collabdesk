export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function uid(): string {
  return crypto.randomUUID();
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const AVATAR_GRADIENTS = [
  'from-indigo-500 to-cyan-400',
  'from-fuchsia-500 to-indigo-400',
  'from-cyan-400 to-emerald-400',
  'from-amber-400 to-rose-400',
  'from-violet-500 to-fuchsia-400',
];

export function avatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Stable color per priority, used by chips and the board accents. */
export const PRIORITY_STYLE: Record<string, { dot: string; text: string; chip: string }> = {
  URGENT: { dot: 'bg-rose-400', text: 'text-rose-300', chip: 'border-rose-400/30 bg-rose-400/10 text-rose-300' },
  HIGH: { dot: 'bg-orange-400', text: 'text-orange-300', chip: 'border-orange-400/30 bg-orange-400/10 text-orange-300' },
  MEDIUM: { dot: 'bg-amber-300', text: 'text-amber-200', chip: 'border-amber-300/30 bg-amber-300/10 text-amber-200' },
  LOW: { dot: 'bg-sky-400', text: 'text-sky-300', chip: 'border-sky-400/30 bg-sky-400/10 text-sky-300' },
};

export const STATUS_LABEL: Record<string, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
};
