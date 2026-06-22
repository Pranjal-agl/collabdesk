import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface Project { id: string; name: string; description: string | null; }

@Component({
  selector: 'cd-project-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <main>
      <h1>Your projects</h1>
      <ul role="list">
        @for (project of projects(); track project.id) {
          <li>
            <a [routerLink]="['/projects', project.id, 'issues']"
               [attr.aria-label]="'Open project: ' + project.name">
              {{ project.name }}
            </a>
            @if (project.description) {
              <p>{{ project.description }}</p>
            }
          </li>
        } @empty {
          <li>No projects yet.</li>
        }
      </ul>
    </main>
  `
})
export class ProjectListComponent implements OnInit {
  private http = inject(HttpClient);
  projects     = signal<Project[]>([]);

  ngOnInit() {
    this.http.get<Project[]>(`${environment.apiUrl}/projects`).subscribe(
      p => this.projects.set(p)
    );
  }
}
