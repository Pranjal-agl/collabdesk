package com.collabdesk.controller;

import com.collabdesk.domain.entity.User;
import com.collabdesk.dto.request.CreateProjectRequest;
import com.collabdesk.dto.request.UpdateProjectRequest;
import com.collabdesk.dto.response.ProjectResponse;
import com.collabdesk.service.ProjectService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final ProjectService projectService;

    @GetMapping
    public List<ProjectResponse> list(@AuthenticationPrincipal User user) {
        return projectService.list(user.getTenantId());
    }

    @GetMapping("/{projectId}")
    public ProjectResponse get(
            @PathVariable UUID projectId,
            @AuthenticationPrincipal User user) {
        return projectService.get(projectId, user.getTenantId());
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
