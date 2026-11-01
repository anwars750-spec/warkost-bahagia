CREATE TABLE cod_settlement_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  driver_id BIGINT UNSIGNED NOT NULL,
  expected_amount BIGINT UNSIGNED NOT NULL,
  submitted_amount BIGINT UNSIGNED NOT NULL,
  discrepancy_amount BIGINT NOT NULL DEFAULT 0,
  status ENUM('SUBMITTED','NEEDS_REVIEW','VERIFIED') NOT NULL,
  evidence_reference VARCHAR(191) NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  admin_verifier_id BIGINT UNSIGNED NULL,
  verified_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cod_batches_driver_status (driver_id,status,id),
  CONSTRAINT fk_cod_batches_driver FOREIGN KEY (driver_id) REFERENCES users(id),
  CONSTRAINT fk_cod_batches_verifier FOREIGN KEY (admin_verifier_id) REFERENCES users(id),
  CONSTRAINT chk_cod_batch_expected CHECK (expected_amount >= 0),
  CONSTRAINT chk_cod_batch_submitted CHECK (submitted_amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE cod_settlement_batch_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  settlement_id BIGINT UNSIGNED NOT NULL,
  expected_amount BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cod_batch_items_order (order_id),
  UNIQUE KEY uq_cod_batch_items_settlement (settlement_id),
  UNIQUE KEY uq_cod_batch_items_batch_order (batch_id,order_id),
  KEY idx_cod_batch_items_batch (batch_id,order_id),
  CONSTRAINT fk_cod_batch_items_batch FOREIGN KEY (batch_id) REFERENCES cod_settlement_batches(id),
  CONSTRAINT fk_cod_batch_items_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_cod_batch_items_settlement FOREIGN KEY (settlement_id) REFERENCES cod_settlements(id),
  CONSTRAINT chk_cod_batch_item_expected CHECK (expected_amount >= 0)
) ENGINE=InnoDB;

INSERT IGNORE INTO settings(`key`,value) VALUES('cod_max_order_amount','150000');
