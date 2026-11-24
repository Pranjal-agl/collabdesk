import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject, takeUntil } from 'rxjs';
import { IssueService } from '../../../core/services/issue.service';
import { WebSocketService } from '../../../core/services/websocket.service';
import { AuthService } from '../../../core/services/auth.service';
import { Issue, IssueStatus, Priority } from '../../../core/models/issue.model';
import { CommentThreadComponent } from '../comment-thread/comment-thread.component';

interface PresenceUser { userId: string; displayName: string; }
interface PresenceEvent { projectId: string; users: PresenceUser[]; }

@Component({
  selector: 'cd-issue-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, RouterLink, ReactiveFormsModule,
    MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    CommentThreadComponent
  ],
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
          @if (editing()) {
            <form [formGroup]="editForm" (ngSubmit)="saveEdit()" class="edit-form">
              <mat-form-field appearance="outline">
                <mat-label>Title</mat-label>
                <input matInput formControlName="title" maxlength="300" />
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Description</mat-label>
                <textarea matInput formControlName="description" rows="4" maxlength="5000"></textarea>
              </mat-form-field>

              <div class="field-row">
                <mat-form-field appearance="outline">
                  <mat-label>Status</mat-label>
                  <mat-select formControlName="status">
                    @for (s of statuses; track s) { <mat-option [value]="s">{{ s }}</mat-option> }
                  </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Priority</mat-label>
                  <mat-select formControlName="priority">
                    @for (p of priorities; track p) { <mat-option [value]="p">{{ p }}</mat-option> }
                  </mat-select>
                </mat-form-field>
              </div>

              <div class="edit-actions">
                <button mat-flat-button color="primary" type="submit" [disabled]="editForm.invalid || saving()">
                  @if (saving()) { Saving... } @else { Save changes }
                </button>
                <button mat-button type="button" (click)="cancelEdit()">Cancel</button>
              </div>
            </form>
          } @else {
            <header>
              <h2>{{ issue()!.title }}</h2>
              <p>{{ issue()!.description || 'No description' }}</p>
            </header>

            <div class="meta-row">
              <span>Status: {{ issue()!.status }}</span>
              <span>Priority: {{ issue()!.priority }}</span>
            </div>

            <div class="action-row">
              <button mat-flat-button color="primary" type="button" (click)="toggleDone()">
                {{ issue()!.status === 'DONE' ? 'Reopen issue' : 'Mark done' }}
              </button>
              <button mat-button type="button" (click)="startEdit()">Edit</button>
            </div>
          }
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
    '.action-row { display: flex; gap: 0.5rem; }',
    '.presence-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; font-size: 0.85rem; opacity: 0.85; }',
    '.presence-chip { border: 1px solid rgba(0,0,0,0.15); border-radius: 999px; padding: 0.1rem 0.6rem; }',
    '.edit-form { display: grid; gap: 0.75rem; }',
    '.field-row { display: flex; gap: 0.75rem; flex-wrap: wrap; }',
    '.field-row mat-form-field { flex: 1; min-width: 160px; }',
    '.edit-actions { display: flex; gap: 0.5rem; }'
  ]
})
export class IssueDetailComponent implements OnInit, OnDestroy {
  projectId = input.required<string>();
  issueId = input.required<string>();

  private issueService = inject(IssueService);
  private ws = inject(WebSocketService);
  private auth = inject(AuthService);
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  readonly statuses: IssueStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'];
  readonly priorities: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

  readonly issue = signal<Issue | null>(null);
  readonly presentUsers = signal<PresenceUser[]>([]);
  readonly editing = signal(false);
  readonly saving = signal(false);

  readonly editForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(300)]],
    description: ['', Validators.maxLength(5000)],
    status: ['TODO' as IssueStatus, Validators.required],
    priority: ['MEDIUM' as Priority, Validators.required]
  });

  private readonly destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.issueService.getById(this.projectId(), this.issueId()).subscribe((issue) => this.issue.set(issue));

    this.ws.connect();
    this.ws.subscribe<{ type: string; data: Issue }>(`/topic/issues/${this.projectId()}`)
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        if (event.data.id === this.issueId() && !this.editing()) {
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

  startEdit(): void {
    const current = this.issue();
    if (!current) {
      return;
    }
    this.editForm.setValue({
      title: current.title,
      description: current.description ?? '',
      status: current.status,
      priority: current.priority
    });
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
  }

  saveEdit(): void {
    const current = this.issue();
    if (!current || this.editForm.invalid || this.saving()) {
      return;
    }

    this.saving.set(true);
    const { title, description, status, priority } = this.editForm.getRawValue();

    this.issueService.updateOptimistic(this.projectId(), current.id, {
      title: title.trim(),
      description: description.trim() || null,
      status,
      priority,
      version: current.version
    }).subscribe({
      next: (updated) => {
        this.issue.set(updated);
        this.saving.set(false);
        this.editing.set(false);
      },
      error: (err) => {
        this.saving.set(false);
        const message = err.status === 409
          ? 'Issue changed elsewhere. Please refresh and retry.'
          : 'Could not save changes';
        this.snackBar.open(message, 'Dismiss', { duration: 4000 });
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
