package com.collabdesk.dto.response;

import com.collabdesk.audit.AuditLog;

import java.time.Instant;
import java.util.UUID;

public record AuditLogResponse(
        UUID id,
        UUID actorId,
        String action,
        String resourceType,
        UUID resourceId,
        String payload,
        Instant createdAt
) {
    public static AuditLogResponse from(AuditLog log) {
        return new AuditLogResponse(
                log.getId(), log.getActorId(), log.getAction(),
                log.getResourceType(), log.getResourceId(), log.getPayload(), log.getCreatedAt()
        );
    }
}
