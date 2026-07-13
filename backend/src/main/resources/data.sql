-- Seed data for development
-- Password for all seed users: "admin123" (BCrypt hash below)

DELETE FROM audit_log;
DELETE FROM comments;
DELETE FROM issues;
DELETE FROM projects;
DELETE FROM users;
DELETE FROM tenants;

INSERT INTO tenants (id, name, plan, created_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Acme Corp', 'PRO', CURRENT_TIMESTAMP),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Evil Corp', 'FREE', CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

INSERT INTO users (id, tenant_id, email, password_hash, display_name, role, token_version, created_at) VALUES
  ('00000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
  'alice@acme.com', '$2a$10$SL2Z.nmPylswR1SB4zDDbO/dx6R6Mmpz2jetRLiPTYNm3CHlKSd/C', 'Alice Admin', 'ADMIN', 0, CURRENT_TIMESTAMP),
  ('00000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
  'bob@acme.com',   '$2a$10$SL2Z.nmPylswR1SB4zDDbO/dx6R6Mmpz2jetRLiPTYNm3CHlKSd/C', 'Bob Member', 'MEMBER', 0, CURRENT_TIMESTAMP),
  ('00000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002',
  'eve@evil.com',   '$2a$10$SL2Z.nmPylswR1SB4zDDbO/dx6R6Mmpz2jetRLiPTYNm3CHlKSd/C', 'Eve Attacker', 'MEMBER', 0, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

INSERT INTO projects (id, tenant_id, name, description, created_by, created_at, version) VALUES
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
  'CollabDesk Launch', 'Acme product launch board', '00000000-0000-0000-0000-000000000001', CURRENT_TIMESTAMP, 0),
  ('20000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
  'Evil Campaign', 'Evil Corp private board', '00000000-0000-0000-0000-000000000003', CURRENT_TIMESTAMP, 0)
ON CONFLICT DO NOTHING;

INSERT INTO issues (id, tenant_id, project_id, title, description, status, priority, created_by, created_at, updated_at, version) VALUES
  ('30000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001', 'Ship v1 dashboard', 'Prepare demo-ready dashboard flow', 'TODO', 'HIGH',
  '00000000-0000-0000-0000-000000000001', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0),
  ('40000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000001', 'Steal roadmap', 'Cross-tenant access should fail for this issue', 'TODO', 'MEDIUM',
  '00000000-0000-0000-0000-000000000003', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
ON CONFLICT DO NOTHING;
