package com.collabdesk.security.filter;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.collabdesk.domain.entity.User;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Fixed-window, per-tenant rate limiter.
 *
 * Runs *after* JwtAuthenticationFilter so it can key on tenantId rather than
 * IP (a shared office/NAT shouldn't throttle every tenant behind it, and one
 * noisy tenant shouldn't starve another sharing the same origin). Unauthenticated
 * requests (login, refresh) are keyed by remote IP instead since there's no
 * tenant yet.
 *
 * This is an in-memory, single-instance limiter — good enough for a single
 * Spring instance backed by Caffeine (already a project dependency). For a
 * horizontally-scaled deployment this would move to Redis (INCR + TTL or a
 * token-bucket Lua script) so limits are enforced across instances.
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    @Value("${app.rate-limit.requests-per-window:120}")
    private int limit;

    @Value("${app.rate-limit.window-seconds:60}")
    private int windowSeconds;

    private Cache<String, Window> windows;

    private Cache<String, Window> windows() {
        if (windows == null) {
            windows = Caffeine.newBuilder()
                    .expireAfterWrite(Duration.ofSeconds(windowSeconds * 2L))
                    .maximumSize(10_000)
                    .build();
        }
        return windows;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain chain) throws ServletException, IOException {
        String key = resolveKey(request);
        long now = System.currentTimeMillis();
        long windowMs = windowSeconds * 1000L;

        Window window = windows().get(key, k -> new Window(now));
        synchronized (window) {
            if (now - window.startedAt > windowMs) {
                window.startedAt = now;
                window.count.set(0);
            }
            int count = window.count.incrementAndGet();
            long resetInSeconds = Math.max(0, (window.startedAt + windowMs - now) / 1000);

            response.setHeader("X-RateLimit-Limit", String.valueOf(limit));
            response.setHeader("X-RateLimit-Remaining", String.valueOf(Math.max(0, limit - count)));
            response.setHeader("X-RateLimit-Reset", String.valueOf(resetInSeconds));

            if (count > limit) {
                response.setHeader("Retry-After", String.valueOf(resetInSeconds));
                response.setStatus(429);
                response.setContentType("application/problem+json");
                response.getWriter().write(
                        "{\"status\":429,\"title\":\"Too Many Requests\",\"detail\":\"Rate limit exceeded, retry in "
                                + resetInSeconds + "s\"}");
                return;
            }
        }

        chain.doFilter(request, response);
    }

    private String resolveKey(HttpServletRequest request) {
        Object principal = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getPrincipal()
                : null;
        if (principal instanceof User user) {
            return "tenant:" + user.getTenantId();
        }
        return "ip:" + request.getRemoteAddr();
    }

    private static final class Window {
        volatile long startedAt;
        final AtomicInteger count = new AtomicInteger(0);
        Window(long startedAt) { this.startedAt = startedAt; }
    }
}
