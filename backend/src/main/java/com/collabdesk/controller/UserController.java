package com.collabdesk.controller;

import com.collabdesk.domain.entity.User;
import com.collabdesk.dto.response.UserResponse;
import com.collabdesk.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.List;

/**
 * Directory of the caller's own workspace, used to show names and avatars and
 * to pick assignees. Tenant-scoped by construction: the query only ever sees
 * the authenticated user's tenant.
 */
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<List<UserResponse>> list(@AuthenticationPrincipal User user) {
        List<UserResponse> people = userRepository.findAllByTenantIdOrderByDisplayNameAsc(user.getTenantId())
                .stream()
                .map(UserResponse::from)
                .toList();
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePrivate())
                .body(people);
    }

    @GetMapping("/me")
    public UserResponse me(@AuthenticationPrincipal User user) {
        return UserResponse.from(user);
    }
}
