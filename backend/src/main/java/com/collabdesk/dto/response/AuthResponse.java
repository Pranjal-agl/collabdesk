package com.collabdesk.dto.response;

public record AuthResponse(String accessToken, String refreshToken, String tokenType, long expiresInMs) {
    public static AuthResponse bearer(String accessToken, String refreshToken, long expiresInMs) {
        return new AuthResponse(accessToken, refreshToken, "Bearer", expiresInMs);
    }
}
