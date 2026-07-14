package com.collabdesk.websocket;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tracks which users are actively viewing which project, per WebSocket session.
 * State is in-memory and single-instance — for a multi-instance deployment this
 * would move to a shared store (Redis pub/sub) so presence is consistent across
 * nodes, but the eventual-consistency contract with clients stays the same:
 * clients reconcile against the latest snapshot broadcast, they don't assume
 * every incremental join/leave event arrives in order or at all.
 */
@Service
@RequiredArgsConstructor
public class PresenceService {

    public record PresenceUser(UUID userId, String displayName) {}

    private final SimpMessagingTemplate broker;

    // sessionId -> (projectId, user) so we know what to clean up on disconnect
    private final Map<String, SessionEntry> sessionsBySessionId = new ConcurrentHashMap<>();
    // projectId -> sessionId -> user (multiple tabs/sessions per user are fine)
    private final Map<UUID, Map<String, PresenceUser>> byProject = new ConcurrentHashMap<>();

    private record SessionEntry(UUID projectId, PresenceUser user, Instant joinedAt) {}

    public void join(String sessionId, UUID projectId, UUID userId, String displayName) {
        var user = new PresenceUser(userId, displayName);
        sessionsBySessionId.put(sessionId, new SessionEntry(projectId, user, Instant.now()));
        byProject.computeIfAbsent(projectId, k -> new ConcurrentHashMap<>()).put(sessionId, user);
        broadcast(projectId);
    }

    public void leave(String sessionId) {
        SessionEntry entry = sessionsBySessionId.remove(sessionId);
        if (entry == null) return;
        Map<String, PresenceUser> project = byProject.get(entry.projectId());
        if (project != null) {
            project.remove(sessionId);
            if (project.isEmpty()) {
                byProject.remove(entry.projectId());
            }
        }
        broadcast(entry.projectId());
    }

    private void broadcast(UUID projectId) {
        Collection<PresenceUser> present = byProject.getOrDefault(projectId, Map.of()).values();
        // De-dupe by userId: same user open in two tabs should show once.
        List<PresenceUser> unique = present.stream().distinct().toList();
        broker.convertAndSend("/topic/presence/" + projectId, Map.of("projectId", projectId, "users", unique));
    }
}
