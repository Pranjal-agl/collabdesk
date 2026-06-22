export interface LoginRequest  { email: string; password: string; }
export interface AuthResponse  { accessToken: string; tokenType: string; }

export interface TokenPayload {
  sub:          string;    // userId
  tenantId:     string;
  role:         string;
  tokenVersion: number;
  exp:          number;
}
