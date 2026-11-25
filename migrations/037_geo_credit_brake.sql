CREATE TABLE geo_credit_lock (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY
) ENGINE=InnoDB;
INSERT INTO geo_credit_lock(id) VALUES(1);

CREATE TABLE geo_credit_reservations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  endpoint VARCHAR(32) NOT NULL,
  credits SMALLINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  ip_hash CHAR(64) NOT NULL,
  attempt_id CHAR(36) NOT NULL,
  reserved_ms BIGINT UNSIGNED NOT NULL,
  finished_ms BIGINT UNSIGNED NULL,
  outcome VARCHAR(12) NULL,
  INDEX idx_geo_finished (finished_ms)
) ENGINE=InnoDB;
