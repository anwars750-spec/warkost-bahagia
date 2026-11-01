ALTER TABLE promotions
  ADD COLUMN voucher_category ENUM('REGULAR','BIRTHDAY') NOT NULL DEFAULT 'REGULAR' AFTER voucher_type;

INSERT INTO settings(`key`,value) VALUES('delivery_free_km','3')
  ON DUPLICATE KEY UPDATE value='3';
INSERT INTO settings(`key`,value) VALUES('delivery_max_km','10')
  ON DUPLICATE KEY UPDATE value='10';

UPDATE promotions
   SET title=REPLACE(title,'Gratis Ongkir 5 KM','Gratis Ongkir 3 KM'),
       description=REPLACE(description,'radius 5 km','radius 3 km'),
       terms=REPLACE(terms,'radius maksimal 5 km','radius maksimal 3 km')
 WHERE title LIKE '%Gratis Ongkir 5 KM%'
    OR description LIKE '%radius 5 km%'
    OR terms LIKE '%radius maksimal 5 km%';
