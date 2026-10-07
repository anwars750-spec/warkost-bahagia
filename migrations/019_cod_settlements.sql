CREATE TABLE cod_settlements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  driver_id BIGINT UNSIGNED NOT NULL,
  expected_amount BIGINT UNSIGNED NOT NULL,
  cash_amount BIGINT UNSIGNED NULL,
  evidence_reference VARCHAR(191) NULL,
  submitted_at TIMESTAMP NULL,
  admin_verifier_id BIGINT UNSIGNED NULL,
  verified_at TIMESTAMP NULL,
  status ENUM('AWAITING_COD_SETTLEMENT','SUBMITTED','NEEDS_REVIEW','VERIFIED') NOT NULL DEFAULT 'AWAITING_COD_SETTLEMENT',
  discrepancy_amount BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cod_settlements_order (order_id),
  KEY idx_cod_settlements_driver_status (driver_id,status,id),
  CONSTRAINT fk_cod_settlements_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_cod_settlements_driver FOREIGN KEY (driver_id) REFERENCES users(id),
  CONSTRAINT fk_cod_settlements_verifier FOREIGN KEY (admin_verifier_id) REFERENCES users(id),
  CONSTRAINT chk_cod_expected_amount CHECK (expected_amount >= 0),
  CONSTRAINT chk_cod_cash_amount CHECK (cash_amount IS NULL OR cash_amount >= 0)
) ENGINE=InnoDB;

INSERT IGNORE INTO cod_settlements(order_id,driver_id,expected_amount)
SELECT o.id,d.driver_id,p.amount
FROM orders o
JOIN deliveries d ON d.order_id=o.id
JOIN payments p ON p.order_id=o.id
WHERE o.status='DELIVERED'
  AND p.method='CASH'
  AND p.status IN('UNPAID','PENDING');
