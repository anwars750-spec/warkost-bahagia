INSERT INTO settings(`key`,value) VALUES('store_open_time','08:00')
ON DUPLICATE KEY UPDATE value=value;

INSERT INTO settings(`key`,value) VALUES('store_close_time','22:00')
ON DUPLICATE KEY UPDATE value=value;

INSERT INTO settings(`key`,value) VALUES('store_manual_status','OPEN')
ON DUPLICATE KEY UPDATE value=value;

INSERT INTO settings(`key`,value) VALUES('store_closed_reason','')
ON DUPLICATE KEY UPDATE value=value;
