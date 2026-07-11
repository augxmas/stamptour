ALTER TABLE project_locations
  MODIFY COLUMN dest_type ENUM('location','exhibit','merchant') NOT NULL DEFAULT 'location';
