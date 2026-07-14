package com.collabdesk.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * One row per active (or recently-active) device/session.
 * The token itself is never stored — only its SHA-256 hash — so a DB leak
 * doesn't hand out usable credentials.
 *
 * Rotation model: every /auth/refresh call issues a brand-new refresh token
 * and immediately revokes the one presented. If a *revoked* token is ever
 * presented again, that's a signal of theft/replay, so we revoke every
 * session for the user (see AuthService.refresh).
 */
@Entity
@Table(name = "refresh_tokens")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "token_hash", nullable = false, unique = true)
    private String tokenHash;

    @Column(name = "device_label", length = 200)
    private String deviceLabel;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    public boolean isActive() {
        return revokedAt == null && expiresAt.isAfter(Instant.now());
    }
}
