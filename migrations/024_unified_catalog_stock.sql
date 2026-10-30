CREATE TABLE product_subcategories(
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_subcategory_category FOREIGN KEY(category_id) REFERENCES categories(id),
  CONSTRAINT fk_subcategory_created_by FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT fk_subcategory_updated_by FOREIGN KEY(updated_by) REFERENCES users(id),
  UNIQUE KEY uq_subcategory_category_name(category_id,name),
  INDEX idx_subcategories_category_active(category_id,active,sort_order,id)
);

ALTER TABLE products
  ADD COLUMN subcategory_id BIGINT UNSIGNED NULL AFTER category_id,
  ADD COLUMN stock_unit ENUM('PCS','GRAM') NOT NULL DEFAULT 'PCS' AFTER stock_quantity,
  ADD COLUMN price_unit_quantity INT UNSIGNED NOT NULL DEFAULT 1 AFTER stock_unit,
  ADD COLUMN minimum_order_quantity INT UNSIGNED NOT NULL DEFAULT 1 AFTER price_unit_quantity,
  ADD COLUMN order_step_quantity INT UNSIGNED NOT NULL DEFAULT 1 AFTER minimum_order_quantity,
  ADD COLUMN low_stock_threshold INT UNSIGNED NOT NULL DEFAULT 5 AFTER order_step_quantity,
  ADD CONSTRAINT fk_product_subcategory FOREIGN KEY(subcategory_id) REFERENCES product_subcategories(id),
  ADD INDEX idx_products_subcategory_active(subcategory_id,active);

ALTER TABLE order_items
  ADD COLUMN stock_unit ENUM('PCS','GRAM') NOT NULL DEFAULT 'PCS' AFTER prep_station,
  ADD COLUMN price_unit_quantity INT UNSIGNED NOT NULL DEFAULT 1 AFTER stock_unit;

INSERT IGNORE INTO categories(name,active) VALUES
  ('Makanan',TRUE),
  ('Minuman',TRUE),
  ('Bahan Baku',TRUE);

INSERT IGNORE INTO product_subcategories(category_id,name,active,sort_order)
SELECT id,'Makanan Berat',TRUE,10 FROM categories WHERE name='Makanan';
INSERT IGNORE INTO product_subcategories(category_id,name,active,sort_order)
SELECT id,'Mie',TRUE,20 FROM categories WHERE name='Makanan';
INSERT IGNORE INTO product_subcategories(category_id,name,active,sort_order)
SELECT id,'Coffee',TRUE,10 FROM categories WHERE name='Minuman';
INSERT IGNORE INTO product_subcategories(category_id,name,active,sort_order)
SELECT id,'Non Coffee',TRUE,20 FROM categories WHERE name='Minuman';
INSERT IGNORE INTO product_subcategories(category_id,name,active,sort_order)
SELECT id,'Kopi',TRUE,10 FROM categories WHERE name='Bahan Baku';
INSERT IGNORE INTO product_subcategories(category_id,name,active,sort_order)
SELECT id,'Susu & Dairy',TRUE,20 FROM categories WHERE name='Bahan Baku';
INSERT IGNORE INTO product_subcategories(category_id,name,active,sort_order)
SELECT id,'Sirup & Powder',TRUE,30 FROM categories WHERE name='Bahan Baku';
INSERT IGNORE INTO product_subcategories(category_id,name,active,sort_order)
SELECT id,'Lainnya',TRUE,40 FROM categories WHERE name='Bahan Baku';

UPDATE products p
JOIN product_subcategories s ON s.name='Makanan Berat'
JOIN categories c ON c.id=s.category_id AND c.name='Makanan'
SET p.subcategory_id=s.id
WHERE p.name='Nasi Goreng Warkost';

UPDATE products p
JOIN product_subcategories s ON s.name='Mie'
JOIN categories c ON c.id=s.category_id AND c.name='Makanan'
SET p.subcategory_id=s.id
WHERE p.name='Mie Ayam Bahagia';

UPDATE products p
JOIN product_subcategories s ON s.name='Coffee'
JOIN categories c ON c.id=s.category_id AND c.name='Minuman'
SET p.subcategory_id=s.id
WHERE p.name='Kopi Susu Rumah';

INSERT INTO products(
  category_id,subcategory_id,name,description,price,image_url,active,
  prep_station,stock_quantity,stock_unit,price_unit_quantity,
  minimum_order_quantity,order_step_quantity,low_stock_threshold
)
SELECT c.id,s.id,'Biji Kopi Arabica Sukabumi – Medium Roast',
  'Biji kopi Arabica pilihan dengan profil medium roast. Memiliki karakter rasa cokelat, caramel, dan nutty. Cocok digunakan untuk espresso, milk-based coffee, maupun manual brew. Dijual mulai 100 gram dengan kelipatan 100 gram.',
  18000,'/demo/bahan-baku-kopi.svg',TRUE,'CASHIER',10000,'GRAM',100,100,100,2000
FROM categories c
JOIN product_subcategories s ON s.category_id=c.id AND s.name='Kopi'
WHERE c.name='Bahan Baku'
  AND NOT EXISTS(
    SELECT 1 FROM products
    WHERE name='Biji Kopi Arabica Sukabumi – Medium Roast'
  );
