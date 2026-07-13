package com.collabdesk.service;

import com.collabdesk.audit.AuditService;
import com.collabdesk.domain.entity.Project;
import com.collabdesk.domain.entity.User;
import com.collabdesk.dto.request.CreateProjectRequest;
import com.collabdesk.dto.request.UpdateProjectRequest;
import com.collabdesk.dto.response.ProjectResponse;
import com.collabdesk.repository.ProjectRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final AuditService auditService;

    @Cacheable(value = "projects", key = "#tenantId")
    public List<ProjectResponse> list(UUID tenantId) {
        return projectRepository.findAllByTenantIdOrderByCreatedAtDesc(tenantId)
                .stream()
                .map(ProjectResponse::from)
                .toList();
    }

    @Cacheable(value = "project", key = "#projectId")
    public ProjectResponse get(UUID projectId, UUID tenantId) {
        return projectRepository.findByIdAndTenantId(projectId, tenantId)
                .map(ProjectResponse::from)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @Transactional
    @CacheEvict(value = {"projects", "project"}, allEntries = true)
    public ProjectResponse create(CreateProjectRequest req, User actor) {
        var project = Project.builder()
                .tenantId(actor.getTenantId())
                .name(req.name())
                .description(req.description())
                .createdBy(actor.getId())
                .build();

        Project saved = projectRepository.save(project);
        auditService.log(actor.getTenantId(), actor.getId(), "CREATE", "PROJECT", saved.getId(), saved.getName());
        return ProjectResponse.from(saved);
    }

    @Transactional
    @CacheEvict(value = {"projects", "project"}, allEntries = true)
    @PreAuthorize("@authz.canEditProject(#projectId, authentication)")
    public ProjectResponse update(UUID projectId, UpdateProjectRequest req, User actor) {
        Project project = projectRepository.findByIdAndTenantId(projectId, actor.getTenantId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));

        if (!project.getVersion().equals(req.version())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Project was modified by another user. Please refresh and try again.");
        }

        if (req.name() != null && !req.name().isBlank()) {
            project.setName(req.name());
        }
        if (req.description() != null) {
            project.setDescription(req.description());
        }

        Project saved = projectRepository.save(project);
        auditService.log(actor.getTenantId(), actor.getId(), "UPDATE", "PROJECT", saved.getId(), saved.getName());
        return ProjectResponse.from(saved);
    }

    @Transactional
    @CacheEvict(value = {"projects", "project"}, allEntries = true)
    @PreAuthorize("@authz.canEditProject(#projectId, authentication)")
    public void delete(UUID projectId, User actor) {
        Project project = projectRepository.findByIdAndTenantId(projectId, actor.getTenantId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));

        projectRepository.delete(project);
        auditService.log(actor.getTenantId(), actor.getId(), "DELETE", "PROJECT", project.getId(), project.getName());
    }
}
