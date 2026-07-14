-- CollabDesk schema (PostgreSQL-compatible, runs on H2 in PostgreSQL mode)

CREATE TABLE IF NOT EXISTS tenants (
    id          UUID         NOT NULL DEFAULT RANDOM_UUID() PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    plan        VARCHAR(20)  NOT NULL DEFAULT 'FREE',
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id                   UUID         NOT NULL DEFAULT RANDOM_UUID() PRIMARY KEY,
    tenant_id            UUID         NOT NULL REFERENCES tenants(id),
    email                VARCHAR(255) NOT NULL,
    password_hash        VARCHAR(255) NOT NULL,
    display_name         VARCHAR(100) NOT NULL,
    role                 VARCHAR(20)  NOT NULL DEFAULT 'MEMBER',
    token_version        BIGINT       NOT NULL DEFAULT 0,
    created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_email UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id            UUID         NOT NULL DEFAULT RANDOM_UUID() PRIMARY KEY,
    user_id       UUID         NOT NULL REFERENCES users(id),
    token_hash    VARCHAR(255) NOT NULL,
    device_label  VARCHAR(200),
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at    TIMESTAMP    NOT NULL,
    revoked_at    TIMESTAMP,
    CONSTRAINT uq_refresh_token_hash UNIQUE (token_hash)
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS projects (
    id          UUID         NOT NULL DEFAULT RANDOM_UUID() PRIMARY KEY,
    tenant_id   UUID         NOT NULL REFERENCES tenants(id),
    name        VARCHAR(200) NOT NULL,
    description TEXT,
    created_by  UUID         NOT NULL REFERENCES users(id),
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version     BIGINT       NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS issues (
    id          UUID         NOT NULL DEFAULT RANDOM_UUID() PRIMARY KEY,
    tenant_id   UUID         NOT NULL REFERENCES tenants(id),
    project_id  UUID         NOT NULL REFERENCES projects(id),
    title       VARCHAR(300) NOT NULL,
    description TEXT,
    status      VARCHAR(30)  NOT NULL DEFAULT 'TODO',
    priority    VARCHAR(20)  NOT NULL DEFAULT 'MEDIUM',
    assignee_id UUID         REFERENCES users(id),
    created_by  UUID         NOT NULL REFERENCES users(id),
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version     BIGINT       NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS comments (
    id          UUID         NOT NULL DEFAULT RANDOM_UUID() PRIMARY KEY,
    tenant_id   UUID         NOT NULL REFERENCES tenants(id),
    issue_id    UUID         NOT NULL REFERENCES issues(id),
    author_id   UUID         NOT NULL REFERENCES users(id),
    body        TEXT         NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version     BIGINT       NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_log (
    id            UUID         NOT NULL DEFAULT RANDOM_UUID() PRIMARY KEY,
    tenant_id     UUID         NOT NULL REFERENCES tenants(id),
    actor_id      UUID         NOT NULL REFERENCES users(id),
    action        VARCHAR(50)  NOT NULL,
    resource_type VARCHAR(50)  NOT NULL,
    resource_id   UUID         NOT NULL,
    payload       TEXT,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_tenant      ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_tenant   ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_issues_tenant     ON issues(tenant_id);
CREATE INDEX IF NOT EXISTS idx_issues_project    ON issues(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_issue    ON comments(issue_id);
CREATE INDEX IF NOT EXISTS idx_audit_tenant      ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor       ON audit_log(actor_id);
