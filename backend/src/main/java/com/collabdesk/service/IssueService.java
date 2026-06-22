package com.collabdesk.service;

import com.collabdesk.domain.entity.Issue;
import com.collabdesk.domain.entity.User;
import com.collabdesk.domain.enums.IssueStatus;
import com.collabdesk.dto.request.CreateIssueRequest;
import com.collabdesk.dto.request.UpdateIssueRequest;
import com.collabdesk.dto.response.IssueResponse;
import com.collabdesk.repository.IssueRepository;
import com.collabdesk.websocket.IssueEventPublisher;
import jakarta.persistence.OptimisticLockException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class IssueService {

    private final IssueRepository issueRepository;
    private final IssueEventPublisher eventPublisher;

    @Cacheable(value = "issues", key = "#tenantId + '-' + #projectId + '-' + #pageable")
    public Page<IssueResponse> list(UUID tenantId, UUID projectId, Pageable pageable) {
        return issueRepository
                .findAllByTenantIdAndProjectId(tenantId, projectId, pageable)
                .map(IssueResponse::from);
    }

    @Cacheable(value = "issue", key = "#issueId")
    public IssueResponse get(UUID issueId, UUID tenantId) {
        return issueRepository.findByIdAndTenantId(issueId, tenantId)
                .map(IssueResponse::from)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @Transactional
    @CacheEvict(value = {"issues", "issue"}, allEntries = true)
    public IssueResponse create(CreateIssueRequest req, User actor) {
        var issue = Issue.builder()
                .tenantId(actor.getTenantId())
                .projectId(req.projectId())
                .title(req.title())
                .description(req.description())
                .status(IssueStatus.TODO)
                .priority(req.priority())
                .assigneeId(req.assigneeId())
                .createdBy(actor.getId())
                .build();

        Issue saved = issueRepository.save(issue);
        eventPublisher.publishCreated(saved);
        return IssueResponse.from(saved);
    }

    /**
     * Optimistic locking: the client sends the version it last saw.
     * If another request mutated the issue since, Hibernate throws
     * OptimisticLockException → we surface a 409 Conflict.
     * The Angular client catches 409, restores its local snapshot, and
     * shows a "someone else edited this" banner.
     */
    @Transactional
    @CacheEvict(value = {"issues", "issue"}, allEntries = true)
    @PreAuthorize("@authz.canEditIssue(#issueId, authentication)")
    public IssueResponse update(UUID issueId, UpdateIssueRequest req, User actor) {
        Issue issue = issueRepository.findByIdAndTenantId(issueId, actor.getTenantId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));

        // Explicit version check before touching the entity
        if (!issue.getVersion().equals(req.version())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Issue was modified by another user. Please refresh and try again.");
        }

        try {
            if (req.title()       != null) issue.setTitle(req.title());
            if (req.description() != null) issue.setDescription(req.description());
            if (req.status()      != null) issue.setStatus(req.status());
            if (req.priority()    != null) issue.setPriority(req.priority());
            if (req.assigneeId()  != null) issue.setAssigneeId(req.assigneeId());

            Issue saved = issueRepository.save(issue);
            eventPublisher.publishUpdated(saved);
            return IssueResponse.from(saved);

        } catch (OptimisticLockException e) {
            log.warn("Optimistic lock conflict on issue {}: {}", issueId, e.getMessage());
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Issue was modified concurrently. Please refresh and try again.");
        }
    }

    @Transactional
    @CacheEvict(value = {"issues", "issue"}, allEntries = true)
    @PreAuthorize("@authz.canEditIssue(#issueId, authentication)")
    public void delete(UUID issueId, User actor) {
        Issue issue = issueRepository.findByIdAndTenantId(issueId, actor.getTenantId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        issueRepository.delete(issue);
        eventPublisher.publishDeleted(issueId, actor.getTenantId());
    }
}
