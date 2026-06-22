package com.collabdesk.websocket;

import com.collabdesk.domain.entity.Issue;
import com.collabdesk.dto.response.IssueResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

/**
 * Pushes real-time issue events to connected WebSocket clients.
 * Angular subscribes to /topic/issues/{projectId}.
 */
@Component
@RequiredArgsConstructor
public class IssueEventPublisher {

    private final SimpMessagingTemplate broker;

    public void publishCreated(Issue issue) {
        send(issue.getProjectId(), "CREATED", IssueResponse.from(issue));
    }

    public void publishUpdated(Issue issue) {
        send(issue.getProjectId(), "UPDATED", IssueResponse.from(issue));
    }

    public void publishDeleted(UUID issueId, UUID tenantId) {
        broker.convertAndSend(
                "/topic/issues/deleted",
                Map.of("issueId", issueId, "tenantId", tenantId)
        );
    }

    private void send(UUID projectId, String eventType, IssueResponse payload) {
        broker.convertAndSend(
                "/topic/issues/" + projectId,
                Map.of("type", eventType, "data", payload)
        );
    }
}
