INSERT INTO settings(`key`, value)
VALUES ('business_latitude', '-6.9213456')
ON DUPLICATE KEY UPDATE value = CASE
  WHEN value = '-6.9217' THEN VALUES(value)
  ELSE value
END;

INSERT INTO settings(`key`, value)
VALUES ('business_longitude', '106.9309032')
ON DUPLICATE KEY UPDATE value = CASE
  WHEN value = '106.9272' THEN VALUES(value)
  ELSE value
END;
