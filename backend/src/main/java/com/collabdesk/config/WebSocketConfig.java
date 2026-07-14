package com.collabdesk.config;

import com.collabdesk.domain.entity.User;
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
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.util.List;
import java.util.UUID;

@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final JwtService jwtService;
    private final UserRepository userRepository;

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // Client subscribes to /topic/... for broadcasts
        registry.enableSimpleBroker("/topic");
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
                            // Leave unauthenticated; @AuthenticationPrincipal-dependent
                            // handlers (like presence join) will simply no-op.
                        }
                    }
                }
                return message;
            }
        });
    }
}
