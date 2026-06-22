package com.collabdesk.service;

import com.collabdesk.domain.entity.User;
import com.collabdesk.dto.request.LoginRequest;
import com.collabdesk.dto.response.AuthResponse;
import com.collabdesk.repository.UserRepository;
import com.collabdesk.security.service.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthResponse login(LoginRequest req) {
        User user = userRepository.findByEmail(req.email())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));

        if (!passwordEncoder.matches(req.password(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }

        return AuthResponse.bearer(jwtService.generateAccessToken(user));
    }

    /** Revokes all existing tokens by bumping the token version. */
    @Transactional
    public void logout(User user) {
        userRepository.incrementTokenVersion(user.getId());
    }
}
