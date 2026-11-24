import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Comment, CommentEvent, CreateCommentRequest } from '../models/comment.model';

@Injectable({ providedIn: 'root' })
export class CommentService {
  private readonly _comments = signal<Comment[]>([]);
  readonly comments = this._comments.asReadonly();

  private readonly _loading = signal(false);
  readonly loading = this._loading.asReadonly();

  constructor(private http: HttpClient) {}

  loadForIssue(issueId: string) {
    this._loading.set(true);
    return this.http.get<Comment[]>(`${environment.apiUrl}/issues/${issueId}/comments`).pipe(
      tap({
        next: (comments) => {
          this._comments.set(comments);
          this._loading.set(false);
        },
        error: () => this._loading.set(false)
      })
    );
  }

  create(issueId: string, req: CreateCommentRequest) {
    return this.http.post<Comment>(`${environment.apiUrl}/issues/${issueId}/comments`, req).pipe(
      tap((comment) => {
        if (!this._comments().some((c) => c.id === comment.id)) {
          this._comments.update((list) => [...list, comment]);
        }
      })
    );
  }

  delete(issueId: string, commentId: string) {
    return this.http.delete<void>(`${environment.apiUrl}/issues/${issueId}/comments/${commentId}`).pipe(
      tap(() => this._comments.update((list) => list.filter((c) => c.id !== commentId)))
    );
  }

  applyServerPush(event: CommentEvent): void {
    if (event.type === 'CREATED') {
      if (!this._comments().some((comment) => comment.id === event.data.id)) {
        this._comments.update((list) => [...list, event.data]);
      }
      return;
    }

    this._comments.update((list) => list.filter((comment) => comment.id !== event.commentId));
  }

  reset(): void {
    this._comments.set([]);
    this._loading.set(false);
  }
}
