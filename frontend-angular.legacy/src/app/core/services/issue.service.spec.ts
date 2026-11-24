import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { IssueService } from './issue.service';
import { Issue, Page } from '../models/issue.model';
import { environment } from '../../../environments/environment';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'issue-1',
    projectId: 'project-1',
    title: 'Original title',
    description: null,
    status: 'TODO',
    priority: 'MEDIUM',
    assigneeId: null,
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    version: 1,
    ...overrides
  };
}

describe('IssueService', () => {
  let service: IssueService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(IssueService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function seedIssues(...issues: Issue[]) {
    const page: Page<Issue> = { content: issues, totalElements: issues.length, totalPages: 1, number: 0, size: 25 };
    service.loadForProject('project-1').subscribe();
    httpMock.expectOne(`${environment.apiUrl}/projects/project-1/issues`).flush(page);
  }

  it('applies the patch locally before the server responds (optimistic UI)', () => {
    seedIssues(makeIssue());

    service.updateOptimistic('project-1', 'issue-1', { status: 'DONE', version: 1 }).subscribe();

    // The change is visible immediately, before we flush the HTTP response.
    expect(service.issues()[0].status).toBe('DONE');

    httpMock.expectOne(`${environment.apiUrl}/projects/project-1/issues/issue-1`).flush(makeIssue({ status: 'DONE', version: 2 }));
  });

  it('reconciles with the server response once it arrives (server is truth)', () => {
    seedIssues(makeIssue());

    let result: Issue | undefined;
    service.updateOptimistic('project-1', 'issue-1', { status: 'DONE', version: 1 })
      .subscribe(issue => (result = issue));

    // Server disagrees slightly on the final shape (e.g. bumped version, server-set updatedAt).
    const serverTruth = makeIssue({ status: 'DONE', version: 2, updatedAt: '2026-01-02T00:00:00Z' });
    httpMock.expectOne(`${environment.apiUrl}/projects/project-1/issues/issue-1`).flush(serverTruth);

    expect(result).toEqual(serverTruth);
    expect(service.issues()[0]).toEqual(serverTruth);
  });

  it('rolls back to the pre-update snapshot when the server call fails', () => {
    const original = makeIssue({ status: 'TODO', version: 1 });
    seedIssues(original);

    let error: unknown;
    service.updateOptimistic('project-1', 'issue-1', { status: 'DONE', version: 1 }).subscribe({
      error: (err) => (error = err)
    });

    // Optimistic state is applied...
    expect(service.issues()[0].status).toBe('DONE');

    // ...but the server rejects it (e.g. a 409 version conflict).
    httpMock.expectOne(`${environment.apiUrl}/projects/project-1/issues/issue-1`)
      .flush('Conflict', { status: 409, statusText: 'Conflict' });

    // Rolled back to exactly what it was before the optimistic write.
    expect(service.issues()[0]).toEqual(original);
    expect(error).toBeTruthy();
  });

  it('does not let a failed update on one issue affect the rest of the list', () => {
    const untouched = makeIssue({ id: 'issue-2', title: 'Untouched issue' });
    seedIssues(makeIssue({ id: 'issue-1' }), untouched);

    service.updateOptimistic('project-1', 'issue-1', { status: 'DONE', version: 1 }).subscribe({ error: () => {} });
    httpMock.expectOne(`${environment.apiUrl}/projects/project-1/issues/issue-1`)
      .flush('Conflict', { status: 409, statusText: 'Conflict' });

    expect(service.issues().find(i => i.id === 'issue-2')).toEqual(untouched);
  });
});
