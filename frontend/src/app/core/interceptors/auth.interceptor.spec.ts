import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } }
      ]
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    // AuthService reads localStorage only once, in its field initializer at
    // construction time - so it must not be injected here, before individual
    // tests have had a chance to seed localStorage with their own token state.
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('attaches the access token to outgoing requests', () => {
    localStorage.setItem('cd_access_token', 'access-1');
    TestBed.inject(AuthService); // constructs now, picking up the token we just seeded

    http.get(`${environment.apiUrl}/projects`).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/projects`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-1');
    req.flush({});
  });

  it('on a 401, refreshes once and transparently retries the original request', () => {
    const auth = TestBed.inject(AuthService);
    localStorage.setItem('cd_refresh_token', 'refresh-1');

    let result: unknown;
    http.get(`${environment.apiUrl}/projects`).subscribe(res => (result = res));

    const firstAttempt = httpMock.expectOne(`${environment.apiUrl}/projects`);
    firstAttempt.flush('expired', { status: 401, statusText: 'Unauthorized' });

    const refreshReq = httpMock.expectOne(`${environment.apiUrl}/auth/refresh`);
    refreshReq.flush({ accessToken: 'new-access', refreshToken: 'new-refresh', tokenType: 'Bearer', expiresInMs: 900_000 });

    const retryReq = httpMock.expectOne(`${environment.apiUrl}/projects`);
    expect(retryReq.request.headers.get('Authorization')).toBe('Bearer new-access');
    retryReq.flush({ ok: true });

    expect(result).toEqual({ ok: true });
  });

  it('clears the session and gives up if the refresh itself fails, instead of retrying forever', () => {
    const auth = TestBed.inject(AuthService);
    localStorage.setItem('cd_refresh_token', 'refresh-1');

    let errored = false;
    http.get(`${environment.apiUrl}/projects`).subscribe({ error: () => (errored = true) });

    httpMock.expectOne(`${environment.apiUrl}/projects`).flush('expired', { status: 401, statusText: 'Unauthorized' });
    httpMock.expectOne(`${environment.apiUrl}/auth/refresh`).flush('revoked', { status: 401, statusText: 'Unauthorized' });

    // No further /projects retry should be attempted.
    httpMock.expectNone(`${environment.apiUrl}/projects`);
    expect(errored).toBeTrue();
    expect(auth.getToken()).toBeNull();
  });
});
