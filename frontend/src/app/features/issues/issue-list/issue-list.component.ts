import {
  ChangeDetectionStrategy, Component, OnInit, OnDestroy,
  inject, input, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Subject, takeUntil } from 'rxjs';
import { IssueService } from '../../../core/services/issue.service';
import { WebSocketService } from '../../../core/services/websocket.service';
import { Issue } from '../../../core/models/issue.model';

@Component({
  selector: 'cd-issue-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <!-- Hidden heading for screen readers -->
    <h2 class="sr-only">Issues for project {{ projectId() }}</h2>

    <!-- aria-live region: announces real-time updates to screen readers -->
    <div aria-live="polite" aria-atomic="false" class="sr-only" id="live-region">
      {{ liveMessage() }}
    </div>

    @if (issueService.loading()) {
      <div role="status" aria-label="Loading issues">
        <p>Loading issues…</p>
      </div>
    }

    <ul role="list" aria-label="Issue list">
      @for (issue of issueService.issues(); track issue.id) {
        <li role="listitem">
          <article>
            <h3>{{ issue.title }}</h3>
            <span [attr.aria-label]="'Status: ' + issue.status">{{ issue.status }}</span>
            <span [attr.aria-label]="'Priority: ' + issue.priority">{{ issue.priority }}</span>

            <button
              (click)="markDone(issue)"
              [attr.aria-label]="'Mark issue ' + issue.title + ' as done'"
              [disabled]="issue.status === 'DONE'">
              Mark done
            </button>
          </article>
        </li>
      } @empty {
        <li><p>No issues yet. Create one to get started.</p></li>
      }
    </ul>
  `,
  styles: [`.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }`]
})
export class IssueListComponent implements OnInit, OnDestroy {

  projectId = input.required<string>();

  protected issueService = inject(IssueService);
  private ws             = inject(WebSocketService);
  private snackBar       = inject(MatSnackBar);
  private liveAnnouncer  = inject(LiveAnnouncer);

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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
