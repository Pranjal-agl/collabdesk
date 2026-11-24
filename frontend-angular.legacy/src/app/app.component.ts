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

    <div class="grid-backdrop" aria-hidden="true"></div>

    <div class="shell">
      <header class="rail" role="banner">
        <a routerLink="/projects" class="rail-brand mono" aria-label="CollabDesk home">
          CD<span class="cursor">_</span>
        </a>

        <nav aria-label="Main navigation" class="rail-nav">
          <a routerLink="/projects" class="rail-link mono">projects</a>
          @if (auth.currentUser()?.role === 'ADMIN') {
            <a routerLink="/admin/audit-log" class="rail-link mono">audit_log</a>
          }
        </nav>

        @if (auth.isAuthenticated()) {
          <div class="rail-user">
            <span class="badge badge-live">online</span>
            <button (click)="auth.logout()" class="rail-signout mono" aria-label="Sign out">sign_out</button>
          </div>
        }
      </header>

      <main id="main-content" class="app-main" tabindex="-1">
        <router-outlet/>
      </main>
    </div>
  `,
  styles: [`
    .grid-backdrop {
      position: fixed; inset: 0; z-index: -1; pointer-events: none;
      background-image:
        linear-gradient(var(--border) 1px, transparent 1px),
        linear-gradient(90deg, var(--border) 1px, transparent 1px);
      background-size: 60px 60px;
      opacity: 0.3;
    }
    .shell { display: grid; grid-template-columns: 190px 1fr; min-height: 100vh; }
    .rail {
      background: rgba(10,10,10,0.85);
      backdrop-filter: blur(8px);
      border-right: 1px solid var(--border);
      padding: 1.5rem 1rem;
      display: flex; flex-direction: column; gap: 2.5rem;
      position: sticky; top: 0; height: 100vh;
    }
    .rail-brand {
      font-size: 1.1rem; font-weight: 700; letter-spacing: 0.02em;
      color: var(--accent); text-decoration: none;
    }
    .rail-brand .cursor { color: var(--text-muted); animation: blink 1.1s step-end infinite; }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

    .rail-nav { display: flex; flex-direction: column; gap: 0.25rem; flex: 1; }
    .rail-link {
      padding: 0.5rem 0.6rem; border-radius: 4px;
      text-decoration: none; color: var(--text-muted);
      font-size: 0.75rem; text-transform: lowercase; letter-spacing: 0.04em;
      border-left: 2px solid transparent;
      transition: color 0.15s, border-color 0.15s;
    }
    .rail-link:hover { color: var(--accent); border-left-color: var(--accent); }

    .rail-user { display: flex; flex-direction: column; gap: 0.75rem; padding-top: 1rem; border-top: 1px solid var(--border); }
    .rail-signout {
      background: transparent; border: 1px solid var(--border-strong);
      color: var(--text-muted); border-radius: 4px;
      padding: 0.4rem 0.5rem; font-size: 0.7rem; cursor: pointer;
      text-align: left; transition: all 0.15s;
    }
    .rail-signout:hover { color: var(--error); border-color: var(--error); }

    .app-main { padding: 2rem 2.5rem; max-width: 1100px; }

    .skip-link {
      position: absolute; top: -40px; left: 0;
      background: var(--accent); color: var(--bg); padding: 8px 16px; z-index: 9999;
      transition: top 0.2s; text-decoration: none; font-weight: 700;
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
