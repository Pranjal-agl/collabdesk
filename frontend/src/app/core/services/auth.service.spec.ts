import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

// A JWT-shaped-enough token so AuthService's payload decoder doesn't choke.
// header.payload.signature, payload is base64 JSON — signature is never checked client-side.
function fakeAccessToken(payload: object): string {
  const header = btoa(JSON.stringify({ alg: 'none' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.sig`;
}

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } }
      ]
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('stores both tokens on login and exposes the decoded user', () => {
    const accessToken = fakeAccessToken({ sub: 'user-1', tenantId: 'tenant-1', role: 'MEMBER', tokenVersion: 0 });

    service.login({ email: 'a@b.com', password: 'pw' }).subscribe();
    httpMock.expectOne(`${environment.apiUrl}/auth/login`).flush({
      accessToken, refreshToken: 'refresh-1', tokenType: 'Bearer', expiresInMs: 900_000
    });

    expect(service.getToken()).toBe(accessToken);
    expect(service.getRefreshToken()).toBe('refresh-1');
    expect(service.currentUser()?.sub).toBe('user-1');
  });

  it('rotates both tokens on refresh — the old refresh token is replaced, not reused', () => {
    localStorage.setItem('cd_refresh_token', 'old-refresh');
    const newAccess = fakeAccessToken({ sub: 'user-1', tenantId: 't1', role: 'MEMBER', tokenVersion: 0 });

    service.refresh().subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/refresh`);
    expect(req.request.body).toEqual({ refreshToken: 'old-refresh' });
    req.flush({ accessToken: newAccess, refreshToken: 'new-refresh', tokenType: 'Bearer', expiresInMs: 900_000 });

    expect(service.getToken()).toBe(newAccess);
    expect(service.getRefreshToken()).toBe('new-refresh');
    expect(service.getRefreshToken()).not.toBe('old-refresh');
  });

  it('shares a single in-flight refresh call across concurrent callers instead of firing one per caller', () => {
    localStorage.setItem('cd_refresh_token', 'old-refresh');
    const newAccess = fakeAccessToken({ sub: 'user-1', tenantId: 't1', role: 'MEMBER', tokenVersion: 0 });

    // Two "concurrent" 401s both ask for a refresh at once.
    let resolvedCount = 0;
    service.refresh().subscribe(() => resolvedCount++);
    service.refresh().subscribe(() => resolvedCount++);

    // Only one network call should have gone out despite two subscribers.
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/refresh`);
    req.flush({ accessToken: newAccess, refreshToken: 'new-refresh', tokenType: 'Bearer', expiresInMs: 900_000 });

    expect(resolvedCount).toBe(2);
  });

  it('clears the session if refresh fails (e.g. reused/revoked token)', () => {
    localStorage.setItem('cd_access_token', 'stale-token');
    localStorage.setItem('cd_refresh_token', 'stolen-and-already-used');

    service.refresh().subscribe({ error: () => {} });
    httpMock.expectOne(`${environment.apiUrl}/auth/refresh`)
      .flush('Session revoked', { status: 401, statusText: 'Unauthorized' });

    expect(service.getToken()).toBeNull();
    expect(service.getRefreshToken()).toBeNull();
  });
});
