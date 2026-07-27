import { ChangeDetectionStrategy, Component, ElementRef, OnInit, inject } from '@angular/core';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'cd-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink],
  template: `
    <a href="#main-content" class="skip-link">Skip to main content</a>

    <div class="shell">
      <header class="rail" role="banner">
        <a routerLink="/projects" class="rail-brand" aria-label="CollabDesk home">
          <span class="rail-mark">CD</span>
          <span class="rail-name">Collab<br/>Desk</span>
        </a>

        <nav aria-label="Main navigation" class="rail-nav">
          <a routerLink="/projects" class="rail-link">Projects</a>
          @if (auth.currentUser()?.role === 'ADMIN') {
            <a routerLink="/admin/audit-log" class="rail-link">Audit log</a>
          }
        </nav>

        @if (auth.isAuthenticated()) {
          <div class="rail-user">
            <span class="badge badge-live">On shift</span>
            <button (click)="auth.logout()" class="rail-signout" aria-label="Sign out">Sign out</button>
          </div>
        }
      </header>

      <main id="main-content" class="app-main" tabindex="-1">
        <router-outlet/>
      </main>
    </div>
  `,
  styles: [`
    .shell {
      display: grid;
      grid-template-columns: 200px 1fr;
      min-height: 100vh;
    }
    .rail {
      background: var(--cd-surface);
      border-right: 1px solid var(--cd-border);
      padding: 1.5rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 2rem;
      position: sticky;
      top: 0;
      height: 100vh;
    }
    .rail-brand {
      display: flex; align-items: center; gap: 0.6rem;
      text-decoration: none; color: var(--cd-text);
    }
    .rail-mark {
      font-family: var(--cd-mono); font-weight: 700; font-size: 0.75rem;
      width: 32px; height: 32px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      background: var(--cd-amber-dim); color: var(--cd-amber);
      border: 1px solid rgba(255,180,84,0.35);
    }
    .rail-name {
      font-family: var(--cd-mono); font-weight: 600; font-size: 0.8rem;
      line-height: 1.1; letter-spacing: 0.01em;
    }
    .rail-nav { display: flex; flex-direction: column; gap: 0.25rem; flex: 1; }
    .rail-link {
      padding: 0.5rem 0.6rem; border-radius: 8px;
      text-decoration: none; color: var(--cd-text-dim);
      font-size: 0.875rem; font-weight: 500;
      border-left: 2px solid transparent;
      transition: color 0.15s, background 0.15s, border-color 0.15s;
    }
    .rail-link:hover {
      color: var(--cd-text); background: var(--cd-surface-raised);
      border-left-color: var(--cd-amber);
    }
    .rail-user {
      display: flex; flex-direction: column; gap: 0.6rem;
      padding-top: 1rem; border-top: 1px solid var(--cd-border);
    }
    .rail-signout {
      background: transparent; border: 1px solid var(--cd-border-strong);
      color: var(--cd-text-dim); border-radius: 8px;
      padding: 0.45rem 0.6rem; font-size: 0.8rem; cursor: pointer;
      transition: all 0.15s;
    }
    .rail-signout:hover { color: var(--cd-red); border-color: rgba(255,107,107,0.4); }

    .app-main {
      padding: 2rem 2.5rem;
      max-width: 1100px;
    }

    .skip-link {
      position: absolute; top: -40px; left: 0;
      background: var(--cd-amber); color: #12141a; padding: 8px 16px; z-index: 9999;
      transition: top 0.2s; text-decoration: none; font-weight: 600;
    }
    .skip-link:focus { top: 0; }

    @media (max-width: 720px) {
      .shell { grid-template-columns: 1fr; }
      .rail { position: static; height: auto; flex-direction: row; align-items: center; gap: 1rem; }
      .rail-nav { flex-direction: row; }
      .rail-user { flex-direction: row; border-top: none; padding-top: 0; }
      .app-main { padding: 1.25rem; }
    }
  `]
})
export class AppComponent implements OnInit {
  protected auth = inject(AuthService);
  private router = inject(Router);
  private host: ElementRef<HTMLElement> = inject(ElementRef);

  ngOnInit(): void {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        const main = this.host.nativeElement.querySelector<HTMLElement>('#main-content');
        main?.focus();
      });
  }
}
