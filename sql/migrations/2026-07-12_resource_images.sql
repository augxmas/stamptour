CREATE TABLE IF NOT EXISTS resource_images (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  host_id BIGINT NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  description TEXT NULL,
  tags VARCHAR(1000) NULL,
  file_path VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_resource_images_host_created (host_id, created_at),
  INDEX idx_resource_images_host_name (host_id, original_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
