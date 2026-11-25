CREATE TABLE banners(
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  internal_name VARCHAR(100) NOT NULL,
  image_url VARCHAR(1000) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_banners_active_order(active,sort_order,id)
) ENGINE=InnoDB;

INSERT INTO banners(internal_name,image_url,active,sort_order)
SELECT 'Banner Utama Warkost','/demo/promo-warkost.webp',TRUE,0
WHERE NOT EXISTS (SELECT 1 FROM banners);

INSERT INTO settings(`key`,value)
VALUES('standalone_banner_initialized_v1','1')
ON DUPLICATE KEY UPDATE value=value;
