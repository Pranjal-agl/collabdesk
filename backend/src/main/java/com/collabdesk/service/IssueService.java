package com.collabdesk.service;

import com.collabdesk.audit.AuditService;
import com.collabdesk.domain.entity.Issue;
import com.collabdesk.domain.entity.User;
import com.collabdesk.domain.enums.IssueStatus;
import com.collabdesk.dto.request.CreateIssueRequest;
import com.collabdesk.dto.request.UpdateIssueRequest;
import com.collabdesk.dto.response.IssueResponse;
import com.collabdesk.repository.CommentRepository;
import com.collabdesk.repository.IssueRepository;
import com.collabdesk.repository.ProjectRepository;
import com.collabdesk.repository.UserRepository;
import com.collabdesk.websocket.IssueEventPublisher;
import jakarta.persistence.OptimisticLockException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
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
    private final ProjectRepository projectRepository;
    private final CommentRepository commentRepository;
    private final UserRepository userRepository;
    private final IssueEventPublisher eventPublisher;
    private final AuditService auditService;

    @Cacheable(value = "issues", key = "#tenantId + '-' + #projectId + '-' + #pageable")
    public Page<IssueResponse> list(UUID tenantId, UUID projectId, Pageable pageable) {
        return issueRepository
                .findAllByTenantIdAndProjectId(tenantId, projectId, pageable)
                .map(IssueResponse::from);
    }

    /**
     * The cache key MUST include the tenant. It used to be just the issue id, so
     * once Acme had loaded an issue, a user from any other tenant asking for the
     * same id got Acme's cached copy without ever reaching the tenant check below.
     */
    @Cacheable(value = "issue", key = "#tenantId + '-' + #projectId + '-' + #issueId")
    public IssueResponse get(UUID projectId, UUID issueId, UUID tenantId) {
        return IssueResponse.from(load(projectId, issueId, tenantId));
    }

    @Transactional
    @CacheEvict(value = {"issues", "issue"}, allEntries = true)
    public IssueResponse create(CreateIssueRequest req, User actor) {
        projectRepository.findByIdAndTenantId(req.projectId(), actor.getTenantId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (req.assigneeId() != null) requireTeammate(req.assigneeId(), actor);

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
        eventPublisher.publishCreated(saved, actor.getId());
        auditService.log(actor.getTenantId(), actor.getId(), "CREATE", "ISSUE", saved.getId(), saved.getTitle());
        return IssueResponse.from(saved);
    }

    /**
     * Optimistic locking: the client sends the version it last saw.
     * If another request mutated the issue since, we surface a 409 Conflict.
     * The React client restores its local snapshot and tells the user their
     * change was undone, so nobody's edit is silently overwritten.
     */
    @Transactional
    @CacheEvict(value = {"issues", "issue"}, allEntries = true)
    @PreAuthorize("@authz.canEditIssue(#issueId, authentication)")
    public IssueResponse update(UUID projectId, UUID issueId, UpdateIssueRequest req, User actor) {
        Issue issue = load(projectId, issueId, actor.getTenantId());

        if (!issue.getVersion().equals(req.version())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Someone else changed this issue first. Refresh to see their version");
        }

        try {
            if (req.title()       != null) issue.setTitle(req.title());
            if (req.description() != null) issue.setDescription(req.description());
            if (req.status()      != null) issue.setStatus(req.status());
            if (req.priority()    != null) issue.setPriority(req.priority());
            if (Boolean.TRUE.equals(req.clearAssignee())) {
                issue.setAssigneeId(null);
            } else if (req.assigneeId() != null) {
                requireTeammate(req.assigneeId(), actor);
                issue.setAssigneeId(req.assigneeId());
            }

            // saveAndFlush, not save: the @Version bump happens at flush, and the
            // response + WS event must carry the NEW version. With plain save()
            // clients got the old version back and their next edit was a false 409.
            Issue saved = issueRepository.saveAndFlush(issue);
            eventPublisher.publishUpdated(saved, actor.getId());
            auditService.log(actor.getTenantId(), actor.getId(), "UPDATE", "ISSUE", saved.getId(), saved.getTitle());
            return IssueResponse.from(saved);

        } catch (OptimisticLockException | ObjectOptimisticLockingFailureException e) {
            log.warn("Optimistic lock conflict on issue {}: {}", issueId, e.getMessage());
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Someone else changed this issue at the same moment. Refresh to see their version");
        }
    }

    @Transactional
    @CacheEvict(value = {"issues", "issue"}, allEntries = true)
    @PreAuthorize("@authz.canEditIssue(#issueId, authentication)")
    public void delete(UUID projectId, UUID issueId, User actor) {
        Issue issue = load(projectId, issueId, actor.getTenantId());
        // comments.issue_id has no ON DELETE CASCADE: without this, deleting any
        // issue that had a comment failed with a constraint violation (500).
        commentRepository.deleteAllForIssue(issueId, actor.getTenantId());
        issueRepository.delete(issue);
        eventPublisher.publishDeleted(issue, actor.getId());
        auditService.log(actor.getTenantId(), actor.getId(), "DELETE", "ISSUE", issueId, issue.getTitle());
    }

    /** Tenant-scoped load that also rejects a mismatched project in the URL. */
    private Issue load(UUID projectId, UUID issueId, UUID tenantId) {
        return issueRepository.findByIdAndTenantId(issueId, tenantId)
                .filter(issue -> issue.getProjectId().equals(projectId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    /** Assignees must belong to the actor's tenant — otherwise anyone could
     *  attach a foreign user id to an issue (and leak that it exists). */
    private void requireTeammate(UUID userId, User actor) {
        userRepository.findByIdAndTenantId(userId, actor.getTenantId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "That person isn't in this workspace"));
    }
}
