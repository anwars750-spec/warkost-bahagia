CREATE TABLE IF NOT EXISTS admin_operators(
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  pin_hash VARCHAR(255) NOT NULL,
  active TINYINT NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_admin_operators_active(active,name),
  CONSTRAINT fk_admin_operators_created_by FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_shifts(
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  admin_user_id BIGINT UNSIGNED NOT NULL,
  operator_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_admin_shifts_account_status(admin_user_id,status,id),
  INDEX idx_admin_shifts_operator(operator_id,status,id),
  CONSTRAINT fk_admin_shifts_user FOREIGN KEY(admin_user_id) REFERENCES users(id),
  CONSTRAINT fk_admin_shifts_operator FOREIGN KEY(operator_id) REFERENCES admin_operators(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_cash_receipts(
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  shift_id BIGINT UNSIGNED NOT NULL,
  operator_id BIGINT UNSIGNED NOT NULL,
  batch_id BIGINT UNSIGNED NOT NULL UNIQUE,
  expected_amount BIGINT NOT NULL,
  actual_amount BIGINT NOT NULL,
  overage_amount BIGINT NOT NULL DEFAULT 0,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_admin_cash_receipts_shift(shift_id,id),
  CONSTRAINT fk_admin_receipts_shift FOREIGN KEY(shift_id) REFERENCES admin_shifts(id),
  CONSTRAINT fk_admin_receipts_operator FOREIGN KEY(operator_id) REFERENCES admin_operators(id),
  CONSTRAINT fk_admin_receipts_batch FOREIGN KEY(batch_id) REFERENCES cod_settlement_batches(id)
) ENGINE=InnoDB;
