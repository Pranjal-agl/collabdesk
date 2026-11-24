import { HttpInterceptorFn, HttpErrorResponse, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

function withAuth(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

/**
 * On a 401 from an expired access token, transparently refreshes and retries the
 * original request exactly once. If the refresh itself fails (refresh token
 * expired, revoked, or reused-after-rotation), the session is cleared and the
 * user is sent back to login rather than retried in a loop.
 */
export const authInterceptor: HttpInterceptorFn = (req, next: HttpHandlerFn) => {
  const auth = inject(AuthService);

  // Never try to refresh around the auth endpoints themselves.
  const isAuthCall = req.url.includes('/auth/login') || req.url.includes('/auth/refresh');
  const cloned = withAuth(req, auth.getToken());

  return next(cloned).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !isAuthCall && auth.getRefreshToken()) {
        return auth.refresh().pipe(
          switchMap(res => next(withAuth(req, res.accessToken))),
          catchError(refreshErr => {
            auth.clearSession();
            return throwError(() => refreshErr);
          })
        );
      }
      if (err.status === 401) {
        auth.clearSession();
      }
      return throwError(() => err);
    })
  );
};
