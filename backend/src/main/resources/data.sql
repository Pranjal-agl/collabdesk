-- Seed data for development
-- Password for all seed users: "Password1!" (BCrypt hash below)

INSERT INTO tenants (id, name, plan) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Acme Corp', 'PRO'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Evil Corp', 'FREE')
ON CONFLICT DO NOTHING;

INSERT INTO users (id, tenant_id, email, password_hash, display_name, role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'alice@acme.com', '$2a$12$eBJsaOMBSY7bM5UlrG7Z4.FvgCWEJf7ssFfKJW2fkzXfJf2hVJT2y', 'Alice Admin', 'ADMIN'),
  ('00000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   'bob@acme.com',   '$2a$12$eBJsaOMBSY7bM5UlrG7Z4.FvgCWEJf7ssFfKJW2fkzXfJf2hVJT2y', 'Bob Member', 'MEMBER'),
  ('00000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002',
   'eve@evil.com',   '$2a$12$eBJsaOMBSY7bM5UlrG7Z4.FvgCWEJf7ssFfKJW2fkzXfJf2hVJT2y', 'Eve Attacker', 'MEMBER')
ON CONFLICT DO NOTHING;
