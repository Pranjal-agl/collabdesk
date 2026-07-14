export interface LoginRequest  { email: string; password: string; deviceLabel?: string; }
export interface RefreshRequest { refreshToken: string; }
export interface AuthResponse  {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresInMs: number;
}

export interface TokenPayload {
  sub:          string;    // userId
  tenantId:     string;
  role:         string;
  tokenVersion: number;
  exp:          number;
}
