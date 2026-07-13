import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CreateProjectRequest, Project } from '../models/project.model';

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
}
