package com.collabdesk.service;

import com.collabdesk.audit.AuditService;
import com.collabdesk.domain.entity.Comment;
import com.collabdesk.domain.entity.User;
import com.collabdesk.dto.request.CreateCommentRequest;
import com.collabdesk.dto.response.CommentResponse;
import com.collabdesk.repository.CommentRepository;
import com.collabdesk.repository.IssueRepository;
import com.collabdesk.websocket.CommentEventPublisher;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CommentService {

    private final CommentRepository commentRepository;
    private final IssueRepository issueRepository;
    private final CommentEventPublisher eventPublisher;
    private final AuditService auditService;

    public List<CommentResponse> list(UUID issueId, User actor) {
        ensureIssueInTenant(issueId, actor.getTenantId());
        return commentRepository.findAllByTenantIdAndIssueIdOrderByCreatedAtAsc(actor.getTenantId(), issueId)
                .stream()
                .map(CommentResponse::from)
                .toList();
    }

    @Transactional
    public CommentResponse create(UUID issueId, CreateCommentRequest req, User actor) {
        ensureIssueInTenant(issueId, actor.getTenantId());

        var comment = Comment.builder()
                .tenantId(actor.getTenantId())
                .issueId(issueId)
                .authorId(actor.getId())
                .body(req.body())
                .build();

        Comment saved = commentRepository.save(comment);
        CommentResponse response = CommentResponse.from(saved);
        eventPublisher.publishCreated(issueId, response);
        auditService.log(actor.getTenantId(), actor.getId(), "CREATE", "COMMENT", saved.getId(), saved.getBody());
        return response;
    }

    @Transactional
    @PreAuthorize("@authz.canEditComment(#commentId, authentication)")
    public void delete(UUID issueId, UUID commentId, User actor) {
        ensureIssueInTenant(issueId, actor.getTenantId());

        Comment comment = commentRepository.findByIdAndTenantId(commentId, actor.getTenantId())
                .filter(c -> c.getIssueId().equals(issueId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));

        commentRepository.delete(comment);
        eventPublisher.publishDeleted(issueId, commentId);
        auditService.log(actor.getTenantId(), actor.getId(), "DELETE", "COMMENT", commentId, comment.getBody());
    }

    private void ensureIssueInTenant(UUID issueId, UUID tenantId) {
        issueRepository.findByIdAndTenantId(issueId, tenantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
}
