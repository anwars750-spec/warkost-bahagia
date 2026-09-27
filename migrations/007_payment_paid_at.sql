ALTER TABLE payments ADD COLUMN paid_at TIMESTAMP NULL;
CREATE INDEX idx_payments_paid_at ON payments(status,paid_at);
