package com.collabdesk.websocket;

import com.collabdesk.dto.response.CommentResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class CommentEventPublisher {

    private final SimpMessagingTemplate broker;

    public void publishCreated(UUID issueId, CommentResponse payload) {
        send(issueId, "CREATED", payload);
    }

    public void publishDeleted(UUID issueId, UUID commentId) {
        broker.convertAndSend(
                "/topic/issues/" + issueId + "/comments",
                Map.of("type", "DELETED", "commentId", commentId)
        );
    }

    private void send(UUID issueId, String eventType, CommentResponse payload) {
        broker.convertAndSend(
                "/topic/issues/" + issueId + "/comments",
                Map.of("type", eventType, "data", payload)
        );
    }
}
