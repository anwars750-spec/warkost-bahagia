ALTER TABLE orders ADD COLUMN checkout_key CHAR(36) NULL;
ALTER TABLE orders ADD COLUMN checkout_fingerprint CHAR(64) NULL;
CREATE UNIQUE INDEX idx_orders_customer_checkout ON orders(customer_id,checkout_key);
