ALTER TABLE promotions ADD COLUMN promotion_family VARCHAR(32) NULL;
ALTER TABLE promotions ADD COLUMN benefit_type VARCHAR(24) NULL;
ALTER TABLE promotions ADD COLUMN scope_type VARCHAR(24) NOT NULL DEFAULT 'ORDER';
ALTER TABLE promotions ADD COLUMN target_product_id BIGINT NULL;
ALTER TABLE promotions ADD COLUMN target_category_id BIGINT NULL;
ALTER TABLE promotions ADD COLUMN target_subcategory_id BIGINT NULL;
ALTER TABLE promotions ADD COLUMN gift_product_id BIGINT NULL;
ALTER TABLE promotions ADD COLUMN registration_days INT NULL;
ALTER TABLE promotions ADD COLUMN birthday_window_before INT NOT NULL DEFAULT 0;
ALTER TABLE promotions ADD COLUMN birthday_window_after INT NOT NULL DEFAULT 0;
ALTER TABLE promotions ADD COLUMN schedule_type VARCHAR(24) NOT NULL DEFAULT 'RANGE';
ALTER TABLE promotions ADD COLUMN schedule_weekdays VARCHAR(64) NULL;
ALTER TABLE promotions ADD COLUMN schedule_dates TEXT NULL;
ALTER TABLE promotions ADD COLUMN schedule_month_days VARCHAR(128) NULL;
ALTER TABLE promotions ADD COLUMN time_start VARCHAR(5) NULL;
ALTER TABLE promotions ADD COLUMN time_end VARCHAR(5) NULL;
ALTER TABLE promotions ADD COLUMN per_member_limit INT NOT NULL DEFAULT 1;
ALTER TABLE promotions ADD COLUMN payment_eligibility VARCHAR(24) NOT NULL DEFAULT 'NON_CASH';
ALTER TABLE orders ADD COLUMN promotion_snapshot JSON NULL;
ALTER TABLE orders ADD COLUMN promotion_discount BIGINT NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN is_promotion_gift TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN promotion_id BIGINT NULL;
ALTER TABLE promotions ADD CONSTRAINT fk_promo_target_product FOREIGN KEY(target_product_id) REFERENCES products(id);
ALTER TABLE promotions ADD CONSTRAINT fk_promo_target_category FOREIGN KEY(target_category_id) REFERENCES categories(id);
ALTER TABLE promotions ADD CONSTRAINT fk_promo_target_subcategory FOREIGN KEY(target_subcategory_id) REFERENCES product_subcategories(id);
ALTER TABLE promotions ADD CONSTRAINT fk_promo_gift_product FOREIGN KEY(gift_product_id) REFERENCES products(id);
ALTER TABLE order_items ADD CONSTRAINT fk_order_item_promotion FOREIGN KEY(promotion_id) REFERENCES promotions(id);
CREATE TABLE promotion_redemptions(
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  promotion_id BIGINT NOT NULL,
  customer_id BIGINT NOT NULL,
  order_id BIGINT NOT NULL UNIQUE,
  status ENUM('APPLIED','RESTORED') NOT NULL DEFAULT 'APPLIED',
  discount_amount BIGINT NOT NULL DEFAULT 0,
  gift_product_id BIGINT NULL,
  gift_quantity INT NOT NULL DEFAULT 0,
  calendar_year INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  restored_at DATETIME NULL,
  UNIQUE KEY uq_promotion_order(promotion_id,customer_id,order_id),
  KEY idx_promotion_usage(promotion_id,customer_id,status,calendar_year),
  CONSTRAINT fk_redemption_promotion FOREIGN KEY(promotion_id) REFERENCES promotions(id),
  CONSTRAINT fk_redemption_customer FOREIGN KEY(customer_id) REFERENCES users(id),
  CONSTRAINT fk_redemption_order FOREIGN KEY(order_id) REFERENCES orders(id),
  CONSTRAINT fk_redemption_gift FOREIGN KEY(gift_product_id) REFERENCES products(id)
) ENGINE=InnoDB;
