import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { finalize } from 'rxjs';
import { ProjectService } from '../../../core/services/project.service';
import { Project } from '../../../core/models/project.model';

@Component({
  selector: 'cd-project-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule
  ],
  template: `
    <main class="dashboard-shell">
      <header class="hero enter">
        <p class="eyebrow">Ops board</p>
        <h1>Project dashboard</h1>
        <p class="subtitle">Spin up a workspace and jump straight into your issue board.</p>
      </header>

      <section class="panel create-panel enter" aria-label="Create project">
        <form [formGroup]="createForm" (ngSubmit)="createProject()">
          <mat-form-field appearance="outline">
            <mat-label>Project name</mat-label>
            <input matInput formControlName="name" maxlength="200" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Description</mat-label>
            <textarea matInput formControlName="description" rows="2" maxlength="5000"></textarea>
          </mat-form-field>

          <button mat-flat-button color="primary" type="submit" [disabled]="createForm.invalid || submitting()">
            @if (submitting()) { Creating... } @else { Create project }
          </button>
        </form>
      </section>

      @if (projectService.loading()) {
        <div class="loading-state" role="status" aria-label="Loading projects">
          <mat-spinner diameter="28" />
          <span>Loading projects...</span>
        </div>
      }

      <section class="project-grid" role="list" aria-label="Project list">
        @for (project of projectService.projects(); track project.id) {
          <article class="card-raised project-card enter" role="listitem">
            @if (editingId() === project.id) {
              <div class="card-inner">
                <form [formGroup]="editForm" (ngSubmit)="saveEdit(project)" class="edit-form">
                  <mat-form-field appearance="outline">
                    <mat-label>Project name</mat-label>
                    <input matInput formControlName="name" maxlength="200" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Description</mat-label>
                    <textarea matInput formControlName="description" rows="2" maxlength="5000"></textarea>
                  </mat-form-field>
                  <div class="edit-actions">
                    <button mat-flat-button color="primary" type="submit" [disabled]="editForm.invalid || saving()">
                      @if (saving()) { Saving... } @else { Save }
                    </button>
                    <button mat-button type="button" (click)="cancelEdit()">Cancel</button>
                  </div>
                </form>
              </div>
            } @else {
              <div class="card-inner">
                <div class="card-head">
                  <h3>{{ project.name }}</h3>
                  <span class="card-date">{{ project.createdAt | date:'MMM d' }}</span>
                </div>
                <p class="card-desc">{{ project.description || 'No description yet.' }}</p>
                <div class="card-actions">
                  <a mat-button [routerLink]="['/projects', project.id, 'issues']">Open board →</a>
                  <button mat-button type="button" (click)="startEdit(project)">Edit</button>
                  <button mat-button type="button" class="delete-btn" (click)="deleteProject(project)">Delete</button>
                </div>
              </div>
            }
          </article>
        } @empty {
          <p class="empty-state">No projects yet. Create one above to get started.</p>
        }
      </section>
    </main>
  `,
  styles: [`
    .dashboard-shell { display: grid; gap: 1.5rem; }
    .hero .eyebrow {
      font-family: var(--cd-mono); font-size: 0.7rem; font-weight: 600;
      letter-spacing: 0.1em; text-transform: uppercase; color: var(--cd-amber);
      margin: 0 0 0.5rem;
    }
    .hero h1 { margin: 0 0 0.35rem; font-size: 1.6rem; }
    .hero .subtitle { margin: 0; color: var(--cd-text-dim); }
    .create-panel form { display: grid; gap: 0.75rem; max-width: 640px; }
    .project-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
    .card-inner { padding: 1.25rem; display: flex; flex-direction: column; gap: 0.6rem; height: 100%; box-sizing: border-box; }
    .card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; }
    .card-head h3 { margin: 0; font-size: 1rem; }
    .card-date { font-family: var(--cd-mono); font-size: 0.7rem; color: var(--cd-text-faint); white-space: nowrap; }
    .card-desc { margin: 0; color: var(--cd-text-dim); font-size: 0.875rem; flex: 1; }
    .card-actions { display: flex; gap: 0.25rem; margin-top: 0.25rem; }
    .loading-state { display: inline-flex; align-items: center; gap: 0.75rem; color: var(--cd-text-dim); }
    .edit-form { display: grid; gap: 0.75rem; }
    .edit-actions { display: flex; gap: 0.5rem; }
    .delete-btn { color: var(--cd-red); }
    .empty-state { color: var(--cd-text-dim); }
  `]
})
export class ProjectListComponent implements OnInit {
  protected projectService = inject(ProjectService);
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  readonly createForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', Validators.maxLength(5000)]
  });
  readonly submitting = signal(false);

  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly editForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', Validators.maxLength(5000)]
  });

  ngOnInit() {
    this.projectService.loadAll().subscribe();
  }

  createProject(): void {
    if (this.createForm.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.projectService
      .create({
        name: this.createForm.controls.name.value.trim(),
        description: this.createForm.controls.description.value.trim() || undefined
      })
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          this.createForm.reset({ name: '', description: '' });
          this.snackBar.open('Project created', 'Dismiss', { duration: 2500 });
        },
        error: () => this.snackBar.open('Could not create project', 'Dismiss', { duration: 4000 })
      });
  }

  startEdit(project: Project): void {
    this.editForm.setValue({
      name: project.name,
      description: project.description ?? ''
    });
    this.editingId.set(project.id);
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  saveEdit(project: Project): void {
    if (this.editForm.invalid || this.saving()) {
      return;
    }

    this.saving.set(true);
    const { name, description } = this.editForm.getRawValue();

    this.projectService
      .update(project.id, { name: name.trim(), description: description.trim(), version: project.version })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.editingId.set(null);
          this.snackBar.open('Project updated', 'Dismiss', { duration: 2500 });
        },
        error: (err) => {
          const msg = err.status === 409
            ? 'Project changed elsewhere. Please refresh and retry.'
            : 'Could not update project';
          this.snackBar.open(msg, 'Dismiss', { duration: 4000 });
        }
      });
  }

  deleteProject(project: Project): void {
    if (!confirm(`Delete "${project.name}" and all its issues? This can't be undone.`)) {
      return;
    }
    this.projectService.delete(project.id).subscribe({
      next: () => this.snackBar.open('Project deleted', 'Dismiss', { duration: 2500 }),
      error: () => this.snackBar.open('Could not delete project', 'Dismiss', { duration: 4000 })
    });
  }
}
