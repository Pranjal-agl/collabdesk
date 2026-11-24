package com.collabdesk.websocket;

import com.collabdesk.domain.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.security.Principal;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Ephemeral collaboration signals — nothing here is persisted:
 *  - live cursors on a board (/app/cursor/{projectId} -> /topic/cursors/{projectId}),
 *    including which card someone is currently dragging;
 *  - "is typing" in an issue's discussion (/app/typing/{issueId} -> /topic/typing/{issueId}).
 *
 * The sender's identity is always taken from the authenticated session, never
 * from the payload, and WebSocketConfig has already checked the destination
 * belongs to the sender's tenant. Cursor frames are rate-limited per session.
 */
@Controller
@RequiredArgsConstructor
public class CollaborationController {

    /** Client-side throttle is ~30 Hz; anything faster than this is dropped. */
    private static final long MIN_CURSOR_INTERVAL_MS = 25;

    private final SimpMessagingTemplate broker;
    private final Map<String, Long> lastCursorAt = new ConcurrentHashMap<>();

    public record CursorPayload(Double x, Double y, UUID dragging, Boolean gone) {}
    public record TypingPayload(Boolean typing) {}

    @MessageMapping("/cursor/{projectId}")
    public void cursor(@DestinationVariable UUID projectId, @Payload CursorPayload payload,
                       SimpMessageHeaderAccessor headers, Principal principal) {
        User user = userOf(principal);
        if (user == null || payload == null) return;

        long now = System.currentTimeMillis();
        String session = headers.getSessionId();
        Long previous = session == null ? null : lastCursorAt.get(session);
        boolean gone = Boolean.TRUE.equals(payload.gone());
        if (!gone && previous != null && now - previous < MIN_CURSOR_INTERVAL_MS) return;
        if (session != null) lastCursorAt.put(session, now);

        Map<String, Object> frame = new HashMap<>();
        frame.put("userId", user.getId());
        frame.put("displayName", user.getDisplayName());
        frame.put("gone", gone);
        if (!gone) {
            // x is a fraction of the board width, y is pixels from the board top.
            frame.put("x", clamp(payload.x(), 0, 1));
            frame.put("y", clamp(payload.y(), 0, 20_000));
            frame.put("dragging", payload.dragging());
        }
        broker.convertAndSend("/topic/cursors/" + projectId, frame);
    }

    @MessageMapping("/typing/{issueId}")
    public void typing(@DestinationVariable UUID issueId, @Payload TypingPayload payload, Principal principal) {
        User user = userOf(principal);
        if (user == null) return;
        broker.convertAndSend("/topic/typing/" + issueId, Map.of(
                "userId", user.getId(),
                "displayName", user.getDisplayName(),
                "typing", payload != null && Boolean.TRUE.equals(payload.typing())));
    }

    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        lastCursorAt.remove(event.getSessionId());
    }

    private static double clamp(Double value, double min, double max) {
        if (value == null || value.isNaN()) return min;
        return Math.max(min, Math.min(max, value));
    }

    private static User userOf(Principal principal) {
        if (principal instanceof Authentication auth && auth.getPrincipal() instanceof User user) return user;
        return null;
    }
}
