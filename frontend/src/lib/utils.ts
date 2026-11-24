import type { IssueStatus, Priority } from './types';

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function uid(): string {
  return crypto.randomUUID();
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// People. Every teammate owns an ink colour, used for their avatar and for
// attributing live changes on the board. The backend has no user directory
// endpoint, so names are learned from the seed accounts, the session and
// presence broadcasts as they arrive.
// ---------------------------------------------------------------------------

export const PERSON_INKS = ['#2B3FD6', '#B8327F', '#2E7D4F', '#B97500', '#6A3FC8', '#0F7C86'] as const;

export function personInk(seed: string): string {
  let hash = 7;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return PERSON_INKS[Math.abs(hash) % PERSON_INKS.length];
}

const people = new Map<string, string>([
  ['00000000-0000-0000-0000-000000000001', 'Alice Admin'],
  ['00000000-0000-0000-0000-000000000002', 'Bob Member'],
  ['00000000-0000-0000-0000-000000000003', 'Eve Attacker'],
]);

const peopleListeners = new Set<() => void>();
let peopleVersion = 0;
let directory: { id: string; displayName: string }[] = [];

export function rememberPerson(id: string, name: string, onlyIfUnknown = false): void {
  if (!id || !name || (onlyIfUnknown && people.has(id)) || people.get(id) === name) return;
  people.set(id, name);
  peopleVersion++;
  peopleListeners.forEach((listener) => listener());
}

/** The workspace directory from /api/users: authoritative names + assignee list. */
export function setDirectory(list: { id: string; displayName: string }[]): void {
  directory = list;
  list.forEach((person) => people.set(person.id, person.displayName));
  peopleVersion++;
  peopleListeners.forEach((listener) => listener());
}

export function getDirectory(): { id: string; displayName: string }[] {
  return directory;
}

export function subscribePeople(listener: () => void): () => void {
  peopleListeners.add(listener);
  return () => peopleListeners.delete(listener);
}

export function getPeopleVersion(): number {
  return peopleVersion;
}

export function knownName(id: string): string | undefined {
  return people.get(id);
}

export function personName(id: string | null | undefined): string {
  if (!id) return 'Someone';
  return people.get(id) ?? 'A teammate';
}

export function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
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

// ---------------------------------------------------------------------------
// Issue vocabulary
// ---------------------------------------------------------------------------

export const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

/** Number of filled pips (out of 3) per priority; URGENT is flagged in red instead. */
export const PRIORITY_LEVEL: Record<Priority, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 3 };

export const STATUSES: IssueStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'];

export const STATUS_LABEL: Record<IssueStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
};

/** Each workflow stage has its own ink (tabs, markers) and wash (trays). */
export const STATUS_INK: Record<IssueStatus, string> = {
  TODO: '#4D5F86',
  IN_PROGRESS: '#B26B00',
  IN_REVIEW: '#6C46C2',
  DONE: '#2E7D4F',
  CANCELLED: '#5B6861',
};

export const STATUS_WASH: Record<IssueStatus, string> = {
  TODO: '#DCE3F0',
  IN_PROGRESS: '#F4E2BC',
  IN_REVIEW: '#E5DCF6',
  DONE: '#D3EADA',
  CANCELLED: '#DCE0DA',
};

/** Fill used for status in the project progress strips. */
export const STATUS_FILL: Record<IssueStatus, string> = {
  TODO: '#A9B6D2',
  IN_PROGRESS: '#E3A53B',
  IN_REVIEW: '#9C7CE2',
  DONE: '#2E7D4F',
  CANCELLED: '#C7CEC4',
};

const VERB: Record<string, string> = { CREATE: 'created', UPDATE: 'updated', DELETE: 'deleted', CREATED: 'created', UPDATED: 'updated', DELETED: 'deleted' };

/** "created issue", "deleted comment"… Accepts the backend's CREATE/UPDATE/DELETE
 *  actions and the older RESOURCE_VERBED style. */
export function describeAction(action: string, resourceType: string): string {
  const [maybeResource, maybeVerb] = action.split('_');
  const verb = VERB[action] ?? VERB[maybeVerb ?? ''];
  if (!verb) return action.toLowerCase().replaceAll('_', ' ');
  const resource = (VERB[action] ? resourceType : maybeResource ?? resourceType).toLowerCase();
  if (resource === 'comment' && verb === 'created') return 'commented';
  return `${verb} ${resource === 'comment' && verb === 'deleted' ? 'a comment' : resource === 'issue' ? 'an issue' : `a ${resource}`}`;
}

/** Audit payloads are the resource's title/body (backend) or a small JSON patch. */
export function describePayload(payload: string | null): string {
  if (!payload) return '';
  try {
    const value = JSON.parse(payload) as Record<string, unknown>;
    if (value && typeof value === 'object') {
      if (typeof value.title === 'string') return value.title;
      if (typeof value.status === 'string') return `Moved to ${STATUS_LABEL[value.status as IssueStatus] ?? value.status}`;
      return Object.entries(value).map(([key, val]) => `${key}: ${String(val)}`).join(', ');
    }
  } catch {
    /* plain text payload */
  }
  return payload;
}
