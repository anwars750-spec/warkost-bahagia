ALTER TABLE products
  ADD COLUMN unlimited_stock BOOLEAN NOT NULL DEFAULT FALSE AFTER stock_quantity;
