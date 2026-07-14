package com.collabdesk.websocket;

import com.collabdesk.domain.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.security.Principal;
import java.util.UUID;

@Controller
@RequiredArgsConstructor
public class PresenceController {

    private final PresenceService presenceService;

    /** Client sends here when it starts viewing a project (e.g. opening the issue board). */
    @MessageMapping("/presence/{projectId}/join")
    public void join(@DestinationVariable UUID projectId, SimpMessageHeaderAccessor headers, Principal principal) {
        User user = extractUser(principal);
        if (user == null) return;
        presenceService.join(headers.getSessionId(), projectId, user.getId(), user.getDisplayName());
    }

    /** Cleans up presence when a socket drops for any reason — tab close, network loss, refresh. */
    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        presenceService.leave(event.getSessionId());
    }

    private User extractUser(Principal principal) {
        if (principal instanceof Authentication auth && auth.getPrincipal() instanceof User user) {
            return user;
        }
        return null;
    }
}
