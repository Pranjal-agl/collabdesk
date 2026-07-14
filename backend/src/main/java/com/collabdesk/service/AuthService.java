package com.collabdesk.service;

import com.collabdesk.domain.entity.RefreshToken;
import com.collabdesk.domain.entity.User;
import com.collabdesk.dto.request.LoginRequest;
import com.collabdesk.dto.response.AuthResponse;
import com.collabdesk.repository.RefreshTokenRepository;
import com.collabdesk.repository.UserRepository;
import com.collabdesk.security.service.JwtService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

/**
 * Multi-device session model:
 *  - Access token: short-lived JWT (15 min), stateless, carries tenantId/role/tokenVersion.
 *  - Refresh token: opaque random value, long-lived (7 days), one row per device in
 *    refresh_tokens. Only its hash is persisted.
 *  - Rotation: every refresh issues a new refresh token and revokes the old one. If a
 *    revoked token is presented again, we treat it as theft/replay and kill *all* of
 *    that user's sessions (tokenVersion bump + revoke all refresh tokens).
 *  - Logout (this device): revokes only the presented refresh token.
 *  - Logout-all: bumps tokenVersion (invalidates every outstanding access token
 *    immediately) and revokes every refresh token for the user.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final SecureRandom secureRandom = new SecureRandom();

    @Value("${app.jwt.access-token-expiry-ms}")
    private long accessExpiryMs;

    @Value("${app.jwt.refresh-token-expiry-ms}")
    private long refreshExpiryMs;

    @Transactional
    public AuthResponse login(LoginRequest req) {
        User user = userRepository.findByEmail(req.email())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));

        if (!passwordEncoder.matches(req.password(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }

        String refreshToken = issueRefreshToken(user.getId(), req.deviceLabel());
        return AuthResponse.bearer(jwtService.generateAccessToken(user), refreshToken, accessExpiryMs);
    }

    @Transactional
    public AuthResponse refresh(String presentedToken) {
        String hash = hash(presentedToken);
        RefreshToken record = refreshTokenRepository.findByTokenHash(hash).orElse(null);

        if (record == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid refresh token");
        }

        if (record.getRevokedAt() != null) {
            // Reuse of an already-rotated-out token => likely theft. Nuke every session.
            log.warn("Refresh token reuse detected for user {}; revoking all sessions", record.getUserId());
            revokeAllSessions(record.getUserId());
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Session revoked; please log in again");
        }

        if (record.getExpiresAt().isBefore(Instant.now())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token expired");
        }

        User user = userRepository.findById(record.getUserId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid refresh token"));

        // Rotate: revoke the presented token, issue a new one for the same device.
        record.setRevokedAt(Instant.now());
        refreshTokenRepository.save(record);
        String newRefreshToken = issueRefreshToken(user.getId(), record.getDeviceLabel());

        return AuthResponse.bearer(jwtService.generateAccessToken(user), newRefreshToken, accessExpiryMs);
    }

    /** Logs out the current device only — other sessions stay alive. */
    @Transactional
    public void logout(String presentedToken) {
        refreshTokenRepository.findByTokenHash(hash(presentedToken))
                .ifPresent(rt -> {
                    rt.setRevokedAt(Instant.now());
                    refreshTokenRepository.save(rt);
                });
    }

    /** Logs out every device: bumps tokenVersion (kills live access tokens) + revokes all refresh tokens. */
    @Transactional
    public void logoutAll(User user) {
        revokeAllSessions(user.getId());
    }

    private void revokeAllSessions(UUID userId) {
        userRepository.incrementTokenVersion(userId);
        refreshTokenRepository.revokeAllForUser(userId, Instant.now());
    }

    private String issueRefreshToken(UUID userId, String deviceLabel) {
        byte[] bytes = new byte[48];
        secureRandom.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        RefreshToken record = RefreshToken.builder()
                .userId(userId)
                .tokenHash(hash(token))
                .deviceLabel(deviceLabel != null && !deviceLabel.isBlank() ? deviceLabel : "Unknown device")
                .createdAt(Instant.now())
                .expiresAt(Instant.now().plusMillis(refreshExpiryMs))
                .build();
        refreshTokenRepository.save(record);
        return token;
    }

    private String hash(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return Base64.getEncoder().encodeToString(digest.digest(value.getBytes()));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
