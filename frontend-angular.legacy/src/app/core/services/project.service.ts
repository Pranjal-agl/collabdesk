import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CreateProjectRequest, Project, UpdateProjectRequest } from '../models/project.model';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly _projects = signal<Project[]>([]);
  readonly projects = this._projects.asReadonly();

  private readonly _loading = signal(false);
  readonly loading = this._loading.asReadonly();

  constructor(private http: HttpClient) {}

  loadAll() {
    this._loading.set(true);
    return this.http.get<Project[]>(`${environment.apiUrl}/projects`).pipe(
      tap({
        next: (projects) => {
          this._projects.set(projects);
          this._loading.set(false);
        },
        error: () => this._loading.set(false)
      })
    );
  }

  create(req: CreateProjectRequest) {
    return this.http.post<Project>(`${environment.apiUrl}/projects`, req).pipe(
      tap((project) => this._projects.update((list) => [project, ...list]))
    );
  }

  /** Optimistic update, rolled back on failure - same pattern as IssueService. */
  update(projectId: string, req: UpdateProjectRequest) {
    const snapshot = this._projects();
    this._projects.update((list) =>
      list.map((p) => p.id === projectId ? { ...p, ...req } : p)
    );

    return this.http.patch<Project>(`${environment.apiUrl}/projects/${projectId}`, req).pipe(
      tap((updated) => this._projects.update((list) => list.map((p) => p.id === projectId ? updated : p))),
      catchError((err: HttpErrorResponse) => {
        this._projects.set(snapshot);
        return throwError(() => err);
      })
    );
  }

  delete(projectId: string) {
    const snapshot = this._projects();
    this._projects.update((list) => list.filter((p) => p.id !== projectId));

    return this.http.delete<void>(`${environment.apiUrl}/projects/${projectId}`).pipe(
      catchError((err: HttpErrorResponse) => {
        this._projects.set(snapshot);
        return throwError(() => err);
      })
    );
  }
}
