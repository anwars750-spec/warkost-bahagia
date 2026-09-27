CREATE TABLE auth_attempts(attempt_key CHAR(64) PRIMARY KEY, count INT UNSIGNED NOT NULL, window_until BIGINT NOT NULL, INDEX idx_auth_attempts_window(window_until));
