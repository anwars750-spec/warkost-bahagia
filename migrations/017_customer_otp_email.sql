ALTER TABLE users
  ADD COLUMN email_verified_at TIMESTAMP NULL AFTER terms_accepted_at;

UPDATE users
SET email_verified_at=COALESCE(created_at,CURRENT_TIMESTAMP)
WHERE role='CUSTOMER' AND active=TRUE AND email_verified_at IS NULL;

CREATE TABLE otp_challenges(
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NOT NULL,
  purpose ENUM('REGISTRATION','PASSWORD_RESET') NOT NULL,
  otp_hash CHAR(64) NOT NULL,
  expires_at BIGINT NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  consumed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_sent_at BIGINT NOT NULL,
  verified_at TIMESTAMP NULL,
  reset_token_hash CHAR(64) NULL UNIQUE,
  reset_expires_at BIGINT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id),
  INDEX idx_otp_user_purpose(user_id,purpose,consumed_at,id),
  INDEX idx_otp_expiry(expires_at,consumed_at),
  CHECK(attempts<=5)
) ENGINE=InnoDB;
