package com.collabdesk.dto.response;

import com.collabdesk.domain.entity.Issue;
import com.collabdesk.domain.enums.IssueStatus;
import com.collabdesk.domain.enums.Priority;

import java.time.Instant;
import java.util.UUID;

public record IssueResponse(
        UUID id,
        UUID projectId,
        String title,
        String description,
        IssueStatus status,
        Priority priority,
        UUID assigneeId,
        UUID createdBy,
        Instant createdAt,
        Instant updatedAt,
        Long version
) {
    public static IssueResponse from(Issue issue) {
        return new IssueResponse(
                issue.getId(), issue.getProjectId(), issue.getTitle(),
                issue.getDescription(), issue.getStatus(), issue.getPriority(),
                issue.getAssigneeId(), issue.getCreatedBy(),
                issue.getCreatedAt(), issue.getUpdatedAt(), issue.getVersion()
        );
    }
}
