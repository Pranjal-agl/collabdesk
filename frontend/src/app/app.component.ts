import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'cd-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink],
  template: `
    <a href="#main-content" class="skip-link">Skip to main content</a>

    <header role="banner">
      <nav aria-label="Main navigation">
        <a routerLink="/projects" aria-label="CollabDesk home">CollabDesk</a>
        @if (auth.isAuthenticated()) {
          <button (click)="auth.logout()" aria-label="Sign out">Sign out</button>
        }
      </nav>
    </header>

    <main id="main-content" tabindex="-1">
      <router-outlet/>
    </main>
  `,
  styles: [`
    .skip-link {
      position: absolute; top: -40px; left: 0;
      background: #000; color: #fff; padding: 8px; z-index: 9999;
      transition: top 0.2s;
    }
    .skip-link:focus { top: 0; }
    header { padding: 1rem; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; }
    main { padding: 1.5rem; }
  `]
})
export class AppComponent {
  protected auth = inject(AuthService);
}
