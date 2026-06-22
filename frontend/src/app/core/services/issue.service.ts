import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, shareReplay, tap, catchError, throwError } from 'rxjs';
import { Issue, Page } from '../models/issue.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class IssueService {

  /**
   * Signal holding the in-memory issue list for the active project.
   * Optimistic updates mutate this immediately; rollback restores the snapshot.
   */
  private readonly _issues = signal<Issue[]>([]);
  readonly issues = this._issues.asReadonly();

  private readonly _loading = signal(false);
  readonly loading = this._loading.asReadonly();

  constructor(private http: HttpClient) {}

  loadForProject(projectId: string): Observable<Page<Issue>> {
    this._loading.set(true);
    return this.http
      .get<Page<Issue>>(`${environment.apiUrl}/projects/${projectId}/issues`)
      .pipe(
        tap(page => {
          this._issues.set(page.content);
          this._loading.set(false);
        }),
        shareReplay(1)   // deduplicate concurrent subscribers
      );
  }

  /**
   * Optimistic update:
   * 1. Snapshot current state
   * 2. Apply change locally → UI is instant
   * 3. PATCH server
   * 4. On success → reconcile with server response (server is truth)
   * 5. On 409/error → rollback to snapshot + surface error
   */
  updateOptimistic(
    projectId: string,
    issueId: string,
    patch: Partial<Issue> & { version: number }
  ): Observable<Issue> {
    // Step 1 — snapshot
    const snapshot = this._issues();

    // Step 2 — apply locally
    this._issues.update(list =>
      list.map(i => i.id === issueId ? { ...i, ...patch } : i)
    );

    // Step 3 & 4 — server call
    return this.http
      .patch<Issue>(`${environment.apiUrl}/projects/${projectId}/issues/${issueId}`, patch)
      .pipe(
        // Step 4 — reconcile with server truth
        tap(serverIssue => {
          this._issues.update(list =>
            list.map(i => i.id === issueId ? serverIssue : i)
          );
        }),
        // Step 5 — rollback on any error
        catchError((err: HttpErrorResponse) => {
          this._issues.set(snapshot);
          return throwError(() => err);
        })
      );
  }

  /** Called from WebSocket handler to apply server-pushed updates without re-fetching. */
  applyServerPush(event: { type: string; data: Issue }): void {
    switch (event.type) {
      case 'CREATED':
        this._issues.update(list => [event.data, ...list]);
        break;
      case 'UPDATED':
        this._issues.update(list =>
          list.map(i => i.id === event.data.id ? event.data : i)
        );
        break;
    }
  }

  removeById(issueId: string): void {
    this._issues.update(list => list.filter(i => i.id !== issueId));
  }
}
