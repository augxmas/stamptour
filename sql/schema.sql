-- ============================================================
--  모노라마 트래커 — MariaDB 스키마 생성 스크립트
--  실행:  mysql -u <user> -p < sql/schema.sql
--  (DB 사용자/권한 생성은 sql/init_tracker.sql 참고. 앱은 .env의
--   ENCRYPTION_KEY를 fn_encrypt/fn_decrypt 의 키 인자로 전달한다.)
-- ============================================================

CREATE DATABASE IF NOT EXISTS tracker
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE tracker;

-- ── 암호화 함수: 앱에서 fn_encrypt(값, 키) / fn_decrypt(값, 키) 형태로 사용 ──
DROP FUNCTION IF EXISTS fn_encrypt;
CREATE FUNCTION fn_encrypt(p_value TEXT, p_key VARCHAR(64))
  RETURNS VARCHAR(512) CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci
  NO SQL DETERMINISTIC
  RETURN HEX(AES_ENCRYPT(p_value, p_key));

DROP FUNCTION IF EXISTS fn_decrypt;
CREATE FUNCTION fn_decrypt(p_value VARCHAR(512), p_key VARCHAR(64))
  RETURNS TEXT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci
  NO SQL DETERMINISTIC
  RETURN CAST(AES_DECRYPT(UNHEX(p_value), p_key) AS CHAR);

-- ============================================================
--  테이블 (FK 순서 무관하게 생성되도록 체크 일시 해제)
-- ============================================================
SET FOREIGN_KEY_CHECKS = 0;

-- 암호화 컬럼(host_name, host_email, mobile_phone, phone 등)은
-- fn_encrypt(평문, ENCRYPTION_KEY) 의 HEX 결과를 저장합니다. 아래 함수 정의 참조.
CREATE TABLE IF NOT EXISTS hosts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  host_name VARCHAR(512) NOT NULL,
  host_email VARCHAR(512) NOT NULL UNIQUE,
  mobile_phone VARCHAR(255) NULL,
  phone VARCHAR(255) NULL,
  organization_name VARCHAR(255) NULL,
  biz_no VARCHAR(20) NULL,
  biz_cert_path VARCHAR(255) NULL,
  biz_cert_name VARCHAR(255) NULL,
  address_zip VARCHAR(20) NULL,
  address1 VARCHAR(255) NULL,
  address2 VARCHAR(255) NULL,
  password_hash VARCHAR(80) NOT NULL,
  status ENUM('pending','approved','cancelled','terminated','locked') NOT NULL DEFAULT 'pending',
  status_reason VARCHAR(255) NULL,
  project_pin_fail_count INT NOT NULL DEFAULT 0,
  project_locked TINYINT(1) NOT NULL DEFAULT 0,
  last_login_ip VARCHAR(80) NULL,
  last_login_at DATETIME NULL,
  last_logout_at DATETIME NULL,
  password_reset_required TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS host_email_verify_codes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code  CHAR(6) NOT NULL,
  used  TINYINT(1) NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_hvc_email (email)
);

CREATE TABLE IF NOT EXISTS host_project_pin_codes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  host_id BIGINT NOT NULL,
  pin_code CHAR(6) NOT NULL,
  expires_at DATETIME NOT NULL,
  used TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (host_id) REFERENCES hosts(id)
);

CREATE TABLE IF NOT EXISTS project_daily_sequences (
  seq_date CHAR(8) PRIMARY KEY,
  last_no INT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  host_id BIGINT NOT NULL,
  project_name VARCHAR(160) NOT NULL,
  project_serial VARCHAR(20) NOT NULL UNIQUE,
  description VARCHAR(200) NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  gift_amount BIGINT NOT NULL,
  gift_qty INT NOT NULL DEFAULT 0,
  prize_amount BIGINT NOT NULL DEFAULT 0,
  prize_qty INT NOT NULL DEFAULT 0,
  budget_amount BIGINT NOT NULL,
  pin_hash VARCHAR(80) NOT NULL,
  pin_enc VARCHAR(255) NULL, -- 가맹점 승인 메일에 PIN을 동봉하기 위한 복호화 가능 저장값(fn_encrypt)
  status ENUM('draft','quoted','deposit_wait','deposit_confirmed','ready_to_start','started','completed','cancelled') NOT NULL DEFAULT 'quoted',
  quote_days INT NOT NULL,
  quote_amount BIGINT NOT NULL,
  quote_sent_at DATETIME NULL,
  quote_read_at DATETIME NULL,
  quote_read TINYINT(1) NOT NULL DEFAULT 0,
  deposit_confirmed_at DATETIME NULL,
  approved_at DATETIME NULL,
  started_at DATETIME NULL,
  supervisor_mobile_image_path VARCHAR(255) NULL,
  supervisor_favicon_path VARCHAR(255) NULL,
  locations_submitted TINYINT(1) NOT NULL DEFAULT 0,
  locations_submitted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (host_id) REFERENCES hosts(id)
);

CREATE TABLE IF NOT EXISTS project_locations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  location_seq INT NOT NULL,
  display_seq INT NOT NULL,
  dest_type ENUM('location','exhibit') NOT NULL DEFAULT 'location',
  location_name VARCHAR(100) NOT NULL,
  kakao_lat DECIMAL(12,8) NULL,
  kakao_lng DECIMAL(12,8) NULL,
  location_desc VARCHAR(50) NULL,
  image_path VARCHAR(255) NULL,
  disabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_project_location_seq (project_id, location_seq),
  UNIQUE KEY uq_project_display_seq_active (project_id, display_seq, disabled),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS project_quizzes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  question VARCHAR(500) NOT NULL,
  choice_type ENUM('single', 'multi') NOT NULL DEFAULT 'single',
  display_seq INT NOT NULL,
  disabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_project (project_id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS project_quiz_choices (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  quiz_id BIGINT NOT NULL,
  choice_text VARCHAR(500) NOT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  display_seq INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_quiz (quiz_id),
  FOREIGN KEY (quiz_id) REFERENCES project_quizzes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_location_qr (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  qr_url VARCHAR(255) NOT NULL,
  qr_image_path VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_location (location_id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (location_id) REFERENCES project_locations(id)
);

CREATE TABLE IF NOT EXISTS visitors (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  phone VARCHAR(20) NOT NULL,
  consent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_project_phone (project_id, phone),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS visitor_visits (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  visitor_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  visited_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_visit (visitor_id, location_id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (visitor_id) REFERENCES visitors(id),
  FOREIGN KEY (location_id) REFERENCES project_locations(id)
);

CREATE TABLE IF NOT EXISTS gift_redemptions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  visitor_id BIGINT NOT NULL,
  redemption_type ENUM('normal','grant') NOT NULL,
  amount BIGINT NOT NULL,
  eligible TINYINT(1) NOT NULL DEFAULT 0,
  redeemed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (visitor_id) REFERENCES visitors(id)
);

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

-- 방문자 웹푸시 구독 정보 (Gift 사용 완료 알림 등)
CREATE TABLE IF NOT EXISTS visitor_push_subscriptions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  visitor_id BIGINT NOT NULL,
  endpoint TEXT NOT NULL,
  endpoint_hash CHAR(64) NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_endpoint_hash (endpoint_hash),
  KEY idx_visitor (visitor_id),
  FOREIGN KEY (visitor_id) REFERENCES visitors(id)
);

CREATE TABLE IF NOT EXISTS merchants (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  merchant_name VARCHAR(512) NOT NULL,
  contact_name VARCHAR(512) NULL,
  contact_phone VARCHAR(128) NULL,
  contact_mobile VARCHAR(128) NULL,
  biz_no VARCHAR(20) NULL,
  biz_cert_path VARCHAR(255) NULL,
  biz_cert_name VARCHAR(255) NULL,
  email VARCHAR(512) NOT NULL,
  bank_name VARCHAR(100) NULL,
  bank_code VARCHAR(10) NULL,
  bank_account VARCHAR(512) NULL,
  bank_copy_path VARCHAR(255) NULL,
  bank_copy_name VARCHAR(255) NULL,
  address_zip VARCHAR(20) NULL,
  address1 VARCHAR(255) NULL,
  address2 VARCHAR(255) NULL,
  password_hash VARCHAR(80) NOT NULL,
  status ENUM('pending','approved','cancelled','terminated','locked') NOT NULL DEFAULT 'pending',
  status_reason VARCHAR(255) NULL,
  last_login_ip VARCHAR(80) NULL,
  last_login_at DATETIME NULL,
  last_logout_at DATETIME NULL,
  password_reset_required TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_merchant_email (email)
);

-- 가맹점이 시작대기/진행중 프로젝트에 직접 지원 → host(주최)가 승인/거절
CREATE TABLE IF NOT EXISTS project_applications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  merchant_id BIGINT NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  decided_at DATETIME NULL,
  decided_reason VARCHAR(255) NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_proj_merchant (project_id, merchant_id),
  KEY idx_project (project_id),
  KEY idx_merchant (merchant_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS host_email_verify_codes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code CHAR(6) NOT NULL,
  used TINYINT(1) NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_hvc_email (email)
);

CREATE TABLE IF NOT EXISTS merchant_email_verify_codes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code CHAR(6) NOT NULL,
  used TINYINT(1) NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_mvc_email (email)
);

CREATE TABLE IF NOT EXISTS login_histories (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_type ENUM('host','supervisor','merchant') NOT NULL,
  user_id VARCHAR(120) NOT NULL,
  login_ip VARCHAR(80) NOT NULL,
  login_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  logout_at DATETIME NULL,
  session_id VARCHAR(200) NOT NULL
);

CREATE TABLE IF NOT EXISTS email_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  template_key VARCHAR(100) NOT NULL,
  to_email VARCHAR(190) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  project_id BIGINT NULL,
  host_id BIGINT NULL,
  status ENUM('sent','failed') NOT NULL,
  error_msg TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 세션 저장소(express-mysql-session). 앱 기동 시 자동 생성되나 참고용으로 포함.
CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  expires INT UNSIGNED NOT NULL,
  data MEDIUMTEXT COLLATE utf8mb4_bin,
  PRIMARY KEY (session_id)
);

SET FOREIGN_KEY_CHECKS = 1;
