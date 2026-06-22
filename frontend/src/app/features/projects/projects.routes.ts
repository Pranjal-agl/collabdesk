import { Routes } from '@angular/router';

export const PROJECT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./project-list/project-list.component').then(m => m.ProjectListComponent)
  },
  {
    path: ':projectId/issues',
    loadComponent: () =>
      import('../issues/issue-list/issue-list.component').then(m => m.IssueListComponent)
  }
];
