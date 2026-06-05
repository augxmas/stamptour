-- 가맹점별 정산/사용이력 분리: gift_redemptions 에 merchant_id 추가
ALTER TABLE gift_redemptions
  ADD COLUMN merchant_id BIGINT NULL AFTER visitor_id,
  ADD INDEX idx_gr_merchant (merchant_id),
  ADD CONSTRAINT fk_gr_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id);
