ALTER TABLE order_items
  ADD COLUMN note VARCHAR(200) NULL AFTER quantity;
