package com.collabdesk.controller;

import com.collabdesk.domain.entity.User;
import com.collabdesk.dto.request.CreateProjectRequest;
import com.collabdesk.dto.request.UpdateProjectRequest;
import com.collabdesk.dto.response.ProjectResponse;
import com.collabdesk.service.ProjectService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final ProjectService projectService;

    /**
     * Caching layers at play here, cheapest-first:
     *  1. App cache (Caffeine, see ProjectService) — avoids hitting the DB.
     *  2. HTTP cache (this ETag) — avoids re-serializing/re-sending the body when the
     *     client already has the current version; a 304 costs ~nothing.
     *  3. WebSocket push (IssueEventPublisher/CommentEventPublisher) — invalidates the
     *     client's in-memory copy the instant something changes, rather than waiting
     *     out a TTL.
     * Nothing here is CDN-cached: this is per-tenant, authenticated data, so
     * Cache-Control is "private" — only the requesting browser may cache it. The
     * CDN-cacheable layer is the static Angular build (hashed filenames, immutable,
     * long max-age), not these API responses.
     */
    @GetMapping
    public ResponseEntity<List<ProjectResponse>> list(@AuthenticationPrincipal User user) {
        List<ProjectResponse> projects = projectService.list(user.getTenantId());
        return ResponseEntity.ok()
                .cacheControl(CacheControl.empty().cachePrivate().maxAge(Duration.ofSeconds(30)).mustRevalidate())
                .body(projects);
    }

    @GetMapping("/{projectId}")
    public ResponseEntity<ProjectResponse> get(
            @PathVariable UUID projectId,
            @AuthenticationPrincipal User user) {
        ProjectResponse project = projectService.get(projectId, user.getTenantId());
        return ResponseEntity.ok()
                .cacheControl(CacheControl.empty().cachePrivate().maxAge(Duration.ofSeconds(30)).mustRevalidate())
                .body(project);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProjectResponse create(
            @Valid @RequestBody CreateProjectRequest req,
            @AuthenticationPrincipal User user) {
        return projectService.create(req, user);
    }

    @PatchMapping("/{projectId}")
    public ProjectResponse update(
            @PathVariable UUID projectId,
            @Valid @RequestBody UpdateProjectRequest req,
            @AuthenticationPrincipal User user) {
        return projectService.update(projectId, req, user);
    }

    @DeleteMapping("/{projectId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
            @PathVariable UUID projectId,
            @AuthenticationPrincipal User user) {
        projectService.delete(projectId, user);
    }
}
