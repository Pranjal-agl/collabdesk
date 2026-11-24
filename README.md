# CollabDesk

A multi-tenant project management application with real-time collaboration, built with **Spring Boot 3** and a **React 18 + Vite** frontend, on **H2** (dev) / **PostgreSQL-compatible** schema.

## Pillars demonstrated

| Pillar | Implementation |
|---|---|
| Client-side consistency | Optimistic updates with snapshot rollback on HTTP error / 409; in-flight mutations shielded from their own WebSocket echoes |
| Data-fetching & caching | Caffeine `@Cacheable` + `Cache-Control` + ETag/`If-None-Match` (`ShallowEtagHeaderFilter`) + WebSocket push invalidation |
| Real-time transport | STOMP over WebSocket with exponential-backoff reconnect (1 → 2 → 4 … 30s cap) and snapshot-based presence |
| Authorization | Short-lived JWT + rotating refresh tokens with reuse detection and `tokenVersion` revocation; `@PreAuthorize` + tenant-scoped queries; tenant-scoped cache keys; per-destination WebSocket authorization |
| Performance | Code-split bundles (vendor/motion), self-hosted variable font (no third-party CDN), no canvas/WebGL work on the main thread, bundle budget in Vite config |
| Accessibility | `aria-live` announcements, visible focus, keyboard moves on the board (Shift+←/→), radio-group switches with arrow keys, reduced-motion respected via `MotionConfig` |

## Tech stack

- **Backend**: Java 21 (virtual threads), Spring Boot 3, Spring Security 6, Spring Data JPA, Spring WebSocket (STOMP), Caffeine cache
- **Frontend**: React 18, Vite 5, TypeScript, Tailwind CSS, framer-motion, dnd-kit, @stomp/stompjs, Lenis, Fraunces + Schibsted Grotesk + Space Mono (self-hosted via Fontsource)
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
docker build .                              # or: build frontend, copy dist/ into backend/src/main/resources/static, then mvn package
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
        ├── components/       # UI kit ("desk" design system), app shell
        └── pages/            # Login, Projects, Board (dnd), IssueDetail, AuditLog
```

The previous Angular implementation is preserved in `frontend-angular.legacy/`
for reference.

## Interface

The UI is built around one idea: **a shared desk**. Issues are white index cards
on a cool blotter. Colour carries meaning: each workflow column has its own
folder-tab colour, priorities are coloured pips, and each teammate owns an ink
used for their avatar, cursor and anything they just changed. Type is Fraunces
(a soft, inky serif) for headings, Schibsted Grotesk for text, and Space Mono
for keys, counts and revision numbers. All three are self-hosted via Fontsource.

Keyboard: **N** focuses "add issue" on a board; on a focused card **Shift+←/→**
moves it a column and **Enter** opens it; **Ctrl/⌘+Enter** posts a comment;
**Ctrl/⌘+K** opens the command palette (jump to any project or issue).

### Collaboration features

- **Live cursors**: teammates' pointers glide over the board; while someone
  drags a card you see a ghost of it riding under their cursor, and the
  original card is outlined in their colour until they drop it.
- **Attributed changes**: every issue event carries `actorId`, so a card that a
  teammate changes arrives with a highlighter mark and "Bob moved this to In review".
- **Typing indicator** in each issue's discussion.
- **Assignees**, picked from the workspace directory, with an "Assigned to me" filter.

### Motion

One vocabulary, borrowed from paper on a desk: cards are dealt onto the board
when it loads, lift and tilt with your hand while dragged, and a rubber stamp
slams onto anything that lands in Done. Counters roll like a mechanical
odometer, project titles fly from the list into the board, and the login page
sits on a cutting-mat grid that dents under your cursor (and Bob's). Page
scrolling is smoothed with [Lenis](https://github.com/darkroomengineering/lenis).
All of it is disabled when the OS asks for reduced motion.

### Real-time API (STOMP)

| Destination | Direction | Payload |
|---|---|---|
| `/topic/issues/{projectId}` | server → client | `{ type: CREATED\|UPDATED\|DELETED, data?, issueId?, actorId }` |
| `/topic/issues/{issueId}/comments` | server → client | `{ type, data?, commentId? }` |
| `/topic/presence/{projectId}` | server → client | `{ projectId, users: [{ userId, displayName }] }` |
| `/app/presence/{projectId}/join\|leave` | client → server | `{}` |
| `/app/cursor/{projectId}` → `/topic/cursors/{projectId}` | both | `{ x (0–1 of board width), y (px), dragging?: issueId, gone? }` |
| `/app/typing/{issueId}` → `/topic/typing/{issueId}` | both | `{ typing: boolean }` |

Every SUBSCRIBE and SEND is checked in `WebSocketConfig`: the session must be
authenticated and the project or issue in the destination must belong to the
caller's tenant. Sender identity on cursor/typing frames comes from the
session, never from the payload, and cursor frames are rate-limited per session.

`GET /api/users` returns the caller's workspace directory (`id`, `displayName`, `role`, no emails).

## Key design decisions

- **Optimistic updates**: every mutation snapshots state before the HTTP call; on error the snapshot is restored and a toast explains the rollback. Stale writes surface the backend's 409 (`@Version` optimistic locking) instead of silently overwriting a teammate's edit.
- **Single-flight refresh**: a burst of concurrent 401s triggers one shared token-refresh promise, not N rotations.
- **Row-level tenancy**: a Hibernate `@Filter` appends `tenant_id = :current` to every query — cross-tenant reads are structurally impossible.
- **Presence**: join/leave messages per project view plus disconnect cleanup; clients reconcile against the latest snapshot broadcast rather than assuming ordered delivery.
- **Live attribution**: a teammate's change arrives on the card with a highlighter mark and a short "Bob moved this to In review" note in their colour. Issue events carry no editor id, so updates are attributed to the only other person on the board when there is exactly one, and to "a teammate" otherwise.

## Running tests

```bash
# Backend
cd backend && ./mvnw test
```
