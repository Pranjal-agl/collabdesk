package com.collabdesk.dto.request;

import com.collabdesk.domain.enums.Priority;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record CreateIssueRequest(
        @NotNull UUID projectId,
        @NotBlank @Size(max = 300) String title,
        String description,
        @NotNull Priority priority,
        UUID assigneeId
) {}
