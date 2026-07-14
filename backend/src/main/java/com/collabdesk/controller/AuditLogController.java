package com.collabdesk.controller;

import com.collabdesk.audit.AuditLog;
import com.collabdesk.domain.entity.User;
import com.collabdesk.dto.response.AuditLogResponse;
import com.collabdesk.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/audit-logs")
@RequiredArgsConstructor
public class AuditLogController {

    private final AuditLogRepository auditLogRepository;

    // Row-level enforcement happens twice, deliberately: @PreAuthorize gates the
    // endpoint to admins, and the query itself is scoped to the caller's tenantId
    // (never a client-supplied tenant) so even a bug in the role check couldn't
    // leak another tenant's audit trail.
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping
    public Page<AuditLogResponse> list(
            @AuthenticationPrincipal User user,
            @PageableDefault(size = 50) Pageable pageable) {
        Page<AuditLog> page = auditLogRepository.findAllByTenantIdOrderByCreatedAtDesc(user.getTenantId(), pageable);
        return page.map(AuditLogResponse::from);
    }
}
