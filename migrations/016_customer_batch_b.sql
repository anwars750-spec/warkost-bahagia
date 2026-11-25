ALTER TABLE users
  ADD COLUMN birth_date DATE NULL AFTER phone,
  ADD COLUMN terms_accepted_at TIMESTAMP NULL AFTER birth_date,
  ADD UNIQUE KEY uq_users_phone(phone);

ALTER TABLE addresses
  ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT FALSE AFTER longitude,
  ADD INDEX idx_address_user_default(user_id,active,is_default);

UPDATE addresses a
JOIN (
  SELECT user_id,MAX(id) id
  FROM addresses
  WHERE active=1
  GROUP BY user_id
) selected ON selected.id=a.id
SET a.is_default=TRUE;
