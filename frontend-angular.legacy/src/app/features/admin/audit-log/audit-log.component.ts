import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { AuditLogEntry, Page } from '../../../core/models/audit-log.model';

@Component({
  selector: 'cd-audit-log',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <main class="audit-shell">
      <h2>Audit log</h2>
      <p class="hint">Every create/update/delete across this tenant, most recent first. Admin-only — enforced server-side.</p>

      @if (loading()) {
        <p role="status" aria-label="Loading audit log">Loading…</p>
      } @else if (entries().length === 0) {
        <p>No audit entries yet.</p>
      } @else {
        <table aria-label="Audit log entries">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Action</th>
              <th scope="col">Resource</th>
              <th scope="col">Actor</th>
              <th scope="col">Detail</th>
            </tr>
          </thead>
          <tbody>
            @for (entry of entries(); track entry.id) {
              <tr>
                <td>{{ entry.createdAt | date: 'medium' }}</td>
                <td>{{ entry.action }}</td>
                <td>{{ entry.resourceType }} · {{ entry.resourceId }}</td>
                <td>{{ entry.actorId }}</td>
                <td>{{ entry.payload }}</td>
              </tr>
            }
          </tbody>
        </table>

        <div class="pager">
          <button type="button" [disabled]="page() === 0" (click)="goTo(page() - 1)">Previous</button>
          <span>Page {{ page() + 1 }} of {{ totalPages() || 1 }}</span>
          <button type="button" [disabled]="page() + 1 >= totalPages()" (click)="goTo(page() + 1)">Next</button>
        </div>
      }
    </main>
  `,
  styles: [
    '.audit-shell { display: grid; gap: 1rem; }',
    '.hint { opacity: 0.75; font-size: 0.9rem; }',
    'table { width: 100%; border-collapse: collapse; }',
    'th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid rgba(0,0,0,0.08); font-size: 0.9rem; }',
    '.pager { display: flex; gap: 1rem; align-items: center; }'
  ]
})
export class AuditLogComponent implements OnInit {
  private http = inject(HttpClient);

  readonly entries = signal<AuditLogEntry[]>([]);
  readonly loading = signal(false);
  readonly page = signal(0);
  readonly totalPages = signal(0);

  ngOnInit(): void {
    this.load(0);
  }

  goTo(page: number): void {
    this.load(page);
  }

  private load(page: number): void {
    this.loading.set(true);
    this.http
      .get<Page<AuditLogEntry>>(`${environment.apiUrl}/audit-logs?page=${page}&size=50`)
      .subscribe({
        next: (res) => {
          this.entries.set(res.content);
          this.page.set(res.number);
          this.totalPages.set(res.totalPages);
          this.loading.set(false);
        },
        error: () => this.loading.set(false)
      });
  }
}
