package com.collabdesk.dto.request;

import com.collabdesk.domain.enums.IssueStatus;
import com.collabdesk.domain.enums.Priority;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record UpdateIssueRequest(
        @Size(max = 300) String title,
        String description,
        IssueStatus status,
        Priority priority,
        UUID assigneeId,
        @NotNull Long version   // client must send current version for optimistic lock
) {}
