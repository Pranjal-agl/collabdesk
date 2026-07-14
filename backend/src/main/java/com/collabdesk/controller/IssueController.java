package com.collabdesk.controller;

import com.collabdesk.domain.entity.User;
import com.collabdesk.dto.request.CreateIssueRequest;
import com.collabdesk.dto.request.UpdateIssueRequest;
import com.collabdesk.dto.response.IssueResponse;
import com.collabdesk.service.IssueService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.UUID;

@RestController
@RequestMapping("/api/projects/{projectId}/issues")
@RequiredArgsConstructor
public class IssueController {

    private final IssueService issueService;

    // See ProjectController for the full caching-layer rationale (app cache +
    // HTTP ETag + WebSocket push invalidation). Issue lists change often, so a
    // short max-age (10s) plus ETag revalidation keeps clients close to fresh
    // without hammering the server on every poll/refetch.
    @GetMapping
    public ResponseEntity<Page<IssueResponse>> list(
            @PathVariable UUID projectId,
            @AuthenticationPrincipal User user,
            @PageableDefault(size = 25) Pageable pageable) {
        Page<IssueResponse> page = issueService.list(user.getTenantId(), projectId, pageable);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.empty().cachePrivate().maxAge(Duration.ofSeconds(10)).mustRevalidate())
                .body(page);
    }

    @GetMapping("/{issueId}")
    public ResponseEntity<IssueResponse> get(
            @PathVariable UUID issueId,
            @AuthenticationPrincipal User user) {
        IssueResponse issue = issueService.get(issueId, user.getTenantId());
        return ResponseEntity.ok()
                .cacheControl(CacheControl.empty().cachePrivate().maxAge(Duration.ofSeconds(10)).mustRevalidate())
                .body(issue);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public IssueResponse create(
            @PathVariable UUID projectId,
            @Valid @RequestBody CreateIssueRequest req,
            @AuthenticationPrincipal User user) {
        if (!projectId.equals(req.projectId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Path projectId must match body projectId");
        }
        return issueService.create(req, user);
    }

    @PatchMapping("/{issueId}")
    public IssueResponse update(
            @PathVariable UUID issueId,
            @Valid @RequestBody UpdateIssueRequest req,
            @AuthenticationPrincipal User user) {
        return issueService.update(issueId, req, user);
    }

    @DeleteMapping("/{issueId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
            @PathVariable UUID issueId,
            @AuthenticationPrincipal User user) {
        issueService.delete(issueId, user);
    }
}
