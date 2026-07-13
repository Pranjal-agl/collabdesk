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
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@RestController
@RequestMapping("/api/projects/{projectId}/issues")
@RequiredArgsConstructor
public class IssueController {

    private final IssueService issueService;

    @GetMapping
    public Page<IssueResponse> list(
            @PathVariable UUID projectId,
            @AuthenticationPrincipal User user,
            @PageableDefault(size = 25) Pageable pageable) {
        return issueService.list(user.getTenantId(), projectId, pageable);
    }

    @GetMapping("/{issueId}")
    public IssueResponse get(
            @PathVariable UUID issueId,
            @AuthenticationPrincipal User user) {
        return issueService.get(issueId, user.getTenantId());
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
