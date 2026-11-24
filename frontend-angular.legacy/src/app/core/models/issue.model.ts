export type IssueStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'CANCELLED';
export type Priority    = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Issue {
  id:          string;
  projectId:   string;
  title:       string;
  description: string | null;
  status:      IssueStatus;
  priority:    Priority;
  assigneeId:  string | null;
  createdBy:   string;
  createdAt:   string;
  updatedAt:   string;
  version:     number;
}

export interface Page<T> {
  content:          T[];
  totalElements:    number;
  totalPages:       number;
  number:           number;
  size:             number;
}
