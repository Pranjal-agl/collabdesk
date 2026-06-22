package com.collabdesk.security.service;

import com.collabdesk.domain.entity.Issue;
import com.collabdesk.domain.entity.User;
import com.collabdesk.domain.enums.UserRole;
import com.collabdesk.repository.IssueRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Used in @PreAuthorize expressions, e.g.:
 *   @PreAuthorize("@authz.canEditIssue(#issueId, authentication)")
 *
 * Authorization is always enforced server-side, never only in the UI.
 */
@Component("authz")
@RequiredArgsConstructor
public class AuthorizationService {

    private final IssueRepository issueRepository;

    public boolean canEditIssue(UUID issueId, Authentication auth) {
        User user = (User) auth.getPrincipal();
        return issueRepository.findByIdAndTenantId(issueId, user.getTenantId())
                .isPresent();   // tenant check is the gate; role checks layer on top
    }

    public boolean isAdmin(Authentication auth) {
        User user = (User) auth.getPrincipal();
        return user.getRole() == UserRole.ADMIN;
    }

    public boolean isSameTenant(UUID tenantId, Authentication auth) {
        User user = (User) auth.getPrincipal();
        return user.getTenantId().equals(tenantId);
    }
}
