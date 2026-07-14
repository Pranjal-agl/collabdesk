import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject, takeUntil } from 'rxjs';
import { IssueService } from '../../../core/services/issue.service';
import { WebSocketService } from '../../../core/services/websocket.service';
import { AuthService } from '../../../core/services/auth.service';
import { Issue } from '../../../core/models/issue.model';
import { CommentThreadComponent } from '../comment-thread/comment-thread.component';

interface PresenceUser { userId: string; displayName: string; }
interface PresenceEvent { projectId: string; users: PresenceUser[]; }

@Component({
  selector: 'cd-issue-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, MatButtonModule, CommentThreadComponent],
  template: `
    <main class="issue-detail-shell">
      <a [routerLink]="['/projects', projectId(), 'issues']">Back to board</a>

      @if (presentUsers().length > 0) {
        <!-- Presence isn't critical info, so it's polite (doesn't interrupt) not assertive. -->
        <div class="presence-row" role="status" aria-live="polite">
          <span class="presence-label">Viewing now:</span>
          @for (u of presentUsers(); track u.userId) {
            <span class="presence-chip">{{ u.displayName }}</span>
          }
        </div>
      }

      @if (issue()) {
        <section class="issue-card">
          <header>
            <h2>{{ issue()!.title }}</h2>
            <p>{{ issue()!.description || 'No description' }}</p>
          </header>

          <div class="meta-row">
            <span>Status: {{ issue()!.status }}</span>
            <span>Priority: {{ issue()!.priority }}</span>
          </div>

          <button mat-flat-button color="primary" type="button" (click)="toggleDone()">
            {{ issue()!.status === 'DONE' ? 'Reopen issue' : 'Mark done' }}
          </button>
        </section>

        <cd-comment-thread [issueId]="issueId()" />
      } @else {
        <p>Loading issue...</p>
      }
    </main>
  `,
  styles: [
    '.issue-detail-shell { display: grid; gap: 1.2rem; }',
    '.issue-card { border: 1px solid rgba(0,0,0,0.12); border-radius: 0.9rem; padding: 1rem; display: grid; gap: 0.8rem; }',
    '.meta-row { display: flex; gap: 1rem; flex-wrap: wrap; opacity: 0.8; }',
    '.presence-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; font-size: 0.85rem; opacity: 0.85; }',
    '.presence-chip { border: 1px solid rgba(0,0,0,0.15); border-radius: 999px; padding: 0.1rem 0.6rem; }'
  ]
})
export class IssueDetailComponent implements OnInit, OnDestroy {
  projectId = input.required<string>();
  issueId = input.required<string>();

  private issueService = inject(IssueService);
  private ws = inject(WebSocketService);
  private auth = inject(AuthService);
  private snackBar = inject(MatSnackBar);

  readonly issue = signal<Issue | null>(null);
  readonly presentUsers = signal<PresenceUser[]>([]);
  private readonly destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.issueService.getById(this.projectId(), this.issueId()).subscribe((issue) => this.issue.set(issue));

    this.ws.connect();
    this.ws.subscribe<{ type: string; data: Issue }>(`/topic/issues/${this.projectId()}`)
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        if (event.data.id === this.issueId()) {
          this.issue.set(event.data);
        }
      });

    // Presence: announce we're viewing this project, and reconcile against
    // the server's latest snapshot whenever it broadcasts one. We don't try
    // to merge join/leave deltas client-side — the snapshot is the only
    // source of truth, which keeps this eventually-consistent even if a
    // broadcast is missed during a reconnect.
    this.ws.subscribe<PresenceEvent>(`/topic/presence/${this.projectId()}`)
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        const me = this.auth.currentUser()?.sub;
        this.presentUsers.set(event.users.filter(u => u.userId !== me));
      });
    this.ws.publish(`/app/presence/${this.projectId()}/join`, {});
  }

  toggleDone(): void {
    const current = this.issue();
    if (!current) {
      return;
    }

    const status = current.status === 'DONE' ? 'IN_PROGRESS' : 'DONE';
    this.issueService.updateOptimistic(this.projectId(), current.id, {
      status,
      version: current.version
    }).subscribe({
      next: (updated) => this.issue.set(updated),
      error: (err) => {
        const message = err.status === 409
          ? 'Issue changed elsewhere. Please refresh and retry.'
          : 'Could not update issue';
        this.snackBar.open(message, 'Dismiss', { duration: 4000 });
        this.issueService.getById(this.projectId(), this.issueId()).subscribe((issue) => this.issue.set(issue));
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
