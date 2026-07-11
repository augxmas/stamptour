ALTER TABLE merchants
  ADD COLUMN google_lat DECIMAL(12,8) NULL AFTER address2,
  ADD COLUMN google_lng DECIMAL(12,8) NULL AFTER google_lat;

UPDATE merchants SET google_lat = 13.73671700, google_lng = 100.56105000 WHERE id = 1001;
UPDATE merchants SET google_lat = 13.73057800, google_lng = 100.54176600 WHERE id = 1002;
UPDATE merchants SET google_lat = 13.74611100, google_lng = 100.53472200 WHERE id = 1003;
UPDATE merchants SET google_lat = 12.92760800, google_lng = 100.87577800 WHERE id = 1004;
UPDATE merchants SET google_lat = 12.89184500, google_lng = 100.87516700 WHERE id = 1005;
UPDATE merchants SET google_lat = 12.93407100, google_lng = 100.88926700 WHERE id = 1006;
UPDATE merchants SET google_lat = 13.72049200, google_lng = 100.51370700 WHERE id = 1007;
