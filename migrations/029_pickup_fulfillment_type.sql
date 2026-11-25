ALTER TABLE orders
  ADD COLUMN fulfillment_type ENUM('DELIVERY','PICKUP') NOT NULL DEFAULT 'DELIVERY' AFTER address_id;

UPDATE orders o
JOIN addresses a ON a.id=o.address_id
SET o.fulfillment_type='PICKUP'
WHERE o.fulfillment_type='DELIVERY'
  AND a.label='Ambil di Warkost'
  AND a.detail='Warkost Bahagia · Ambil di tempat';

CREATE INDEX idx_orders_fulfillment_status
  ON orders(fulfillment_type,status,id);
