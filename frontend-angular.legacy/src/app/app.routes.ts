import { Routes } from '@angular/router';
import { authGuard, adminGuard } from './core/guards/auth.guard';

export const APP_ROUTES: Routes = [
  {
    path: 'auth',
    loadChildren: () =>
      import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES)
  },
  {
    path: 'projects',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/projects/projects.routes').then(m => m.PROJECT_ROUTES)
  },
  {
    path: 'admin/audit-log',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./features/admin/audit-log/audit-log.component').then(m => m.AuditLogComponent)
  },
  {
    path: '',
    redirectTo: 'projects',
    pathMatch: 'full'
  }
];
