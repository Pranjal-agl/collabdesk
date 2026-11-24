// React auth context: login/logout/logout-all, session user, WS lifecycle.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SessionUser } from './types';
import { api } from './api';
import { clearSession, getSessionUser, saveSession, saveUserInfo } from './session';
import { getAccessToken, getRefreshToken } from './session';
import { ws } from './ws';

interface AuthContextValue {
  user: SessionUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => getSessionUser());
  const navigate = useNavigate();

  // One WebSocket connection per session, established as soon as we have a user.
  useEffect(() => {
    if (!user) return;
    const token = getAccessToken();
    if (token) ws.connect(token);
    return () => ws.disconnect();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login({ email, password });
      saveSession(res);
      const name = email
        .split('@')[0]
        .split(/[._-]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
      saveUserInfo({ email, name });
      setUser(getSessionUser());
      navigate('/projects', { replace: true });
    },
    [navigate],
  );

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) await api.logout(refreshToken);
    clearSession();
    ws.disconnect();
    setUser(null);
    navigate('/auth/login', { replace: true });
  }, [navigate]);

  const logoutAll = useCallback(async () => {
    await api.logoutAll();
    clearSession();
    ws.disconnect();
    setUser(null);
    navigate('/auth/login', { replace: true });
  }, [navigate]);

  const value = useMemo(
    () => ({ user, login, logout, logoutAll }),
    [user, login, logout, logoutAll],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
