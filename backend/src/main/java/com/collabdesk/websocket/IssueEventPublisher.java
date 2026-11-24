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
 *
 * Every event carries {@code actorId}: the user who made the change. Clients
 * use it to attribute live changes ("Bob moved this") instead of guessing.
 * Subscriptions are tenant-checked in WebSocketConfig before any of these
 * frames can reach a session.
 */
@Component
@RequiredArgsConstructor
public class IssueEventPublisher {

    private final SimpMessagingTemplate broker;

    public void publishCreated(Issue issue, UUID actorId) {
        send(issue.getProjectId(), Map.of("type", "CREATED", "data", IssueResponse.from(issue), "actorId", actorId));
    }

    public void publishUpdated(Issue issue, UUID actorId) {
        send(issue.getProjectId(), Map.of("type", "UPDATED", "data", IssueResponse.from(issue), "actorId", actorId));
    }

    public void publishDeleted(Issue issue, UUID actorId) {
        send(issue.getProjectId(), Map.of("type", "DELETED", "issueId", issue.getId(), "actorId", actorId));
    }

    private void send(UUID projectId, Map<String, Object> event) {
        broker.convertAndSend("/topic/issues/" + projectId, event);
    }
}
