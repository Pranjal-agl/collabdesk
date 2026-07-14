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

    <header role="banner">
      <nav aria-label="Main navigation">
        <a routerLink="/projects" aria-label="CollabDesk home">CollabDesk</a>
        @if (auth.currentUser()?.role === 'ADMIN') {
          <a routerLink="/admin/audit-log">Audit log</a>
        }
        @if (auth.isAuthenticated()) {
          <button (click)="auth.logout()" aria-label="Sign out">Sign out</button>
        }
      </nav>
    </header>

    <!-- tabindex=-1 lets us programmatically focus this on route change, so
         screen reader / keyboard users land somewhere sensible instead of
         staying focused on a now-stale link in the previous page. -->
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
    header { padding: 1rem; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; gap: 1rem; }
    nav { display: flex; gap: 1rem; align-items: center; }
    main { padding: 1.5rem; }
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
        // Move focus to the main landmark on every navigation so keyboard and
        // screen-reader users aren't silently left focused on a link that no
        // longer matches what's on screen.
        const main = this.host.nativeElement.querySelector<HTMLElement>('#main-content');
        main?.focus();
      });
  }
}
