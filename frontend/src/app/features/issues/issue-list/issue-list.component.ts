import {
  ChangeDetectionStrategy, Component, OnInit, OnDestroy,
  inject, input, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Subject, finalize, takeUntil } from 'rxjs';
import { IssueService } from '../../../core/services/issue.service';
import { WebSocketService } from '../../../core/services/websocket.service';
import { Issue, Priority } from '../../../core/models/issue.model';

@Component({
  selector: 'cd-issue-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, RouterLink, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule
  ],
  template: `
    <!-- Hidden heading for screen readers -->
    <h2 class="sr-only">Issues for project {{ projectId() }}</h2>

    <!-- aria-live region: announces real-time updates to screen readers -->
    <div aria-live="polite" aria-atomic="false" class="sr-only" id="live-region">
      {{ liveMessage() }}
    </div>

    <section class="panel create-panel enter" aria-label="Create issue">
      <form [formGroup]="createForm" (ngSubmit)="createIssue()">
        <mat-form-field appearance="outline" class="title-field">
          <mat-label>New issue title</mat-label>
          <input matInput formControlName="title" maxlength="300" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="priority-field">
          <mat-label>Priority</mat-label>
          <mat-select formControlName="priority">
            @for (p of priorities; track p) {
              <mat-option [value]="p">{{ p }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <button mat-flat-button color="primary" type="submit" [disabled]="createForm.invalid || creating()">
          @if (creating()) { Adding... } @else { Add issue }
        </button>
      </form>
    </section>

    @if (issueService.loading()) {
      <div role="status" aria-label="Loading issues" class="loading-state">
        <p>Loading issues…</p>
      </div>
    }

    <ul role="list" aria-label="Issue list" class="ticket-list">
      @for (issue of issueService.issues(); track issue.id) {
        <li role="listitem">
          <article class="ticket enter">
            <div class="ticket-stub" [ngClass]="'stub-' + issue.priority.toLowerCase()">
              {{ issue.priority }}
            </div>
            <div class="ticket-body">
              <h3>{{ issue.title }}</h3>
              <div class="ticket-meta">
                <span class="badge" [class.badge-done]="issue.status === 'DONE'"
                      [attr.aria-label]="'Status: ' + issue.status">{{ issue.status }}</span>
              </div>
              <div class="ticket-actions">
                <button
                  mat-button
                  (click)="markDone(issue)"
                  [attr.aria-label]="'Mark issue ' + issue.title + ' as done'"
                  [disabled]="issue.status === 'DONE'">
                  Mark done
                </button>
                <a mat-button [routerLink]="['/projects', projectId(), 'issues', issue.id]"
                   [attr.aria-label]="'Open details for issue ' + issue.title">
                  Details
                </a>
                <button
                  mat-button
                  (click)="deleteIssue(issue)"
                  [attr.aria-label]="'Delete issue ' + issue.title"
                  class="delete-btn">
                  Delete
                </button>
              </div>
            </div>
          </article>
        </li>
      } @empty {
        <li><p class="empty-state">No issues yet. Add one above to get started.</p></li>
      }
    </ul>
  `,
  styles: [`
    .create-panel form { display: flex; gap: 0.75rem; align-items: flex-start; flex-wrap: wrap; margin-bottom: 0; }
    .title-field { flex: 2; min-width: 220px; }
    .priority-field { flex: 1; min-width: 140px; }
    .loading-state { color: var(--cd-text-dim); margin: 1rem 0; }
    .ticket-list { list-style: none; padding: 0; margin: 1.25rem 0 0; display: grid; gap: 0.75rem; }
    .ticket-body h3 { margin: 0 0 0.5rem; font-size: 0.95rem; font-family: var(--cd-sans); font-weight: 600; }
    .ticket-meta { margin-bottom: 0.4rem; }
    .ticket-actions { display: flex; gap: 0.25rem; flex-wrap: wrap; }
    .delete-btn { color: var(--cd-red); }
    .empty-state { color: var(--cd-text-dim); }
  `]
})
export class IssueListComponent implements OnInit, OnDestroy {

  projectId = input.required<string>();

  protected issueService = inject(IssueService);
  private ws             = inject(WebSocketService);
  private snackBar       = inject(MatSnackBar);
  private liveAnnouncer  = inject(LiveAnnouncer);
  private fb             = inject(FormBuilder);

  readonly priorities: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  readonly createForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(300)]],
    priority: ['MEDIUM' as Priority, Validators.required]
  });
  readonly creating = signal(false);

  liveMessage = signal('');

  private readonly destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.issueService.loadForProject(this.projectId()).subscribe();

    // Connect WebSocket and subscribe to real-time issue events
    this.ws.connect();
    this.ws.subscribe<{ type: string; data: Issue }>(
      `/topic/issues/${this.projectId()}`
    )
    .pipe(takeUntil(this.destroy$))
    .subscribe(event => {
      this.issueService.applyServerPush(event);

      // Announce update to screen readers via live region
      const msg = event.type === 'CREATED'
        ? `New issue created: ${event.data.title}`
        : `Issue updated: ${event.data.title}`;
      this.liveAnnouncer.announce(msg, 'polite');
      this.liveMessage.set(msg);
    });
  }

  createIssue(): void {
    if (this.createForm.invalid || this.creating()) {
      return;
    }

    this.creating.set(true);
    const { title, priority } = this.createForm.getRawValue();

    this.issueService
      .create(this.projectId(), { projectId: this.projectId(), title: title.trim(), priority })
      .pipe(finalize(() => this.creating.set(false)))
      .subscribe({
        next: (issue) => {
          this.createForm.reset({ title: '', priority: 'MEDIUM' });
          this.liveAnnouncer.announce(`Issue "${issue.title}" created`, 'polite');
        },
        error: () => this.snackBar.open('Could not create issue. Please try again.', 'Dismiss', { duration: 4000 })
      });
  }

  markDone(issue: Issue): void {
    this.issueService
      .updateOptimistic(this.projectId(), issue.id, {
        status: 'DONE',
        version: issue.version
      })
      .subscribe({
        next: () => this.liveAnnouncer.announce(`Issue "${issue.title}" marked as done`, 'polite'),
        error: (err) => {
          const msg = err.status === 409
            ? 'This issue was updated by someone else. Changes rolled back.'
            : 'Failed to update issue. Changes rolled back.';
          this.snackBar.open(msg, 'Dismiss', { duration: 5000 });
          this.liveAnnouncer.announce(msg, 'assertive');
        }
      });
  }

  deleteIssue(issue: Issue): void {
    if (!confirm(`Delete "${issue.title}"? This can't be undone.`)) {
      return;
    }
    this.issueService.delete(this.projectId(), issue.id).subscribe({
      next: () => this.liveAnnouncer.announce(`Issue "${issue.title}" deleted`, 'polite'),
      error: () => this.snackBar.open('Could not delete issue. Please try again.', 'Dismiss', { duration: 4000 })
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
