export interface Comment {
  id: string;
  issueId: string;
  authorId: string;
  body: string;
  createdAt: string;
  version: number;
}

export interface CreateCommentRequest {
  body: string;
}

export interface CommentCreatedEvent {
  type: 'CREATED';
  data: Comment;
}

export interface CommentDeletedEvent {
  type: 'DELETED';
  commentId: string;
}

export type CommentEvent = CommentCreatedEvent | CommentDeletedEvent;
