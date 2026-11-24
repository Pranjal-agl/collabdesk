package com.collabdesk.repository;

import com.collabdesk.domain.entity.Comment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CommentRepository extends JpaRepository<Comment, UUID> {
    List<Comment> findAllByTenantIdAndIssueIdOrderByCreatedAtAsc(UUID tenantId, UUID issueId);
    Optional<Comment> findByIdAndTenantId(UUID id, UUID tenantId);

    // Comments reference issues with a plain FK (no ON DELETE CASCADE), so they
    // must be removed before the issue/project rows they hang off.
    @Modifying
    @Query("DELETE FROM Comment c WHERE c.issueId = :issueId AND c.tenantId = :tenantId")
    void deleteAllForIssue(@Param("issueId") UUID issueId, @Param("tenantId") UUID tenantId);

    @Modifying
    @Query("DELETE FROM Comment c WHERE c.tenantId = :tenantId AND c.issueId IN "
         + "(SELECT i.id FROM Issue i WHERE i.projectId = :projectId AND i.tenantId = :tenantId)")
    void deleteAllInProject(@Param("projectId") UUID projectId, @Param("tenantId") UUID tenantId);
}
