CREATE TABLE IF NOT EXISTS manager_owner_settlements (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  settlement_number VARCHAR(40) UNIQUE NULL,
  manager_id BIGINT NOT NULL,
  destination VARCHAR(10) NOT NULL,
  expected_amount BIGINT NOT NULL,
  submitted_amount BIGINT NOT NULL,
  manager_overage_amount BIGINT NOT NULL DEFAULT 0,
  bank_reference VARCHAR(120) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  owner_id BIGINT NULL,
  owner_received_amount BIGINT NULL,
  owner_overage_amount BIGINT NOT NULL DEFAULT 0,
  reject_reason VARCHAR(255) NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP NULL,
  rejected_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_manager_owner_status(status, id),
  INDEX idx_manager_owner_manager(manager_id, status, id),
  CONSTRAINT fk_manager_owner_manager FOREIGN KEY (manager_id) REFERENCES users(id),
  CONSTRAINT fk_manager_owner_owner FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS manager_owner_settlement_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  settlement_id BIGINT NOT NULL,
  admin_settlement_id BIGINT NOT NULL,
  amount BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_manager_owner_item(settlement_id, admin_settlement_id),
  INDEX idx_manager_owner_item_admin(admin_settlement_id),
  CONSTRAINT fk_manager_owner_item_settlement FOREIGN KEY (settlement_id) REFERENCES manager_owner_settlements(id),
  CONSTRAINT fk_manager_owner_item_admin FOREIGN KEY (admin_settlement_id) REFERENCES admin_shift_settlements(id)
) ENGINE=InnoDB;
