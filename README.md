# CollabDesk

A multi-tenant project management + real-time chat application built with **Spring Boot 3**, **Angular 17+**, and **H2** (dev) / **PostgreSQL-compatible** schema.

## Pillars demonstrated

| Pillar | Implementation |
|---|---|
| Client-side consistency | Optimistic updates with Signal-based rollback on HTTP error |
| Data-fetching & caching | Spring `@Cacheable` + ETag / `If-None-Match` + Angular `shareReplay` |
| Real-time transport | STOMP over WebSocket with exponential-backoff reconnect & presence |
| Authorization | JWT filter + `@PreAuthorize` + Hibernate tenant filter (row-level) |
| Performance | Lazy routes, `OnPush`, bundle budget enforced in CI |
| Accessibility | CDK FocusTrap, `LiveAnnouncer`, `aria-live`, reduced-motion |

## Tech stack

- **Backend**: Java 21 (virtual threads), Spring Boot 3, Spring Security 6, Spring Data JPA, Spring WebSocket (STOMP), Caffeine cache
- **Frontend**: Angular 17+ (standalone), Signals, RxJS, Angular CDK, Angular Material
- **Database**: H2 (dev, file mode) — schema is PostgreSQL-compatible

## Quick start

### Backend
```bash
cd backend
./mvnw spring-boot:run
# API: http://localhost:8080
# H2 console: http://localhost:8080/h2-console
```

### Frontend
```bash
cd frontend
npm install
ng serve
# App: http://localhost:4200
```

## Architecture

```
collabdesk/
├── backend/          # Spring Boot monolith
│   └── src/main/java/com/collabdesk/
│       ├── config/           # Security, WebSocket, Cache config
│       ├── security/         # JWT filter, token service
│       ├── domain/entity/    # JPA entities with @Version
│       ├── repository/       # Spring Data repos
│       ├── service/          # Business logic
│       ├── controller/       # REST controllers
│       ├── websocket/        # STOMP event handlers
│       ├── dto/              # Request / Response DTOs
│       ├── audit/            # Audit log
│       └── exception/        # Global error handling
└── frontend/         # Angular 17+ SPA
    └── src/app/
        ├── core/             # Guards, interceptors, singleton services
        ├── features/         # Lazy-loaded feature modules
        │   ├── auth/
        │   ├── issues/
        │   ├── projects/
        │   └── chat/
        └── shared/           # Reusable components, directives, pipes
```

## Key design decisions

- **Optimistic updates**: Every mutation snapshots state before the HTTP call. On error the snapshot is restored and a toast is shown.
- **Row-level tenancy**: A Hibernate `@Filter` appends `tenant_id = :current` to every query — cross-tenant reads are structurally impossible.
- **WebSocket reconnect**: Exponential backoff (1 → 2 → 4 … 30s cap) via RxJS `timer()` + `retryWhen`. Presence events re-published on reconnect.
- **Bundle budget**: `angular.json` enforces a 500 KB initial warning / 1 MB error. CI fails on breach.

## Running tests

```bash
# Backend
cd backend && ./mvnw test

# Frontend
cd frontend && ng test --watch=false
```
