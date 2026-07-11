ALTER TABLE merchants
  ADD COLUMN profile_image_path VARCHAR(255) NULL AFTER bank_copy_name,
  ADD COLUMN profile_image_name VARCHAR(255) NULL AFTER profile_image_path;
