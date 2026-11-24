// HTTP client for the real Spring Boot backend, plus the demo-mode picker.

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
} from './types';
import { demoApi, demoSyncToken } from './demo';
import { getAccessToken, getRefreshToken } from './session';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

/** Single in-flight refresh shared by every concurrent 401, so a burst of
 *  requests expiring at once triggers one rotation, not N. */
let refreshInFlight: Promise<AuthResponse> | null = null;

async function refreshTokens(): Promise<AuthResponse> {
  if (!refreshInFlight) {
    const refreshToken = getRefreshToken();
    if (!refreshToken) throw new ApiError(401, 'No refresh token');
    refreshInFlight = fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) throw new ApiError(res.status, 'Session expired');
        return (await res.json()) as AuthResponse;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

class HttpApi implements Api {
  private async req<T>(
    path: string,
    options: RequestInit & { skipAuth?: boolean; skipRefreshRetry?: boolean } = {},
  ): Promise<T> {
    const { skipAuth, skipRefreshRetry, ...init } = options;
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/problem+json, application/json');
    if (init.body) headers.set('Content-Type', 'application/json');

    const token = getAccessToken();
    if (token && !skipAuth) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(path, { ...init, headers });

    if (res.status === 401 && !skipAuth && !skipRefreshRetry) {
      const rotated = await refreshTokens();
      localStorage.setItem('cd_access_token', rotated.accessToken);
      localStorage.setItem('cd_refresh_token', rotated.refreshToken);
      return this.req<T>(path, { ...options, skipRefreshRetry: true });
    }

    if (res.status === 204) return undefined as T;

    if (!res.ok) {
      // Backend errors are RFC 7807 ProblemDetail JSON: { title, detail, status }.
      let detail = res.statusText;
      try {
        const body = await res.json();
        if (typeof body?.detail === 'string') detail = body.detail;
      } catch {
        /* non-JSON error body */
      }
      throw new ApiError(res.status, detail);
    }

    return (await res.json()) as T;
  }

  login = (req: { email: string; password: string; deviceLabel?: string }) =>
    this.req<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify(req), skipAuth: true, skipRefreshRetry: true });

  refresh = (refreshToken: string) =>
    this.req<AuthResponse>('/api/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }), skipAuth: true, skipRefreshRetry: true });

  logout = (refreshToken: string) =>
    this.req<void>('/api/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }).catch(() => undefined);

  logoutAll = () => this.req<void>('/api/auth/logout-all', { method: 'POST' }).catch(() => undefined);

  listProjects = () => this.req<Project[]>('/api/projects');
  getProject = (id: string) => this.req<Project>(`/api/projects/${id}`);
  createProject = (req: { name: string; description?: string }) =>
    this.req<Project>('/api/projects', { method: 'POST', body: JSON.stringify(req) });
  deleteProject = (id: string) => this.req<void>(`/api/projects/${id}`, { method: 'DELETE' });

  listIssues = (projectId: string) => this.req<Page<Issue>>(`/api/projects/${projectId}/issues`);
  getIssue = (projectId: string, issueId: string) => this.req<Issue>(`/api/projects/${projectId}/issues/${issueId}`);
  createIssue = (req: { projectId: string; title: string; description?: string; priority: Priority; assigneeId?: string }) =>
    this.req<Issue>(`/api/projects/${req.projectId}/issues`, { method: 'POST', body: JSON.stringify(req) });
  updateIssue = (projectId: string, issueId: string, patch: object) =>
    this.req<Issue>(`/api/projects/${projectId}/issues/${issueId}`, { method: 'PATCH', body: JSON.stringify(patch) });
  deleteIssue = (projectId: string, issueId: string) =>
    this.req<void>(`/api/projects/${projectId}/issues/${issueId}`, { method: 'DELETE' });

  listComments = (issueId: string) => this.req<Comment[]>(`/api/issues/${issueId}/comments`);
  createComment = (issueId: string, body: string) =>
    this.req<Comment>(`/api/issues/${issueId}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
  deleteComment = (issueId: string, commentId: string) =>
    this.req<void>(`/api/issues/${issueId}/comments/${commentId}`, { method: 'DELETE' });

  listAuditLogs = (page: number, size: number) => this.req<Page<AuditLog>>(`/api/audit-logs?page=${page}&size=${size}`);
}

class DemoApiWrapper implements Api {
  private sync(token: string | null) {
    demoSyncToken(token);
  }
  login: Api['login'] = async (req) => {
    const res = await demoApi.login(req);
    demoSyncToken(res.accessToken);
    return res;
  };
  refresh: Api['refresh'] = async (token) => {
    const res = await demoApi.refresh(token);
    demoSyncToken(res.accessToken);
    return res;
  };
  logout: Api['logout'] = async (token) => {
    await demoApi.logout(token);
    demoSyncToken(null);
  };
  logoutAll: Api['logoutAll'] = async () => {
    this.sync(getAccessToken());
    await demoApi.logoutAll();
    demoSyncToken(null);
  };
  listProjects: Api['listProjects'] = async () => {
    this.sync(getAccessToken());
    return demoApi.listProjects();
  };
  getProject: Api['getProject'] = async (id) => {
    this.sync(getAccessToken());
    return demoApi.getProject(id);
  };
  createProject: Api['createProject'] = async (req) => {
    this.sync(getAccessToken());
    return demoApi.createProject(req);
  };
  deleteProject: Api['deleteProject'] = async (id) => {
    this.sync(getAccessToken());
    return demoApi.deleteProject(id);
  };
  listIssues: Api['listIssues'] = async (pid) => {
    this.sync(getAccessToken());
    return demoApi.listIssues(pid);
  };
  getIssue: Api['getIssue'] = async (pid, id) => {
    this.sync(getAccessToken());
    return demoApi.getIssue(pid, id);
  };
  createIssue: Api['createIssue'] = async (req) => {
    this.sync(getAccessToken());
    return demoApi.createIssue(req);
  };
  updateIssue: Api['updateIssue'] = async (pid, id, patch) => {
    this.sync(getAccessToken());
    return demoApi.updateIssue(pid, id, patch);
  };
  deleteIssue: Api['deleteIssue'] = async (pid, id) => {
    this.sync(getAccessToken());
    return demoApi.deleteIssue(pid, id);
  };
  listComments: Api['listComments'] = async (iid) => {
    this.sync(getAccessToken());
    return demoApi.listComments(iid);
  };
  createComment: Api['createComment'] = async (iid, body) => {
    this.sync(getAccessToken());
    return demoApi.createComment(iid, body);
  };
  deleteComment: Api['deleteComment'] = async (iid, cid) => {
    this.sync(getAccessToken());
    return demoApi.deleteComment(iid, cid);
  };
  listAuditLogs: Api['listAuditLogs'] = async (p, s) => {
    this.sync(getAccessToken());
    return demoApi.listAuditLogs(p, s);
  };
}

export const api: Api = DEMO ? new DemoApiWrapper() : new HttpApi();

/** Fire-and-forget session refresh used by the auth context on logout flows. */
export async function rotateTokens(): Promise<AuthResponse | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    return await api.refresh(refreshToken);
  } catch {
    return null;
  }
}
