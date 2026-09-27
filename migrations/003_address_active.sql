ALTER TABLE addresses ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX idx_address_user_active ON addresses(user_id,active);
