import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { AuthResponse, LoginRequest, TokenPayload } from '../models/auth.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'cd_access_token';

  // Signal-based reactive auth state
  private readonly _token = signal<string | null>(
    localStorage.getItem(this.TOKEN_KEY)
  );

  readonly isAuthenticated = computed(() => this._token() !== null);
  readonly currentUser     = computed(() => this.decodeToken(this._token()));

  constructor(private http: HttpClient, private router: Router) {}

  login(req: LoginRequest) {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/login`, req).pipe(
      tap(res => {
        localStorage.setItem(this.TOKEN_KEY, res.accessToken);
        this._token.set(res.accessToken);
      })
    );
  }

  logout() {
    this.http.post(`${environment.apiUrl}/auth/logout`, {}).subscribe({
      complete: () => this.clearSession(),
      error: ()    => this.clearSession()   // clear locally even if server call fails
    });
  }

  getToken(): string | null {
    return this._token();
  }

  private clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    this._token.set(null);
    this.router.navigate(['/auth/login']);
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
