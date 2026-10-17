CREATE TABLE IF NOT EXISTS google_api_usage (
  service VARCHAR(40) NOT NULL,
  period_type VARCHAR(10) NOT NULL,
  period_key VARCHAR(10) NOT NULL,
  attempted_calls BIGINT NOT NULL DEFAULT 0,
  successful_calls BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(service, period_type, period_key),
  CHECK(period_type IN ('DAY','MONTH')),
  CHECK(attempted_calls >= 0),
  CHECK(successful_calls >= 0 AND successful_calls <= attempted_calls)
) ENGINE=InnoDB;
