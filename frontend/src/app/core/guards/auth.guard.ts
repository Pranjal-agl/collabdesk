import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/auth/login']);
};

/** Route-level gate is a UX nicety only — the server enforces ADMIN via
 *  @PreAuthorize on /api/audit-logs regardless of what this guard decides. */
export const adminGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated() && auth.currentUser()?.role === 'ADMIN') {
    return true;
  }
  return router.createUrlTree(['/projects']);
};
