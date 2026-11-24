package com.collabdesk.config;

import com.collabdesk.domain.entity.User;
import com.collabdesk.repository.IssueRepository;
import com.collabdesk.repository.ProjectRepository;
import com.collabdesk.repository.UserRepository;
import com.collabdesk.security.service.JwtService;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.security.Principal;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final ProjectRepository projectRepository;
    private final IssueRepository issueRepository;

    // Every destination a client may SUBSCRIBE to or SEND to, keyed by the
    // resource it is scoped to. Anything not listed is refused.
    private static final String ID = "([0-9a-fA-F-]{36})";
    private static final Pattern TOPIC_PROJECT = Pattern.compile("^/topic/(?:issues|presence|cursors)/" + ID + "$");
    private static final Pattern APP_PROJECT   = Pattern.compile("^/app/(?:presence/" + ID + "/(?:join|leave)|cursor/" + ID + ")$");
    private static final Pattern ISSUE_SCOPED  = Pattern.compile("^/(?:topic/issues/" + ID + "/comments|topic/typing/" + ID + "|app/typing/" + ID + ")$");

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // Client subscribes to /topic/... for broadcasts. Heartbeats every 20s
        // keep the socket alive through hosting proxies (e.g. Render) that
        // close connections which look idle, and let both ends notice a dead
        // connection instead of waiting on a half-open TCP socket.
        ThreadPoolTaskScheduler heartbeats = new ThreadPoolTaskScheduler();
        heartbeats.setPoolSize(1);
        heartbeats.setThreadNamePrefix("ws-heartbeat-");
        heartbeats.initialize();
        registry.enableSimpleBroker("/topic")
                .setHeartbeatValue(new long[] {20_000, 20_000})
                .setTaskScheduler(heartbeats);
        // Client sends to /app/... for server-side handlers
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*")  // tightened in prod via SecurityConfig
                .withSockJS();                  // SockJS fallback for older environments
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        // HTTP auth uses a Bearer header via JwtAuthenticationFilter; STOMP has no
        // per-request headers like that, so the same JWT is passed once on CONNECT
        // (in the "Authorization" STOMP header) and the resulting Principal sticks
        // for the lifetime of that WebSocket session — same token, same revocation
        // rules (tokenVersion check), just a different transport.
        registration.interceptors(new ChannelInterceptor() {
            @Override
            public Message<?> preSend(Message<?> message, MessageChannel channel) {
                StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
                if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
                    String header = accessor.getFirstNativeHeader("Authorization");
                    if (StringUtils.hasText(header) && header.startsWith("Bearer ")) {
                        String token = header.substring(7);
                        try {
                            Claims claims = jwtService.validateAndExtract(token);
                            UUID userId = jwtService.extractUserId(claims);
                            Long tokenVersion = jwtService.extractTokenVersion(claims);
                            User user = userRepository.findById(userId).orElse(null);
                            if (user != null && user.getTokenVersion().equals(tokenVersion)) {
                                var auth = new UsernamePasswordAuthenticationToken(
                                        user, null,
                                        List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name())));
                                accessor.setUser(auth);
                            }
                        } catch (Exception ignored) {
                            // Leave unauthenticated: every SUBSCRIBE/SEND below is refused.
                        }
                    }
                } else if (accessor != null
                        && (StompCommand.SUBSCRIBE.equals(accessor.getCommand()) || StompCommand.SEND.equals(accessor.getCommand()))) {
                    authorizeDestination(accessor.getUser(), accessor.getDestination());
                }
                return message;
            }
        });
    }

    /**
     * Topic names contain resource ids, and the simple broker delivers to anyone
     * subscribed — so without this check any client (even one that never sent a
     * valid token) could subscribe to /topic/issues/{someone else's project} and
     * watch another tenant's board live. Each destination is resolved to its
     * project or issue and checked against the caller's tenant.
     */
    private void authorizeDestination(Principal principal, String destination) {
        if (!(principal instanceof Authentication auth) || !(auth.getPrincipal() instanceof User user)) {
            throw new AccessDeniedException("Sign in before subscribing");
        }
        if (destination == null) throw new AccessDeniedException("No destination");

        UUID projectId = firstId(TOPIC_PROJECT.matcher(destination));
        if (projectId == null) projectId = firstId(APP_PROJECT.matcher(destination));
        if (projectId != null) {
            if (projectRepository.findByIdAndTenantId(projectId, user.getTenantId()).isEmpty()) {
                throw new AccessDeniedException("Not your project");
            }
            return;
        }
        UUID issueId = firstId(ISSUE_SCOPED.matcher(destination));
        if (issueId != null) {
            if (issueRepository.findByIdAndTenantId(issueId, user.getTenantId()).isEmpty()) {
                throw new AccessDeniedException("Not your issue");
            }
            return;
        }
        throw new AccessDeniedException("Unknown destination");
    }

    private static UUID firstId(Matcher matcher) {
        if (!matcher.matches()) return null;
        for (int group = 1; group <= matcher.groupCount(); group++) {
            String value = matcher.group(group);
            if (value != null) {
                try {
                    return UUID.fromString(value);
                } catch (IllegalArgumentException e) {
                    return null;
                }
            }
        }
        return null;
    }
}
