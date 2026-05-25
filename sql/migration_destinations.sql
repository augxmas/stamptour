-- 목적지(위치/전시물) 기능 확장 마이그레이션
-- - project_locations: dest_type(위치/전시물), image_path(아이콘), 좌표·설명 nullable(전시물은 좌표 없음)
-- - projects: locations_submitted(제출 플래그)
-- 추가 위주 변경이라 안전합니다. 컬럼이 이미 있으면 해당 ALTER는 건너뛰면 됩니다.

ALTER TABLE project_locations
  ADD COLUMN dest_type ENUM('location','exhibit') NOT NULL DEFAULT 'location' AFTER display_seq;

ALTER TABLE project_locations
  ADD COLUMN image_path VARCHAR(255) NULL AFTER location_desc;

ALTER TABLE project_locations
  MODIFY COLUMN kakao_lat DECIMAL(12,8) NULL;

ALTER TABLE project_locations
  MODIFY COLUMN kakao_lng DECIMAL(12,8) NULL;

ALTER TABLE project_locations
  MODIFY COLUMN location_desc VARCHAR(50) NULL;

ALTER TABLE projects
  ADD COLUMN locations_submitted TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE projects
  ADD COLUMN locations_submitted_at DATETIME NULL;

-- 방문자 약관/개인정보 동의 기록 시각
ALTER TABLE visitors
  ADD COLUMN consent_at DATETIME NULL AFTER phone;

-- 미션 완료 시 발급되는 Gift QR (1회용, 가맹점 사용처리)
CREATE TABLE IF NOT EXISTS gifts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  visitor_id BIGINT NOT NULL,
  token VARCHAR(64) NOT NULL,
  amount BIGINT NOT NULL,
  status ENUM('issued','used') NOT NULL DEFAULT 'issued',
  qr_image_path VARCHAR(255) NULL,
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME NULL,
  UNIQUE KEY uq_gift_token (token),
  UNIQUE KEY uq_gift_visitor (project_id, visitor_id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (visitor_id) REFERENCES visitors(id)
);
