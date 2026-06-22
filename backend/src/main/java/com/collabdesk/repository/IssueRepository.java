package com.collabdesk.repository;

import com.collabdesk.domain.entity.Issue;
import com.collabdesk.domain.enums.IssueStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface IssueRepository extends JpaRepository<Issue, UUID> {

    // All queries are tenant-scoped — cross-tenant reads are impossible
    Page<Issue> findAllByTenantIdAndProjectId(UUID tenantId, UUID projectId, Pageable pageable);

    Optional<Issue> findByIdAndTenantId(UUID id, UUID tenantId);

    List<Issue> findAllByTenantIdAndProjectIdAndStatus(UUID tenantId, UUID projectId, IssueStatus status);

    @Query("SELECT COUNT(i) FROM Issue i WHERE i.tenantId = :tenantId AND i.projectId = :projectId")
    long countByTenantIdAndProjectId(UUID tenantId, UUID projectId);
}
