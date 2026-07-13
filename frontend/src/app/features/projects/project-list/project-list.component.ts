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
      <header class="hero">
        <h1>Project dashboard</h1>
        <p>Spin up a workspace and jump straight into your issue board.</p>
      </header>

      <section class="create-panel" aria-label="Create project">
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
          <mat-card class="project-card" role="listitem">
            <mat-card-header>
              <mat-card-title>{{ project.name }}</mat-card-title>
              <mat-card-subtitle>{{ project.createdAt | date:'mediumDate' }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <p>{{ project.description || 'No description yet.' }}</p>
            </mat-card-content>
            <mat-card-actions>
              <a mat-button [routerLink]="['/projects', project.id, 'issues']">Open board</a>
            </mat-card-actions>
          </mat-card>
        } @empty {
          <p>No projects yet. Create one to get started.</p>
        }
      </section>
    </main>
  `,
  styles: [`
    .dashboard-shell { display: grid; gap: 1.5rem; }
    .hero h1 { margin-bottom: 0.35rem; }
    .hero p { margin: 0; opacity: 0.75; }
    .create-panel form { display: grid; gap: 0.75rem; max-width: 640px; }
    .project-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
    .project-card { height: 100%; }
    .loading-state { display: inline-flex; align-items: center; gap: 0.75rem; }
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
}
