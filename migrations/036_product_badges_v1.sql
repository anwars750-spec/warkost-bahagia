-- Manually selected product highlight, not automatically inferred from sales metrics.
ALTER TABLE products
  ADD COLUMN badge_type ENUM('FAVORITE','BEST_SELLER','POPULAR','RECOMMENDED') NULL DEFAULT NULL AFTER image_url;
