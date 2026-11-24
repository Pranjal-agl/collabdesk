package com.collabdesk.integration;

import com.collabdesk.dto.request.LoginRequest;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.messaging.converter.MappingJackson2MessageConverter;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import java.lang.reflect.Type;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Exercises the real STOMP endpoint over a real socket, the same way the
 * browser does (raw WebSocket at /ws/websocket, JWT in the CONNECT frame).
 * Runs on its own in-memory database so it can't disturb other test classes.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.datasource.url=jdbc:h2:mem:ws-authz;MODE=PostgreSQL;DB_CLOSE_DELAY=-1")
@ActiveProfiles("test")
class WebSocketAuthzTest {

    private static final String ACME_PROJECT_ID = "10000000-0000-0000-0000-000000000001";

    @LocalServerPort int port;
    @Autowired TestRestTemplate rest;

    @Test
    @DisplayName("Alice connects with her JWT, subscribes to her board and appears in presence")
    void authenticatedClientReceivesPresence() throws Exception {
        CompletableFuture<Throwable> failure = new CompletableFuture<>();
        StompSession session = connect(login("alice@acme.com"), failure);

        BlockingQueue<Map<String, Object>> frames = new LinkedBlockingQueue<>();
        session.subscribe("/topic/presence/" + ACME_PROJECT_ID, collect(frames));
        Thread.sleep(300); // let the SUBSCRIBE land before triggering a broadcast
        session.send("/app/presence/" + ACME_PROJECT_ID + "/join", Map.of());

        Map<String, Object> frame = frames.poll(5, TimeUnit.SECONDS);
        assertThat(failure).isNotDone();
        assertThat(frame).as("presence broadcast").isNotNull();
        assertThat(String.valueOf(frame.get("users"))).contains("Alice Admin");
        session.disconnect();
    }

    @Test
    @DisplayName("Eve (another tenant) is refused a subscription to Acme's board")
    void otherTenantCannotSubscribe() throws Exception {
        CompletableFuture<Throwable> failure = new CompletableFuture<>();
        StompSession session = connect(login("eve@evil.com"), failure);

        session.subscribe("/topic/issues/" + ACME_PROJECT_ID, collect(new LinkedBlockingQueue<>()));

        assertThat(failure.get(5, TimeUnit.SECONDS)).isNotNull();
    }

    @Test
    @DisplayName("A socket that never sent a valid token cannot subscribe to anything")
    void anonymousClientCannotSubscribe() throws Exception {
        CompletableFuture<Throwable> failure = new CompletableFuture<>();
        StompSession session = connect(null, failure);

        session.subscribe("/topic/presence/" + ACME_PROJECT_ID, collect(new LinkedBlockingQueue<>()));

        assertThat(failure.get(5, TimeUnit.SECONDS)).isNotNull();
    }

    private String login(String email) {
        JsonNode body = rest.postForObject("/api/auth/login", new LoginRequest(email, "admin123", "ws-test"), JsonNode.class);
        return body.get("accessToken").asText();
    }

    private StompSession connect(String token, CompletableFuture<Throwable> failure) throws Exception {
        WebSocketStompClient stomp = new WebSocketStompClient(new StandardWebSocketClient());
        stomp.setMessageConverter(new MappingJackson2MessageConverter());
        StompHeaders connectHeaders = new StompHeaders();
        if (token != null) connectHeaders.add("Authorization", "Bearer " + token);

        return stomp.connectAsync("ws://localhost:" + port + "/ws/websocket", new WebSocketHttpHeaders(), connectHeaders,
                new StompSessionHandlerAdapter() {
                    @Override
                    public void handleFrame(StompHeaders headers, Object payload) {
                        failure.complete(new IllegalStateException("ERROR frame: " + headers.getFirst("message")));
                    }

                    @Override
                    public void handleException(StompSession session, StompCommand command, StompHeaders headers, byte[] payload, Throwable exception) {
                        failure.complete(exception);
                    }

                    @Override
                    public void handleTransportError(StompSession session, Throwable exception) {
                        failure.complete(exception);
                    }
                }).get(5, TimeUnit.SECONDS);
    }

    private static StompFrameHandler collect(BlockingQueue<Map<String, Object>> queue) {
        return new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return Map.class;
            }

            @Override
            @SuppressWarnings("unchecked")
            public void handleFrame(StompHeaders headers, Object payload) {
                queue.offer((Map<String, Object>) payload);
            }
        };
    }
}
