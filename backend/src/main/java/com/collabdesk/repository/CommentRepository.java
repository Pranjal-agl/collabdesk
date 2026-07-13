package com.collabdesk.repository;

import com.collabdesk.domain.entity.Comment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CommentRepository extends JpaRepository<Comment, UUID> {
    List<Comment> findAllByTenantIdAndIssueIdOrderByCreatedAtAsc(UUID tenantId, UUID issueId);
    Optional<Comment> findByIdAndTenantId(UUID id, UUID tenantId);
}
