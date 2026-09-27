ALTER TABLE users ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX idx_users_role_active ON users(role,active);
