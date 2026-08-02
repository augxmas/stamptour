SET @resource_image_tags_exists := (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'resource_images'
     AND COLUMN_NAME = 'tags'
);

SET @resource_image_tags_sql := IF(
  @resource_image_tags_exists = 0,
  'ALTER TABLE resource_images ADD COLUMN tags VARCHAR(1000) NULL AFTER description',
  'SELECT 1'
);

PREPARE resource_image_tags_stmt FROM @resource_image_tags_sql;
EXECUTE resource_image_tags_stmt;
DEALLOCATE PREPARE resource_image_tags_stmt;
