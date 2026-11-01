ALTER TABLE payments
  MODIFY COLUMN method ENUM('CASH','BANK_TRANSFER','QRIS') NOT NULL,
  ADD COLUMN amount BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER status,
  ADD COLUMN provider VARCHAR(40) NULL AFTER amount,
  ADD COLUMN provider_reference VARCHAR(191) NULL AFTER provider,
  ADD COLUMN transaction_reference VARCHAR(191) NULL AFTER provider_reference,
  ADD COLUMN qr_payload TEXT NULL AFTER transaction_reference,
  ADD COLUMN payment_url TEXT NULL AFTER qr_payload,
  ADD COLUMN failed_at TIMESTAMP NULL AFTER paid_at,
  ADD COLUMN expired_at TIMESTAMP NULL AFTER failed_at,
  ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER expires_at,
  ADD UNIQUE KEY uq_payment_transaction_reference(transaction_reference),
  ADD UNIQUE KEY uq_payment_provider_reference(provider,provider_reference);

UPDATE payments p
JOIN orders o ON o.id=p.order_id
SET p.amount=o.total
WHERE p.amount=0;

CREATE TABLE payment_provider_events(
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider VARCHAR(40) NOT NULL,
  event_id VARCHAR(191) NOT NULL,
  payment_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(40) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payment_provider_event(provider,event_id),
  INDEX idx_payment_events_payment(payment_id,received_at,id),
  FOREIGN KEY(payment_id) REFERENCES payments(id)
);

CREATE TABLE stock_reservations(
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  status ENUM('RESERVED','COMMITTED','RELEASED') NOT NULL DEFAULT 'RESERVED',
  expires_at TIMESTAMP NOT NULL,
  committed_at TIMESTAMP NULL,
  released_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_stock_reservation_order_product(order_id,product_id),
  INDEX idx_stock_reservations_product_status(product_id,status,expires_at),
  FOREIGN KEY(order_id) REFERENCES orders(id),
  FOREIGN KEY(product_id) REFERENCES products(id),
  CHECK(quantity>0)
);

INSERT INTO settings(`key`,value) VALUES('payment_expiry_minutes','15')
ON DUPLICATE KEY UPDATE value=value;
