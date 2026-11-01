ALTER TABLE promotions
  ADD COLUMN voucher_type ENUM('PERCENT','FIXED') NULL AFTER active,
  ADD COLUMN discount_value BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER voucher_type,
  ADD COLUMN minimum_order BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER discount_value,
  ADD COLUMN max_discount BIGINT UNSIGNED NULL AFTER minimum_order,
  ADD COLUMN quota BIGINT UNSIGNED NULL AFTER max_discount,
  ADD COLUMN used_count BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER quota,
  ADD COLUMN one_per_customer BOOLEAN NOT NULL DEFAULT TRUE AFTER used_count;

CREATE TABLE promo_claims(
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  promotion_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  state ENUM('CLAIMED','USED') NOT NULL DEFAULT 'CLAIMED',
  order_id BIGINT UNSIGNED NULL UNIQUE,
  claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  used_at TIMESTAMP NULL,
  UNIQUE KEY uq_promo_claim_customer(promotion_id,customer_id),
  INDEX idx_promo_claims_customer_state(customer_id,state,promotion_id),
  FOREIGN KEY(promotion_id) REFERENCES promotions(id),
  FOREIGN KEY(customer_id) REFERENCES users(id),
  FOREIGN KEY(order_id) REFERENCES orders(id)
);

ALTER TABLE orders
  ADD COLUMN promotion_id BIGINT UNSIGNED NULL AFTER driver_delay_notice,
  ADD COLUMN promo_claim_id BIGINT UNSIGNED NULL AFTER promotion_id,
  ADD COLUMN voucher_discount BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER promo_claim_id,
  ADD UNIQUE KEY uq_orders_promo_claim(promo_claim_id),
  ADD FOREIGN KEY(promotion_id) REFERENCES promotions(id),
  ADD FOREIGN KEY(promo_claim_id) REFERENCES promo_claims(id);
