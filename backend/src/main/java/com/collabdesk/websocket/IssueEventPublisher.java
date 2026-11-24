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
 * The React SPA subscribes to /topic/issues/{projectId} for all three event
 * types — deletes go to the project's topic (like created/updated) so clients
 * only ever receive events for projects they are actually viewing.
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

    public void publishDeleted(Issue issue) {
        broker.convertAndSend(
                "/topic/issues/" + issue.getProjectId(),
                Map.of("type", "DELETED", "issueId", issue.getId())
        );
    }

    private void send(UUID projectId, String eventType, IssueResponse payload) {
        broker.convertAndSend(
                "/topic/issues/" + projectId,
                Map.of("type", eventType, "data", payload)
        );
    }
}
