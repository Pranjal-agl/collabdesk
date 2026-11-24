import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, input, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { CommentService } from '../../../core/services/comment.service';
import { WebSocketService } from '../../../core/services/websocket.service';
import { CommentEvent } from '../../../core/models/comment.model';

@Component({
  selector: 'cd-comment-thread',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule
  ],
  template: `
    <section aria-label="Issue comments" class="comment-shell">
      <h3>Discussion</h3>

      <div aria-live="polite" aria-atomic="false" class="sr-only">{{ liveMessage() }}</div>

      <form [formGroup]="form" (ngSubmit)="submit()" class="comment-form">
        <mat-form-field appearance="outline">
          <mat-label>Add a comment</mat-label>
          <textarea matInput formControlName="body" rows="3" maxlength="4000"></textarea>
        </mat-form-field>
        <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || submitting()">
          @if (submitting()) { Posting... } @else { Post comment }
        </button>
      </form>

      @if (commentService.loading()) {
        <p>Loading comments...</p>
      }

      <ul role="list" class="comment-list">
        @for (comment of commentService.comments(); track comment.id) {
          <li role="listitem">
            <article class="comment-card">
              <p>{{ comment.body }}</p>
              <footer>
                <small>{{ comment.createdAt | date:'short' }}</small>
                @if (canDelete(comment.authorId)) {
                  <button mat-button type="button" (click)="deleteComment(comment.id)">Delete</button>
                }
              </footer>
            </article>
          </li>
        } @empty {
          <li><p>No comments yet.</p></li>
        }
      </ul>
    </section>
  `,
  styles: [
    '.comment-shell { display: grid; gap: 1rem; }',
    '.comment-form { display: grid; gap: 0.75rem; }',
    '.comment-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }',
    '.comment-card { padding: 0.9rem; border-radius: 0.75rem; border: 1px solid rgba(0,0,0,0.12); background: rgba(255,255,255,0.75); }',
    '.comment-card footer { display: flex; justify-content: space-between; align-items: center; }',
    '.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }'
  ]
})
export class CommentThreadComponent implements OnInit, OnDestroy {
  issueId = input.required<string>();

  protected commentService = inject(CommentService);
  private ws = inject(WebSocketService);
  private snackBar = inject(MatSnackBar);
  private announcer = inject(LiveAnnouncer);
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    body: ['', [Validators.required, Validators.maxLength(4000)]]
  });
  readonly submitting = signal(false);
  readonly liveMessage = signal('');

  private readonly destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.commentService.loadForIssue(this.issueId()).subscribe();

    this.ws.connect();
    this.ws.subscribe<CommentEvent>(`/topic/issues/${this.issueId()}/comments`)
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        this.commentService.applyServerPush(event);

        const message = event.type === 'CREATED'
          ? 'New comment posted'
          : 'A comment was deleted';
        this.liveMessage.set(message);
        this.announcer.announce(message, 'polite');
      });
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.commentService.create(this.issueId(), { body: this.form.controls.body.value.trim() })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.form.reset({ body: '' });
        },
        error: () => {
          this.submitting.set(false);
          this.snackBar.open('Could not post comment', 'Dismiss', { duration: 4000 });
        }
      });
  }

  deleteComment(commentId: string): void {
    this.commentService.delete(this.issueId(), commentId).subscribe({
      error: () => this.snackBar.open('Could not delete comment', 'Dismiss', { duration: 4000 })
    });
  }

  canDelete(authorId: string): boolean {
    return this.auth.currentUser()?.sub === authorId;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.commentService.reset();
  }
}
