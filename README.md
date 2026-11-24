# CollabDesk

A multi-tenant project management application with real-time collaboration, built with **Spring Boot 3** and a **React 18 + Vite** frontend, on **H2** (dev) / **PostgreSQL-compatible** schema.

## Pillars demonstrated

| Pillar | Implementation |
|---|---|
| Client-side consistency | Optimistic updates with snapshot rollback on HTTP error / 409; in-flight mutations shielded from their own WebSocket echoes |
| Data-fetching & caching | Caffeine `@Cacheable` + `Cache-Control` + ETag/`If-None-Match` (`ShallowEtagHeaderFilter`) + WebSocket push invalidation |
| Real-time transport | STOMP over WebSocket with exponential-backoff reconnect (1 → 2 → 4 … 30s cap) and snapshot-based presence |
| Authorization | Short-lived JWT + rotating refresh tokens with reuse detection and `tokenVersion` revocation; `@PreAuthorize` + Hibernate tenant filter (row-level) |
| Performance | Code-split bundles (vendor/motion/WebGL), lazy-loaded shader background, DPR cap, bundle budget in Vite config |
| Accessibility | `aria-live` announcements, focus-visible rings, keyboard-complete flows, reduced-motion fallbacks everywhere (including the WebGL layer) |

## Tech stack

- **Backend**: Java 21 (virtual threads), Spring Boot 3, Spring Security 6, Spring Data JPA, Spring WebSocket (STOMP), Caffeine cache
- **Frontend**: React 18, Vite 5, TypeScript, Tailwind CSS, framer-motion, dnd-kit, @stomp/stompjs, hand-written GLSL (WebGL background, no three.js)
- **Database**: H2 (dev, file mode) — schema is PostgreSQL-compatible

## Quick start

### Frontend only — demo mode (no backend needed)
```bash
cd frontend
npm install
npm run dev
# App: http://localhost:5173
```
Demo mode (`VITE_DEMO_MODE=true` in `.env`) runs the entire UI against an in-browser
mock of the backend: same REST + WebSocket contract, real optimistic-locking 409s,
and a bot teammate that creates issues/comments live. Seeded accounts:
`alice@acme.com/admin123` (admin), `bob@acme.com/admin123` (member),
`eve@evil.com/admin123` (other tenant — her data is unreachable from acme).

Sign in as two different users in two browser profiles to watch presence,
live board updates and comment threads work across sessions.

### Full stack
```bash
cd backend && ./mvnw spring-boot:run        # API on :8080

cd frontend && npm run dev                  # Vite dev server on :5173
# /api and /ws are proxied to :8080 — single origin, no CORS setup needed.
```

### Production (all-in-one jar)
```bash
./mvnw clean package                        # from repo root, or `docker build .`
# Vite builds with VITE_DEMO_MODE=false (.env.production) and its output is
# embedded into the jar's static resources — same origin as /api and /ws.
```

## Architecture

```
collabdesk/
├── backend/          # Spring Boot monolith
│   └── src/main/java/com/collabdesk/
│       ├── config/           # Security, WebSocket, ETag, JPA config
│       ├── security/         # JWT filter, refresh rotation, authz service
│       ├── domain/entity/    # JPA entities with @Version
│       ├── repository/       # Spring Data repos
│       ├── service/          # Business logic
│       ├── controller/       # REST controllers
│       ├── websocket/        # STOMP topics, presence, event publishers
│       ├── dto/              # Request / Response DTOs
│       ├── audit/            # Audit log
│       └── exception/        # Global error handling (RFC 7807)
└── frontend/         # React SPA (Vite)
    └── src/
        ├── lib/              # api client, auth context, STOMP wrapper, demo mock
        ├── components/       # UI kit, layout, WebGL shader background
        └── pages/            # Login, Projects, Board (dnd), IssueDetail, AuditLog
```

The previous Angular implementation is preserved in `frontend-angular.legacy/`
for reference.

## Key design decisions

- **Optimistic updates**: every mutation snapshots state before the HTTP call; on error the snapshot is restored and a toast explains the rollback. Stale writes surface the backend's 409 (`@Version` optimistic locking) instead of silently overwriting a teammate's edit.
- **Single-flight refresh**: a burst of concurrent 401s triggers one shared token-refresh promise, not N rotations.
- **Row-level tenancy**: a Hibernate `@Filter` appends `tenant_id = :current` to every query — cross-tenant reads are structurally impossible.
- **Presence**: join/leave messages per project view plus disconnect cleanup; clients reconcile against the latest snapshot broadcast rather than assuming ordered delivery.
- **WebGL with guardrails**: the shader background lazy-loads after first paint, caps DPR at 1.25, pauses when the tab is hidden, and the app falls back to a CSS aurora when WebGL is missing or reduced-motion is requested.

## Running tests

```bash
# Backend
cd backend && ./mvnw test
```
