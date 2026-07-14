import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, shareReplay, tap, finalize, catchError, throwError } from 'rxjs';
import { AuthResponse, LoginRequest, TokenPayload } from '../models/auth.model';
import { environment } from '../../../environments/environment';

/**
 * Session model: short-lived access token (kept in memory + localStorage for
 * page reloads) + a rotating refresh token (one per device/browser). Every
 * refresh call swaps both tokens for new ones — the old refresh token stops
 * working immediately, so a stolen-but-unused token has a shrinking window
 * of usefulness, and reuse of an already-rotated token is a signal the server
 * treats as compromise (see AuthService.refresh on the backend).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'cd_access_token';
  private readonly REFRESH_KEY = 'cd_refresh_token';

  private readonly _token = signal<string | null>(localStorage.getItem(this.TOKEN_KEY));

  readonly isAuthenticated = computed(() => this._token() !== null);
  readonly currentUser     = computed(() => this.decodeToken(this._token()));

  /** Single in-flight refresh call shared across concurrent 401s, so a burst of
   *  requests that all expire at once triggers exactly one refresh, not N. */
  private refreshInFlight: Observable<AuthResponse> | null = null;

  constructor(private http: HttpClient, private router: Router) {}

  login(req: LoginRequest) {
    const withDevice: LoginRequest = { ...req, deviceLabel: req.deviceLabel ?? this.guessDeviceLabel() };
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/login`, withDevice).pipe(
      tap(res => this.storeSession(res))
    );
  }

  /** Rotates tokens. Interceptor calls this on a 401; can also be called proactively before expiry. */
  refresh(): Observable<AuthResponse> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }
    const refreshToken = localStorage.getItem(this.REFRESH_KEY);
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available'));
    }

    this.refreshInFlight = this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/refresh`, { refreshToken })
      .pipe(
        tap(res => this.storeSession(res)),
        catchError(err => {
          this.clearSession();
          return throwError(() => err);
        }),
        finalize(() => (this.refreshInFlight = null)),
        shareReplay(1)
      );
    return this.refreshInFlight;
  }

  /** Logs out this device only; other logged-in devices for this user stay active. */
  logout() {
    const refreshToken = localStorage.getItem(this.REFRESH_KEY);
    this.http.post(`${environment.apiUrl}/auth/logout`, { refreshToken }).subscribe({
      complete: () => this.clearSession(),
      error: () => this.clearSession() // clear locally even if the server call fails
    });
  }

  /** "Sign out everywhere" — kills every device's session immediately. */
  logoutAll() {
    this.http.post(`${environment.apiUrl}/auth/logout-all`, {}).subscribe({
      complete: () => this.clearSession(),
      error: () => this.clearSession()
    });
  }

  getToken(): string | null {
    return this._token();
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_KEY);
  }

  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    this._token.set(null);
    this.router.navigate(['/auth/login']);
  }

  private storeSession(res: AuthResponse) {
    localStorage.setItem(this.TOKEN_KEY, res.accessToken);
    localStorage.setItem(this.REFRESH_KEY, res.refreshToken);
    this._token.set(res.accessToken);
  }

  private guessDeviceLabel(): string {
    const ua = navigator.userAgent;
    if (/Mobi|Android/i.test(ua)) return 'Mobile browser';
    if (/Mac/i.test(ua)) return 'Mac browser';
    if (/Win/i.test(ua)) return 'Windows browser';
    return 'Browser';
  }

  private decodeToken(token: string | null): TokenPayload | null {
    if (!token) return null;
    try {
      const payload = token.split('.')[1];
      return JSON.parse(atob(payload)) as TokenPayload;
    } catch {
      return null;
    }
  }
}
