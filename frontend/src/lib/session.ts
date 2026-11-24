// Token/session storage shared by the HTTP client and the React auth context.
// Kept separate from both so api.ts and auth.tsx don't import each other.

import type { AuthResponse, SessionUser } from './types';

const KEY_ACCESS = 'cd_access_token';
const KEY_REFRESH = 'cd_refresh_token';
const KEY_USER = 'cd_user_info';

export function getAccessToken(): string | null {
  return localStorage.getItem(KEY_ACCESS);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(KEY_REFRESH);
}

export function saveSession(res: AuthResponse): void {
  localStorage.setItem(KEY_ACCESS, res.accessToken);
  localStorage.setItem(KEY_REFRESH, res.refreshToken);
}

/** The backend JWT carries sub/tenantId/role/tokenVersion but not display
 *  identity, so the email/name the user typed at login is remembered alongside. */
export function saveUserInfo(info: Pick<SessionUser, 'email' | 'name'>): void {
  localStorage.setItem(KEY_USER, JSON.stringify(info));
}

export function clearSession(): void {
  localStorage.removeItem(KEY_ACCESS);
  localStorage.removeItem(KEY_REFRESH);
  localStorage.removeItem(KEY_USER);
}

export function decodeToken(token: string): Omit<SessionUser, 'email' | 'name'> | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      id: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export function getSessionUser(): SessionUser | null {
  const token = getAccessToken();
  if (!token) return null;
  const fromToken = decodeToken(token);
  if (!fromToken) return null;
  let extra: Pick<SessionUser, 'email' | 'name'> = { email: '', name: 'User' };
  try {
    const raw = localStorage.getItem(KEY_USER);
    if (raw) extra = JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { ...fromToken, ...extra };
}
