import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'cd-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatProgressSpinnerModule
  ],
  template: `
    <main class="login-wrapper" role="main">
      <h1 id="login-heading">Sign in to CollabDesk</h1>

      <form [formGroup]="form" (ngSubmit)="submit()" aria-labelledby="login-heading">

        <mat-form-field appearance="outline">
          <mat-label>Email</mat-label>
          <input matInput type="email" formControlName="email"
                 autocomplete="email" aria-required="true"/>
          @if (form.controls.email.invalid && form.controls.email.touched) {
            <mat-error>A valid email is required</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Password</mat-label>
          <input matInput type="password" formControlName="password"
                 autocomplete="current-password" aria-required="true"/>
        </mat-form-field>

        @if (errorMessage()) {
          <!-- aria-live region: screen readers announce errors without focus change -->
          <p role="alert" aria-live="assertive" class="error-message">
            {{ errorMessage() }}
          </p>
        }

        <button mat-raised-button color="primary" type="submit"
                [disabled]="form.invalid || loading()">
          @if (loading()) {
            <mat-spinner diameter="20"/>
          } @else {
            Sign in
          }
        </button>
      </form>
    </main>
  `,
  styles: [`
    .login-wrapper { max-width: 400px; margin: 4rem auto; padding: 2rem; display: flex; flex-direction: column; gap: 1rem; }
    form { display: flex; flex-direction: column; gap: 1rem; }
    .error-message { color: var(--mat-sys-error); font-size: 14px; }
  `]
})
export class LoginComponent {
  private auth    = inject(AuthService);
  private router  = inject(Router);
  private fb      = inject(FormBuilder);

  form = this.fb.nonNullable.group({
    email:    ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  loading      = signal(false);
  errorMessage = signal<string | null>(null);

  submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.errorMessage.set(null);

    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => this.router.navigate(['/projects']),
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        // Log the real error for anyone debugging - the UI message below is
        // deliberately vague for 401s (don't reveal whether the email exists),
        // but a network/server failure is a different problem entirely and
        // showing "wrong password" for it just sends people down the wrong path.
        console.error('Login failed:', err);
        if (err.status === 0) {
          this.errorMessage.set("Can't reach the server. Check your connection and that the backend is running.");
        } else if (err.status === 401) {
          this.errorMessage.set('Invalid email or password. Please try again.');
        } else if (err.status === 429) {
          this.errorMessage.set('Too many attempts. Please wait a moment and try again.');
        } else {
          this.errorMessage.set('Something went wrong on our end. Please try again shortly.');
        }
      }
    });
  }
}
