package com.collabdesk.dto.response;

import com.collabdesk.domain.entity.User;
import com.collabdesk.domain.enums.UserRole;

import java.util.UUID;

/** Public view of a teammate: never includes email, password hash or token version. */
public record UserResponse(UUID id, String displayName, UserRole role) {
    public static UserResponse from(User user) {
        return new UserResponse(user.getId(), user.getDisplayName(), user.getRole());
    }
}
