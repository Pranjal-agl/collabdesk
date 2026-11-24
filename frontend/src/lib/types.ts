// Mirrors the backend DTOs (com.collabdesk.dto.response.*) exactly.

export type IssueStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'CANCELLED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type UserRole = 'ADMIN' | 'MEMBER';

export interface Issue {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: Priority;
  assigneeId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  version: number;
}

export interface Comment {
  id: string;
  issueId: string;
  authorId: string;
  body: string;
  createdAt: string;
  version: number;
}

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  payload: string | null;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresInMs: number;
}

export interface SessionUser {
  id: string;
  tenantId: string;
  role: UserRole;
  email: string;
  name: string;
}

export interface PresenceUser {
  userId: string;
  displayName: string;
}

/** actorId: who made the change (sent by the backend on every issue event). */
export type IssueEvent =
  | { type: 'CREATED'; data: Issue; actorId?: string }
  | { type: 'UPDATED'; data: Issue; actorId?: string }
  | { type: 'DELETED'; issueId: string; actorId?: string };
export type CommentEvent = { type: 'CREATED'; data: Comment } | { type: 'DELETED'; commentId: string };
export interface PresenceEvent {
  projectId: string;
  users: PresenceUser[];
}

export interface UserSummary {
  id: string;
  displayName: string;
  role: UserRole;
}

/** Live cursor on a board. x is a fraction of the board width, y is px from its top. */
export interface CursorEvent {
  userId: string;
  displayName: string;
  gone: boolean;
  x?: number;
  y?: number;
  dragging?: string | null;
}

export interface TypingEvent {
  userId: string;
  displayName: string;
  typing: boolean;
}

/** Statuses rendered as board columns; CANCELLED issues stay out of the flow. */
export const BOARD_STATUSES: IssueStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

/** RFC 7807 ProblemDetail error thrown by the backend's GlobalExceptionHandler. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
    this.name = 'ApiError';
  }
}

/** The backend API surface, implemented twice: over real HTTP, and over the demo mock. */
export interface Api {
  login(req: { email: string; password: string; deviceLabel?: string }): Promise<AuthResponse>;
  refresh(refreshToken: string): Promise<AuthResponse>;
  logout(refreshToken: string): Promise<void>;
  logoutAll(): Promise<void>;

  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project>;
  createProject(req: { name: string; description?: string }): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  listIssues(projectId: string): Promise<Page<Issue>>;
  getIssue(projectId: string, issueId: string): Promise<Issue>;
  createIssue(req: {
    projectId: string;
    title: string;
    description?: string;
    priority: Priority;
    assigneeId?: string;
  }): Promise<Issue>;
  updateIssue(
    projectId: string,
    issueId: string,
    patch: Partial<Pick<Issue, 'title' | 'description' | 'status' | 'priority' | 'assigneeId'>> & {
      clearAssignee?: boolean;
      version: number;
    },
  ): Promise<Issue>;
  deleteIssue(projectId: string, issueId: string): Promise<void>;

  listComments(issueId: string): Promise<Comment[]>;
  createComment(issueId: string, body: string): Promise<Comment>;
  deleteComment(issueId: string, commentId: string): Promise<void>;

  listAuditLogs(page: number, size: number): Promise<Page<AuditLog>>;

  listUsers(): Promise<UserSummary[]>;
}
