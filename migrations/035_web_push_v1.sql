-- Web Push V1. Endpoint SHA-256 is unique without indexing large capability URLs.
CREATE TABLE push_subscriptions(
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 endpoint_hash CHAR(64) NOT NULL UNIQUE,
 endpoint TEXT NOT NULL,
 p256dh VARCHAR(100) NOT NULL,
 auth VARCHAR(32) NOT NULL,
 session_token_hash CHAR(64) NOT NULL,
 role VARCHAR(20) NOT NULL,
 generation CHAR(36) NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 last_success_at TIMESTAMP NULL,
 failure_count INT UNSIGNED NOT NULL DEFAULT 0,
 disabled_at TIMESTAMP NULL,
 FOREIGN KEY(user_id) REFERENCES users(id),
 INDEX idx_push_user(user_id,disabled_at)
) ENGINE=InnoDB;
CREATE TABLE push_deliveries(
 delivery_key CHAR(64) PRIMARY KEY,
 subscription_id BIGINT UNSIGNED NOT NULL,
 status VARCHAR(12) NOT NULL DEFAULT 'CLAIMED',
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(subscription_id) REFERENCES push_subscriptions(id) ON DELETE CASCADE
) ENGINE=InnoDB;
