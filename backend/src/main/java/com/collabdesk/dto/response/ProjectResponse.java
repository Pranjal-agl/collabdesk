package com.collabdesk.dto.response;

import com.collabdesk.domain.entity.Project;

import java.time.Instant;
import java.util.UUID;

public record ProjectResponse(
        UUID id,
        String name,
        String description,
        UUID createdBy,
        Instant createdAt,
        Long version
) {
    public static ProjectResponse from(Project project) {
        return new ProjectResponse(
                project.getId(),
                project.getName(),
                project.getDescription(),
                project.getCreatedBy(),
                project.getCreatedAt(),
                project.getVersion()
        );
    }
}
