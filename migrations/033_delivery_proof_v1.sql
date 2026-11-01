CREATE TABLE delivery_proofs(
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL UNIQUE,
  delivery_id BIGINT UNSIGNED NOT NULL UNIQUE,
  driver_id BIGINT UNSIGNED NOT NULL,
  media_id CHAR(36) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_delivery_proof_order FOREIGN KEY(order_id) REFERENCES orders(id),
  CONSTRAINT fk_delivery_proof_delivery FOREIGN KEY(delivery_id) REFERENCES deliveries(id),
  CONSTRAINT fk_delivery_proof_driver FOREIGN KEY(driver_id) REFERENCES users(id),
  CONSTRAINT fk_delivery_proof_media FOREIGN KEY(media_id) REFERENCES media_assets(id),
  INDEX idx_delivery_proofs_driver_date(driver_id,created_at,id)
) ENGINE=InnoDB;
