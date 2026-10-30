CREATE TABLE loyalty_reward_rules(
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  points_required BIGINT UNSIGNED NOT NULL,
  reward_type ENUM('PERCENT','FIXED') NOT NULL,
  reward_value BIGINT UNSIGNED NOT NULL,
  minimum_order BIGINT UNSIGNED NOT NULL DEFAULT 0,
  maximum_discount BIGINT UNSIGNED NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT UNSIGNED NOT NULL,
  updated_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_loyalty_rules_active_points(active,points_required,id),
  FOREIGN KEY(created_by) REFERENCES users(id),
  FOREIGN KEY(updated_by) REFERENCES users(id),
  CHECK(points_required>0),
  CHECK(reward_value>0)
);

ALTER TABLE orders
  ADD COLUMN loyalty_reward_rule_id BIGINT UNSIGNED NULL AFTER voucher_discount,
  ADD COLUMN loyalty_points_redeemed BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER loyalty_reward_rule_id,
  ADD COLUMN loyalty_discount BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER loyalty_points_redeemed,
  ADD FOREIGN KEY(loyalty_reward_rule_id) REFERENCES loyalty_reward_rules(id);

ALTER TABLE loyalty_transactions
  DROP INDEX order_id,
  ADD COLUMN reward_rule_id BIGINT UNSIGNED NULL AFTER order_id,
  MODIFY COLUMN kind ENUM('EARN','REDEEM','RESTORE') NOT NULL,
  ADD UNIQUE KEY uq_loyalty_order_kind(order_id,kind),
  ADD INDEX idx_loyalty_user_date(user_id,created_at,id),
  ADD CONSTRAINT fk_loyalty_transaction_reward_rule
    FOREIGN KEY(reward_rule_id) REFERENCES loyalty_reward_rules(id),
  ADD CHECK(amount<>0);
