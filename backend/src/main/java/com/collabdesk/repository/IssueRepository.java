package com.collabdesk.repository;

import com.collabdesk.domain.entity.Issue;
import com.collabdesk.domain.enums.IssueStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface IssueRepository extends JpaRepository<Issue, UUID> {

    // All queries are tenant-scoped — cross-tenant reads are impossible
    Page<Issue> findAllByTenantIdAndProjectId(UUID tenantId, UUID projectId, Pageable pageable);

    Optional<Issue> findByIdAndTenantId(UUID id, UUID tenantId);

    List<Issue> findAllByTenantIdAndProjectIdAndStatus(UUID tenantId, UUID projectId, IssueStatus status);

    List<Issue> findAllByProjectIdAndTenantId(UUID projectId, UUID tenantId);

    @Modifying
    @Query("DELETE FROM Issue i WHERE i.projectId = :projectId AND i.tenantId = :tenantId")
    void deleteAllInProject(@Param("projectId") UUID projectId, @Param("tenantId") UUID tenantId);

    @Query("SELECT COUNT(i) FROM Issue i WHERE i.tenantId = :tenantId AND i.projectId = :projectId")
    long countByTenantIdAndProjectId(UUID tenantId, UUID projectId);
}
