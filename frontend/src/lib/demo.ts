// In-browser mock of the CollabDesk backend for demo mode (VITE_DEMO_MODE=true).
// It implements the exact REST + WebSocket contract the Spring Boot service
// exposes — same DTOs, same optimistic-locking 409s, same STOMP topics — plus
// a bot teammate ("Bob") that creates issues and comments while you watch, so
// the real-time story is visible in a solo demo. Data lives in memory and
// resets on reload, exactly like the H2 dev database on a fresh boot.

import {
  ApiError,
  type Api,
  type AuditLog,
  type AuthResponse,
  type Comment,
  type Issue,
  type Page,
  type Priority,
  type Project,
  type SessionUser,
  type UserRole,
} from './types';
import { uid } from './utils';

// ---------------------------------------------------------------------------
// Seed data (mirrors backend/src/main/resources/data.sql, plus extra rows so
// the board looks alive)
// ---------------------------------------------------------------------------

interface DemoUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  password: string;
  tokenVersion: number;
}

const T_ACME = 'aaaaaaaa-0000-0000-0000-000000000001';
const T_EVIL = 'bbbbbbbb-0000-0000-0000-000000000002';

const users: DemoUser[] = [
  { id: '00000000-0000-0000-0000-000000000001', tenantId: T_ACME, email: 'alice@acme.com', name: 'Alice Admin', role: 'ADMIN', password: 'admin123', tokenVersion: 0 },
  { id: '00000000-0000-0000-0000-000000000002', tenantId: T_ACME, email: 'bob@acme.com', name: 'Bob Member', role: 'MEMBER', password: 'admin123', tokenVersion: 0 },
  { id: '00000000-0000-0000-0000-000000000003', tenantId: T_EVIL, email: 'eve@evil.com', name: 'Eve Attacker', role: 'MEMBER', password: 'admin123', tokenVersion: 0 },
];

const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

let projects: Project[] = [
  { id: '10000000-0000-0000-0000-000000000001', name: 'CollabDesk Launch', description: 'Acme product launch board', createdBy: users[0].id, createdAt: iso(1000 * 60 * 60 * 24 * 21), version: 0 },
  { id: '10000000-0000-0000-0000-000000000002', name: 'Mobile App Redesign', description: 'Quarter-two redesign of the customer-facing mobile app', createdBy: users[0].id, createdAt: iso(1000 * 60 * 60 * 24 * 9), version: 0 },
  { id: '10000000-0000-0000-0000-000000000003', name: 'Platform API v2', description: 'Public API overhaul: versioning, rate limits, webhooks', createdBy: users[1].id, createdAt: iso(1000 * 60 * 60 * 24 * 4), version: 0 },
  { id: '20000000-0000-0000-0000-000000000001', name: 'Evil Campaign', description: 'Evil Corp private board — cross-tenant access should fail here', createdBy: users[2].id, createdAt: iso(1000 * 60 * 60 * 24 * 12), version: 0 },
];

let issues: Issue[] = [
  { id: '30000000-0000-0000-0000-000000000001', projectId: '10000000-0000-0000-0000-000000000001', title: 'Ship v1 dashboard', description: 'Prepare demo-ready dashboard flow with live presence.', status: 'IN_PROGRESS', priority: 'HIGH', assigneeId: users[0].id, createdBy: users[0].id, createdAt: iso(1000 * 60 * 60 * 50), updatedAt: iso(1000 * 60 * 22), version: 1 },
  { id: '30000000-0000-0000-0000-000000000002', projectId: '10000000-0000-0000-0000-000000000001', title: 'Write authz test matrix', description: 'Cover admin/member/author cases for every endpoint.', status: 'TODO', priority: 'URGENT', assigneeId: users[1].id, createdBy: users[0].id, createdAt: iso(1000 * 60 * 60 * 47), updatedAt: iso(1000 * 60 * 60 * 47), version: 0 },
  { id: '30000000-0000-0000-0000-000000000003', projectId: '10000000-0000-0000-0000-000000000001', title: 'Optimistic rollback demo', description: 'Force a 409 and show the card snapping back.', status: 'IN_REVIEW', priority: 'MEDIUM', assigneeId: users[0].id, createdBy: users[1].id, createdAt: iso(1000 * 60 * 60 * 30), updatedAt: iso(1000 * 60 * 95), version: 2 },
  { id: '30000000-0000-0000-0000-000000000004', projectId: '10000000-0000-0000-0000-000000000001', title: 'Landing page copy', description: null, status: 'DONE', priority: 'LOW', assigneeId: null, createdBy: users[0].id, createdAt: iso(1000 * 60 * 60 * 72), updatedAt: iso(1000 * 60 * 60 * 20), version: 3 },
  { id: '30000000-0000-0000-0000-000000000005', projectId: '10000000-0000-0000-0000-000000000002', title: 'Design token pipeline', description: 'Export Figma tokens to Tailwind config automatically.', status: 'TODO', priority: 'HIGH', assigneeId: users[1].id, createdBy: users[0].id, createdAt: iso(1000 * 60 * 60 * 26), updatedAt: iso(1000 * 60 * 60 * 26), version: 0 },
  { id: '30000000-0000-0000-0000-000000000006', projectId: '10000000-0000-0000-0000-000000000002', title: 'Prototype navigation v3', description: 'Bottom-sheet navigation, spring physics.', status: 'IN_PROGRESS', priority: 'MEDIUM', assigneeId: users[0].id, createdBy: users[1].id, createdAt: iso(1000 * 60 * 60 * 18), updatedAt: iso(1000 * 60 * 40), version: 1 },
  { id: '30000000-0000-0000-0000-000000000007', projectId: '10000000-0000-0000-0000-000000000002', title: 'Accessibility audit', description: 'Run the full flow with VoiceOver + TalkBack.', status: 'TODO', priority: 'URGENT', assigneeId: null, createdBy: users[0].id, createdAt: iso(1000 * 60 * 60 * 12), updatedAt: iso(1000 * 60 * 60 * 12), version: 0 },
  { id: '30000000-0000-0000-0000-000000000008', projectId: '10000000-0000-0000-0000-000000000003', title: 'Rate-limit middleware', description: 'Per-tenant token bucket ahead of the controllers.', status: 'IN_PROGRESS', priority: 'HIGH', assigneeId: users[1].id, createdBy: users[1].id, createdAt: iso(1000 * 60 * 60 * 8), updatedAt: iso(1000 * 60 * 14), version: 1 },
  { id: '30000000-0000-0000-0000-000000000009', projectId: '10000000-0000-0000-0000-000000000003', title: 'Webhook delivery queue', description: 'At-least-once delivery with signed payloads.', status: 'TODO', priority: 'MEDIUM', assigneeId: null, createdBy: users[0].id, createdAt: iso(1000 * 60 * 60 * 6), updatedAt: iso(1000 * 60 * 60 * 6), version: 0 },
  { id: '30000000-0000-0000-0000-000000000010', projectId: '10000000-0000-0000-0000-000000000003', title: 'API changelog page', description: null, status: 'DONE', priority: 'LOW', assigneeId: users[0].id, createdBy: users[1].id, createdAt: iso(1000 * 60 * 60 * 30), updatedAt: iso(1000 * 60 * 60 * 5), version: 2 },
  { id: '40000000-0000-0000-0000-000000000001', projectId: '20000000-0000-0000-0000-000000000001', title: 'Steal roadmap', description: 'Cross-tenant access should fail for this issue.', status: 'TODO', priority: 'MEDIUM', assigneeId: users[2].id, createdBy: users[2].id, createdAt: iso(1000 * 60 * 60 * 10), updatedAt: iso(1000 * 60 * 60 * 10), version: 0 },
];

let comments: Comment[] = [
  { id: '50000000-0000-0000-0000-000000000001', issueId: '30000000-0000-0000-0000-000000000001', authorId: users[1].id, body: 'Presence avatars are live on this board now — watch the top of the page.', createdAt: iso(1000 * 60 * 30), version: 0 },
  { id: '50000000-0000-0000-0000-000000000002', issueId: '30000000-0000-0000-0000-000000000001', authorId: users[0].id, body: 'Pushing the optimistic rollback demo tomorrow.', createdAt: iso(1000 * 60 * 18), version: 0 },
  { id: '50000000-0000-0000-0000-000000000003', issueId: '30000000-0000-0000-0000-000000000006', authorId: users[0].id, body: 'Spring physics feel right at stiffness 260, damping 28.', createdAt: iso(1000 * 60 * 55), version: 0 },
];

let auditLogs: AuditLog[] = [
  { id: uid(), actorId: users[0].id, action: 'CREATE', resourceType: 'ISSUE', resourceId: '30000000-0000-0000-0000-000000000008', payload: 'Rate-limit middleware', createdAt: iso(1000 * 60 * 60 * 8) },
  { id: uid(), actorId: users[1].id, action: 'UPDATE', resourceType: 'ISSUE', resourceId: '30000000-0000-0000-0000-000000000001', payload: 'Ship v1 dashboard', createdAt: iso(1000 * 60 * 22) },
  { id: uid(), actorId: users[0].id, action: 'CREATE', resourceType: 'COMMENT', resourceId: '50000000-0000-0000-0000-000000000002', payload: 'Pushing the optimistic rollback demo tomorrow.', createdAt: iso(1000 * 60 * 18) },
];

// ---------------------------------------------------------------------------
// Simulated network + WebSocket bus
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const latency = () => sleep(90 + Math.random() * 200);

type Handler = (msg: unknown) => void;
const topicHandlers = new Map<string, Set<Handler>>();

function emit(topic: string, msg: unknown): void {
  // Serialize like a real STOMP frame, so subscribers never share (and later
  // see mutations of) the mock's internal objects.
  topicHandlers.get(topic)?.forEach((handler) => handler(structuredClone(msg)));
}

interface PresenceEntry {
  sessionId: string;
  user: { userId: string; displayName: string };
  projectId: string;
}
const presenceBySession = new Map<string, PresenceEntry[]>();

function broadcastPresence(projectId: string): void {
  const seen = new Map<string, string>();
  for (const entries of presenceBySession.values()) {
    for (const entry of entries) {
      if (entry.projectId === projectId) seen.set(entry.user.userId, entry.user.displayName);
    }
  }
  // The bot teammate "sits" on any Acme board someone else is viewing.
  const bot = botUser();
  const project = projects.find((candidate) => candidate.id === projectId);
  if (botEnabled && seen.size > 0 && !seen.has(bot.id) && project && projectBelongsTo(projectId, bot.tenantId)) {
    seen.set(bot.id, bot.name);
  }
  emit(`/topic/presence/${projectId}`, {
    projectId,
    users: [...seen.entries()].map(([userId, displayName]) => ({ userId, displayName })),
  });
}

export const demoBus = {
  async connect(_sessionId: string): Promise<void> {
    await latency();
  },
  subscribe(topic: string, handler: Handler): () => void {
    let set = topicHandlers.get(topic);
    if (!set) topicHandlers.set(topic, (set = new Set()));
    set.add(handler);
    return () => set!.delete(handler);
  },
  publish(sessionId: string | null, destination: string, body: unknown): void {
    const relay = destination.match(/^\/app\/(cursor|typing)\/([^/]+)$/);
    if (relay) {
      const user = currentUser();
      if (!user) return;
      const [, kind, id] = relay;
      const payload = (body ?? {}) as Record<string, unknown>;
      if (kind === 'cursor') {
        emit(`/topic/cursors/${id}`, { userId: user.id, displayName: user.name, gone: !!payload.gone, x: payload.x, y: payload.y, dragging: payload.dragging ?? null });
      } else {
        emit(`/topic/typing/${id}`, { userId: user.id, displayName: user.name, typing: !!payload.typing });
      }
      return;
    }
    const presenceMatch = destination.match(/^\/app\/presence\/([^/]+)\/(join|leave)$/);
    if (!presenceMatch || !sessionId) return;
    const [, projectId, action] = presenceMatch;
    let entries = presenceBySession.get(sessionId) ?? [];
    if (action === 'join') {
      const user = currentUser();
      if (!user) return;
      entries = entries.filter((entry) => entry.projectId !== projectId);
      entries.push({ sessionId, user: { userId: user.id, displayName: user.name }, projectId });
      presenceBySession.set(sessionId, entries);
    } else {
      entries = entries.filter((entry) => entry.projectId !== projectId);
      presenceBySession.set(sessionId, entries);
    }
    broadcastPresence(projectId);
  },
  disconnect(sessionId: string): void {
    const entries = presenceBySession.get(sessionId) ?? [];
    presenceBySession.delete(sessionId);
    const projectsSeen = new Set(entries.map((entry) => entry.projectId));
    projectsSeen.forEach(broadcastPresence);
  },
};

// ---------------------------------------------------------------------------
// Auth (fake JWT-shaped tokens, real rotation semantics)
// ---------------------------------------------------------------------------

const b64 = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, '');

function makeAccessToken(user: DemoUser): string {
  const iat = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role,
    tokenVersion: user.tokenVersion,
    email: user.email,
    name: user.name,
    iat,
    exp: iat + 900, // 15 min, like the real backend
  };
  // header.payload.signature shape, so the shared decoder (split('.')[1]) works.
  return `${b64({ alg: 'none' })}.${b64(payload)}.demo`;
}

interface RefreshRecord {
  token: string;
  userId: string;
  expiresAt: number;
  revoked: boolean;
}
const refreshRecords = new Map<string, RefreshRecord>();

function issueRefreshToken(userId: string): string {
  const token = `rt_${uid()}`;
  refreshRecords.set(token, { token, userId, expiresAt: Date.now() + 7 * 24 * 3600 * 1000, revoked: false });
  return token;
}

let currentClaims: (SessionUser & { tokenVersion: number }) | null = null;

function currentUser(): DemoUser | null {
  if (!currentClaims) return null;
  return users.find((user) => user.id === currentClaims!.id) ?? null;
}

function bearer(): SessionUser & { tokenVersion: number } {
  if (!currentClaims) throw new ApiError(401, 'Not authenticated');
  return currentClaims;
}

function setClaimsFromToken(token: string): void {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    currentClaims = {
      id: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      email: payload.email,
      name: payload.name,
      tokenVersion: payload.tokenVersion,
    };
  } catch {
    throw new ApiError(401, 'Invalid token');
  }
}

function recordAudit(action: string, resourceType: string, resourceId: string | null, payload: string | null): void {
  auditLogs.unshift({ id: uid(), actorId: bearer().id, action, resourceType, resourceId, payload, createdAt: new Date().toISOString() });
}

// ---------------------------------------------------------------------------
// Bot teammate — keeps the real-time features alive during a solo demo
// ---------------------------------------------------------------------------

const BOT_TITLES: Array<[string, Priority]> = [
  ['Tighten empty states', 'LOW'],
  ['Add loading skeletons to reports', 'MEDIUM'],
  ['Investigate stale websocket reconnects', 'HIGH'],
  ['Fix contrast on priority chips', 'MEDIUM'],
  ['Draft rollback demo script', 'LOW'],
  ['Spike: optimistic comment ordering', 'HIGH'],
];

const BOT_COMMENTS = [
  'Taking this one — will push a first pass shortly.',
  'Looks good. One nit: can we keep the optimistic state until the 304 comes back?',
  'Confirmed this works after a hard refresh.',
  'I can repro the race when two tabs move the same card — rollback handles it correctly.',
  'Adding this to the launch checklist.',
  'Nice — the presence roster updates within a second of the socket reconnecting.',
];

let botEnabled = true;

/** The bot plays Bob — or Alice, when you're signed in as Bob. */
function botUser(): DemoUser {
  return currentClaims?.id === users[1].id ? users[0] : users[1];
}

const FLOW: Issue['status'][] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
type Point = { x: number; y: number };
const botCursor = new Map<string, Point>();

/** Rough position of a card on the client's board, in the cursor coordinate
 *  space (x = fraction of board width, y = px from the board top). */
function cardPoint(projectId: string, issue: Issue): Point {
  const column = Math.max(0, FLOW.indexOf(issue.status));
  const row = issues.filter((candidate) => candidate.projectId === projectId && candidate.status === issue.status).indexOf(issue);
  return { x: (column + 0.55) / 4, y: 78 + Math.max(0, row) * 116 + 40 };
}

function emitCursor(projectId: string, point: Point, dragging: string | null): void {
  const bot = botUser();
  emit(`/topic/cursors/${projectId}`, { userId: bot.id, displayName: bot.name, gone: false, x: point.x, y: point.y, dragging });
}

/** Glide the bot's cursor with an ease-in-out curve and a little hand wobble. */
async function glide(projectId: string, to: Point, ms: number, dragging: string | null = null): Promise<void> {
  const from = botCursor.get(projectId) ?? { x: 0.92, y: 420 };
  const steps = Math.max(1, Math.round(ms / 33));
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const wobble = Math.sin(t * Math.PI) * 6;
    const point = { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased - wobble };
    emitCursor(projectId, point, dragging);
    await sleep(33);
  }
  botCursor.set(projectId, to);
}

function liveProjectsForBot(): string[] {
  const live = new Set<string>();
  for (const entries of presenceBySession.values()) {
    for (const entry of entries) live.add(entry.projectId);
  }
  return [...live].filter((projectId) => projectBelongsTo(projectId, botUser().tenantId));
}

async function botMove(projectId: string): Promise<void> {
  const movable = issues.filter((issue) => issue.projectId === projectId && issue.status !== 'DONE' && issue.status !== 'CANCELLED');
  if (movable.length === 0) return botCreate(projectId);
  const issue = movable[Math.floor(Math.random() * movable.length)];
  const bot = botUser();
  await glide(projectId, cardPoint(projectId, issue), 900);
  await sleep(260);
  const next = FLOW[FLOW.indexOf(issue.status) + 1] ?? 'DONE';
  const landing = cardPoint(projectId, { ...issue, status: next } as Issue);
  const targetRows = issues.filter((candidate) => candidate.projectId === projectId && candidate.status === next).length;
  await glide(projectId, { x: landing.x, y: 78 + targetRows * 116 + 40 }, 1300, issue.id);
  if (!issues.includes(issue) || issue.status === 'CANCELLED') {
    emitCursor(projectId, botCursor.get(projectId)!, null);
    return; // deleted or changed under us while "dragging"
  }
  issue.status = next;
  issue.version += 1;
  issue.updatedAt = new Date().toISOString();
  auditLogs.unshift({ id: uid(), actorId: bot.id, action: 'UPDATE', resourceType: 'ISSUE', resourceId: issue.id, payload: issue.title, createdAt: issue.updatedAt });
  emit(`/topic/issues/${projectId}`, { type: 'UPDATED', data: issue, actorId: bot.id });
  emitCursor(projectId, botCursor.get(projectId)!, null);
}

async function botCreate(projectId: string): Promise<void> {
  const bot = botUser();
  await glide(projectId, { x: 0.25, y: -60 }, 900);
  await sleep(700);
  const [title, priority] = BOT_TITLES[Math.floor(Math.random() * BOT_TITLES.length)];
  const issue: Issue = {
    id: uid(),
    projectId,
    title,
    description: null,
    status: 'TODO',
    priority,
    assigneeId: Math.random() < 0.5 ? bot.id : null,
    createdBy: bot.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 0,
  };
  issues.unshift(issue);
  auditLogs.unshift({ id: uid(), actorId: bot.id, action: 'CREATE', resourceType: 'ISSUE', resourceId: issue.id, payload: title, createdAt: issue.createdAt });
  emit(`/topic/issues/${projectId}`, { type: 'CREATED', data: issue, actorId: bot.id });
  await glide(projectId, cardPoint(projectId, issue), 700);
}

async function botComment(projectId: string): Promise<void> {
  const candidates = issues.filter((issue) => issue.projectId === projectId);
  if (candidates.length === 0) return;
  // Prefer an issue someone has open, so the typing indicator is visible.
  const watched = candidates.filter((issue) => (topicHandlers.get(`/topic/typing/${issue.id}`)?.size ?? 0) > 0);
  const pool = watched.length > 0 ? watched : candidates;
  const issue = pool[Math.floor(Math.random() * pool.length)];
  const bot = botUser();
  emit(`/topic/typing/${issue.id}`, { userId: bot.id, displayName: bot.name, typing: true });
  await sleep(2600 + Math.random() * 1200);
  emit(`/topic/typing/${issue.id}`, { userId: bot.id, displayName: bot.name, typing: false });
  if (!issues.includes(issue)) return;
  const comment: Comment = {
    id: uid(),
    issueId: issue.id,
    authorId: bot.id,
    body: BOT_COMMENTS[Math.floor(Math.random() * BOT_COMMENTS.length)],
    createdAt: new Date().toISOString(),
    version: 0,
  };
  comments.push(comment);
  auditLogs.unshift({ id: uid(), actorId: bot.id, action: 'CREATE', resourceType: 'COMMENT', resourceId: comment.id, payload: comment.body, createdAt: comment.createdAt });
  emit(`/topic/issues/${issue.id}/comments`, { type: 'CREATED', data: comment });
}

async function botWander(projectId: string): Promise<void> {
  const here = botCursor.get(projectId) ?? { x: 0.8, y: 300 };
  const to = {
    x: Math.min(0.97, Math.max(0.03, here.x + (Math.random() - 0.5) * 0.35)),
    y: Math.min(560, Math.max(30, here.y + (Math.random() - 0.5) * 220)),
  };
  await glide(projectId, to, 700 + Math.random() * 700);
}

async function startBot(): Promise<void> {
  let nextActionAt = Date.now() + 5000;
  let firstAction = true; // open with a drag: the clearest demo of live collaboration
  for (;;) {
    await sleep(900 + Math.random() * 900);
    if (!botEnabled || !currentClaims) continue;
    const live = liveProjectsForBot();
    if (live.length === 0) continue;
    const projectId = live[Math.floor(Math.random() * live.length)];
    try {
      if (Date.now() < nextActionAt) {
        await botWander(projectId);
        continue;
      }
      const roll = firstAction ? 0 : Math.random();
      firstAction = false;
      if (roll < 0.45) await botMove(projectId);
      else if (roll < 0.7) await botCreate(projectId);
      else await botComment(projectId);
      nextActionAt = Date.now() + 8000 + Math.random() * 5000;
    } catch {
      /* the demo bot never takes the page down */
    }
  }
}
void startBot();

// ---------------------------------------------------------------------------
// API implementation
// ---------------------------------------------------------------------------

function page<T>(items: T[], pageNumber: number, size: number): Page<T> {
  return {
    content: items.slice(pageNumber * size, pageNumber * size + size),
    totalElements: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / size)),
    number: pageNumber,
    size,
  };
}

function publicUser(user: DemoUser): SessionUser {
  return { id: user.id, tenantId: user.tenantId, role: user.role, email: user.email, name: user.name };
}

function authResponse(user: DemoUser): AuthResponse {
  return { accessToken: makeAccessToken(user), refreshToken: issueRefreshToken(user.id), tokenType: 'Bearer', expiresInMs: 900_000 };
}

const rawDemoApi: Api = {
  async login(req) {
    await latency();
    const user = users.find((candidate) => candidate.email.toLowerCase() === req.email.toLowerCase());
    if (!user || user.password !== req.password) throw new ApiError(401, 'Invalid credentials');
    currentClaims = { ...publicUser(user), tokenVersion: user.tokenVersion };
    return authResponse(user);
  },

  async refresh(refreshToken) {
    await latency();
    const record = refreshRecords.get(refreshToken);
    if (!record || record.revoked || record.expiresAt < Date.now()) throw new ApiError(401, 'Session revoked; please log in again');
    // Rotation, like the real backend: revoke old, issue new.
    record.revoked = true;
    const user = users.find((candidate) => candidate.id === record.userId)!;
    currentClaims = { ...publicUser(user), tokenVersion: user.tokenVersion };
    return authResponse(user);
  },

  async logout(refreshToken) {
    await latency();
    const record = refreshRecords.get(refreshToken);
    if (record) record.revoked = true;
    currentClaims = null;
  },

  async logoutAll() {
    await latency();
    const user = currentUser();
    if (user) {
      user.tokenVersion += 1;
      for (const record of refreshRecords.values()) {
        if (record.userId === user.id) record.revoked = true;
      }
    }
    currentClaims = null;
  },

  async listProjects() {
    await latency();
    const { tenantId } = bearer();
    return projects.filter((project) => isTenantProject(project, tenantId));
  },

  async getProject(id) {
    await latency();
    const { tenantId } = bearer();
    const project = projects.find((candidate) => candidate.id === id);
    if (!project || !isTenantProject(project, tenantId)) throw new ApiError(404, 'Project not found');
    return project;
  },

  async createProject(req) {
    await latency();
    const user = bearer();
    const project: Project = {
      id: uid(),
      name: req.name,
      description: req.description ?? null,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      version: 0,
    };
    // Tenant tag is implicit: the mock only exposes it to the creating tenant.
    (project as Project & { tenantId?: string }).tenantId = user.tenantId;
    projects.push(project);
    recordAudit('CREATE', 'PROJECT', project.id, project.name);
    return project;
  },

  async deleteProject(id) {
    await latency();
    const doomed = await this.getProject(id);
    const actor = bearer();
    if (actor.role !== 'ADMIN' && doomed.createdBy !== actor.id) throw new ApiError(403, 'Only admins and the person who created a project can delete it');
    projects = projects.filter((project) => project.id !== id);
    issues = issues.filter((issue) => issue.projectId !== id);
    recordAudit('DELETE', 'PROJECT', id, doomed.name);
  },

  async listIssues(projectId) {
    await latency();
    const { tenantId } = bearer();
    const visible = issues.filter((issue) => issue.projectId === projectId && projectBelongsTo(issue.projectId, tenantId));
    return page(visible, 0, 100);
  },

  async getIssue(projectId, issueId) {
    await latency();
    const { tenantId } = bearer();
    const issue = issues.find((candidate) => candidate.id === issueId && candidate.projectId === projectId);
    if (!issue || !projectBelongsTo(projectId, tenantId)) throw new ApiError(404, 'Issue not found');
    return issue;
  },

  async createIssue(req) {
    await latency();
    const user = bearer();
    if (!projectBelongsTo(req.projectId, user.tenantId)) throw new ApiError(404, 'Project not found');
    const issue: Issue = {
      id: uid(),
      projectId: req.projectId,
      title: req.title,
      description: req.description ?? null,
      status: 'TODO',
      priority: req.priority,
      assigneeId: req.assigneeId ?? null,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 0,
    };
    issues.unshift(issue);
    recordAudit('CREATE', 'ISSUE', issue.id, issue.title);
    emit(`/topic/issues/${issue.projectId}`, { type: 'CREATED', data: issue, actorId: user.id });
    return issue;
  },

  async updateIssue(projectId, issueId, patch) {
    await latency();
    const user = bearer();
    const issue = issues.find((candidate) => candidate.id === issueId && candidate.projectId === projectId);
    if (!issue || !projectBelongsTo(projectId, user.tenantId)) throw new ApiError(404, 'Issue not found');
    if (patch.version !== issue.version) {
      throw new ApiError(409, 'Someone else changed this issue first');
    }
    if (patch.title !== undefined) issue.title = patch.title;
    if (patch.description !== undefined) issue.description = patch.description;
    if (patch.status !== undefined) issue.status = patch.status;
    if (patch.priority !== undefined) issue.priority = patch.priority;
    if (patch.clearAssignee) issue.assigneeId = null;
    else if (patch.assigneeId) {
      const assignee = users.find((candidate) => candidate.id === patch.assigneeId);
      if (!assignee || assignee.tenantId !== user.tenantId) throw new ApiError(400, 'That person isn’t in this workspace');
      issue.assigneeId = patch.assigneeId;
    }
    issue.version += 1;
    issue.updatedAt = new Date().toISOString();
    recordAudit('UPDATE', 'ISSUE', issue.id, issue.title);
    emit(`/topic/issues/${issue.projectId}`, { type: 'UPDATED', data: issue, actorId: user.id });
    return { ...issue };
  },

  async deleteIssue(projectId, issueId) {
    await latency();
    const user = bearer();
    const issue = issues.find((candidate) => candidate.id === issueId && candidate.projectId === projectId);
    if (!issue || !projectBelongsTo(projectId, user.tenantId)) throw new ApiError(404, 'Issue not found');
    issues = issues.filter((candidate) => candidate.id !== issueId);
    comments = comments.filter((comment) => comment.issueId !== issueId);
    recordAudit('DELETE', 'ISSUE', issueId, issue.title);
    emit(`/topic/issues/${projectId}`, { type: 'DELETED', issueId, actorId: user.id });
  },

  async listComments(issueId) {
    await latency();
    const { tenantId } = bearer();
    const issue = issues.find((candidate) => candidate.id === issueId);
    if (!issue || !projectBelongsTo(issue.projectId, tenantId)) throw new ApiError(404, 'Issue not found');
    return comments.filter((comment) => comment.issueId === issueId);
  },

  async createComment(issueId, body) {
    await latency();
    const user = bearer();
    const issue = issues.find((candidate) => candidate.id === issueId);
    if (!issue || !projectBelongsTo(issue.projectId, user.tenantId)) throw new ApiError(404, 'Issue not found');
    const comment: Comment = {
      id: uid(),
      issueId,
      authorId: user.id,
      body,
      createdAt: new Date().toISOString(),
      version: 0,
    };
    comments.push(comment);
    recordAudit('CREATE', 'COMMENT', comment.id, comment.body);
    emit(`/topic/issues/${issueId}/comments`, { type: 'CREATED', data: comment });
    return comment;
  },

  async deleteComment(issueId, commentId) {
    await latency();
    const user = bearer();
    const comment = comments.find((candidate) => candidate.id === commentId && candidate.issueId === issueId);
    if (!comment) throw new ApiError(404, 'Comment not found');
    if (comment.authorId !== user.id && user.role !== 'ADMIN') {
      throw new ApiError(403, 'Only the author (or an admin) can delete a comment');
    }
    comments = comments.filter((candidate) => candidate.id !== commentId);
    recordAudit('DELETE', 'COMMENT', commentId, comment.body);
    emit(`/topic/issues/${issueId}/comments`, { type: 'DELETED', commentId });
  },

  async listAuditLogs(pageNumber, size) {
    await latency();
    const user = bearer();
    if (user.role !== 'ADMIN') throw new ApiError(403, 'Admin role required');
    const tenantLogs = auditLogs.filter((log) => users.find((candidate) => candidate.id === log.actorId)?.tenantId === user.tenantId);
    return page(tenantLogs, pageNumber, size);
  },

  async listUsers() {
    await latency();
    const { tenantId } = bearer();
    return users
      .filter((user) => user.tenantId === tenantId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((user) => ({ id: user.id, displayName: user.name, role: user.role }));
  },
};

function isTenantProject(project: Project, tenantId: string): boolean {
  const tag = (project as Project & { tenantId?: string }).tenantId;
  if (tag) return tag === tenantId;
  // Seeded rows have no explicit tag; infer from creator (matches data.sql).
  const creator = users.find((user) => user.id === project.createdBy);
  return creator?.tenantId === tenantId;
}

function projectBelongsTo(projectId: string, tenantId: string): boolean {
  const project = projects.find((candidate) => candidate.id === projectId);
  return !!project && isTenantProject(project, tenantId);
}

/** Demo-mode helper: swap the "current" user when a new token arrives (login/refresh). */
export function demoSyncToken(accessToken: string | null): void {
  if (!accessToken) {
    currentClaims = null;
    return;
  }
  try {
    setClaimsFromToken(accessToken);
  } catch {
    /* not a demo-shaped token */
  }
}

/** Every response crosses a simulated wire: callers get copies, exactly like
 *  JSON over HTTP, instead of live references into the mock's tables. */
export const demoApi: Api = Object.fromEntries(
  Object.entries(rawDemoApi).map(([name, fn]) => [
    name,
    async (...args: unknown[]) => structuredClone(await (fn as (...a: unknown[]) => Promise<unknown>).apply(rawDemoApi, args)),
  ]),
) as unknown as Api;
