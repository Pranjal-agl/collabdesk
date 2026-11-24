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
  { id: uid(), actorId: users[0].id, action: 'ISSUE_CREATED', resourceType: 'ISSUE', resourceId: '30000000-0000-0000-0000-000000000008', payload: '{"title":"Rate-limit middleware"}', createdAt: iso(1000 * 60 * 60 * 8) },
  { id: uid(), actorId: users[1].id, action: 'ISSUE_UPDATED', resourceType: 'ISSUE', resourceId: '30000000-0000-0000-0000-000000000001', payload: '{"status":"IN_PROGRESS"}', createdAt: iso(1000 * 60 * 22) },
  { id: uid(), actorId: users[0].id, action: 'COMMENT_CREATED', resourceType: 'COMMENT', resourceId: '50000000-0000-0000-0000-000000000002', payload: null, createdAt: iso(1000 * 60 * 18) },
];

// ---------------------------------------------------------------------------
// Simulated network + WebSocket bus
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const latency = () => sleep(90 + Math.random() * 200);

type Handler = (msg: unknown) => void;
const topicHandlers = new Map<string, Set<Handler>>();

function emit(topic: string, msg: unknown): void {
  topicHandlers.get(topic)?.forEach((handler) => handler(msg));
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
    const payload = JSON.parse(atob(token.split('.')[2]));
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

function startBot(): void {
  setInterval(() => {
    if (!botEnabled || !currentClaims) return;
    // Only "work" in projects someone is currently viewing.
    const liveProjects = new Set<string>();
    for (const entries of presenceBySession.values()) {
      for (const entry of entries) liveProjects.add(entry.projectId);
    }
    if (liveProjects.size === 0) return;
    const projectId = [...liveProjects][Math.floor(Math.random() * liveProjects.size)];
    const bob = users[1];
    const before = issues.length;

    if (Math.random() < 0.45) {
      const [title, priority] = BOT_TITLES[Math.floor(Math.random() * BOT_TITLES.length)];
      const issue: Issue = {
        id: uid(),
        projectId,
        title,
        description: null,
        status: 'TODO',
        priority,
        assigneeId: null,
        createdBy: bob.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 0,
      };
      issues.unshift(issue);
      auditLogs.unshift({ id: uid(), actorId: bob.id, action: 'ISSUE_CREATED', resourceType: 'ISSUE', resourceId: issue.id, payload: JSON.stringify({ title }), createdAt: issue.createdAt });
      emit(`/topic/issues/${projectId}`, { type: 'CREATED', data: issue });
    } else {
      const candidates = issues.filter((issue) => issue.projectId === projectId);
      if (candidates.length === 0) return;
      const issue = candidates[Math.floor(Math.random() * candidates.length)];
      const comment: Comment = {
        id: uid(),
        issueId: issue.id,
        authorId: bob.id,
        body: BOT_COMMENTS[Math.floor(Math.random() * BOT_COMMENTS.length)],
        createdAt: new Date().toISOString(),
        version: 0,
      };
      comments.push(comment);
      auditLogs.unshift({ id: uid(), actorId: bob.id, action: 'COMMENT_CREATED', resourceType: 'COMMENT', resourceId: comment.id, payload: null, createdAt: comment.createdAt });
      emit(`/topic/issues/${issue.id}/comments`, { type: 'CREATED', data: comment });
      if (issues.length === before) {
        // nudge the board that the issue changed
        issue.updatedAt = comment.createdAt;
        issue.version += 1;
        emit(`/topic/issues/${projectId}`, { type: 'UPDATED', data: issue });
      }
    }
  }, 14_000);
}
startBot();

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

export const demoApi: Api = {
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
    recordAudit('PROJECT_CREATED', 'PROJECT', project.id, JSON.stringify({ name: project.name }));
    return project;
  },

  async deleteProject(id) {
    await latency();
    await this.getProject(id);
    projects = projects.filter((project) => project.id !== id);
    issues = issues.filter((issue) => issue.projectId !== id);
    recordAudit('PROJECT_DELETED', 'PROJECT', id, null);
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
    recordAudit('ISSUE_CREATED', 'ISSUE', issue.id, JSON.stringify({ title: issue.title }));
    emit(`/topic/issues/${issue.projectId}`, { type: 'CREATED', data: issue });
    return issue;
  },

  async updateIssue(projectId, issueId, patch) {
    await latency();
    const user = bearer();
    const issue = issues.find((candidate) => candidate.id === issueId && candidate.projectId === projectId);
    if (!issue || !projectBelongsTo(projectId, user.tenantId)) throw new ApiError(404, 'Issue not found');
    if (patch.version !== issue.version) {
      throw new ApiError(409, 'Resource was modified concurrently. Please refresh and retry.');
    }
    if (patch.title !== undefined) issue.title = patch.title;
    if (patch.description !== undefined) issue.description = patch.description;
    if (patch.status !== undefined) issue.status = patch.status;
    if (patch.priority !== undefined) issue.priority = patch.priority;
    if (patch.assigneeId !== undefined) issue.assigneeId = patch.assigneeId;
    issue.version += 1;
    issue.updatedAt = new Date().toISOString();
    recordAudit('ISSUE_UPDATED', 'ISSUE', issue.id, JSON.stringify({ ...patch, version: undefined }));
    emit(`/topic/issues/${issue.projectId}`, { type: 'UPDATED', data: issue });
    return { ...issue };
  },

  async deleteIssue(projectId, issueId) {
    await latency();
    const user = bearer();
    const issue = issues.find((candidate) => candidate.id === issueId && candidate.projectId === projectId);
    if (!issue || !projectBelongsTo(projectId, user.tenantId)) throw new ApiError(404, 'Issue not found');
    issues = issues.filter((candidate) => candidate.id !== issueId);
    comments = comments.filter((comment) => comment.issueId !== issueId);
    recordAudit('ISSUE_DELETED', 'ISSUE', issueId, null);
    emit(`/topic/issues/${projectId}`, { type: 'DELETED', issueId });
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
    recordAudit('COMMENT_CREATED', 'COMMENT', comment.id, null);
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
    recordAudit('COMMENT_DELETED', 'COMMENT', commentId, null);
    emit(`/topic/issues/${issueId}/comments`, { type: 'DELETED', commentId });
  },

  async listAuditLogs(pageNumber, size) {
    await latency();
    const user = bearer();
    if (user.role !== 'ADMIN') throw new ApiError(403, 'Admin role required');
    return page(auditLogs, pageNumber, size);
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
