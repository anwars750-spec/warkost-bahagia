CREATE TABLE preparation_eta_extensions(
  order_id BIGINT UNSIGNED NOT NULL,
  station VARCHAR(16) NOT NULL,
  extra_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(order_id,station),
  CONSTRAINT fk_preparation_eta_extension_order FOREIGN KEY(order_id) REFERENCES orders(id),
  CONSTRAINT fk_preparation_eta_extension_user FOREIGN KEY(updated_by) REFERENCES users(id),
  INDEX idx_preparation_eta_extensions_updated(updated_at,order_id)
) ENGINE=InnoDB;
