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
  quiz_bonus_per_correct INT NOT NULL DEFAULT 0,
  stop_on_budget_exceed TINYINT(1) NOT NULL DEFAULT 0,
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
  -- 사전등록(입장관리)
  reservation_enabled TINYINT(1) NOT NULL DEFAULT 0,
  reservation_benefit_amount BIGINT NOT NULL DEFAULT 0,
  reservation_use TINYINT(1) NOT NULL DEFAULT 0,    -- 프로젝트 등록 시 사전등록 옵션 선택 여부 (= 입장관리에서 상세 등록 허용)
  reservation_benefit_label VARCHAR(120) NULL,
  reservation_benefit_message VARCHAR(120) NULL,         -- 완료 페이지에 표시할 행동 안내(예: "QR찍고 상품교환")
  reservation_benefit_max_count INT NOT NULL DEFAULT 0,  -- 0 = 무제한
  reservation_stop_on_limit TINYINT(1) NOT NULL DEFAULT 0,
  reservation_benefit_image_path VARCHAR(255) NULL,
  reservation_start_at DATETIME NULL,            -- 사전등록 접수 시작 시각 (프로젝트 from_date 이전이어야 함)
  -- 현장등록(입장관리)
  entry_benefit_enabled TINYINT(1) NOT NULL DEFAULT 0,
  entry_benefit_amount BIGINT NOT NULL DEFAULT 0,
  entry_use TINYINT(1) NOT NULL DEFAULT 0,    -- 프로젝트 등록 시 현장등록 옵션 선택 여부
  entry_benefit_label VARCHAR(120) NULL,
  entry_benefit_message VARCHAR(120) NULL,
  entry_benefit_max_count INT NOT NULL DEFAULT 0,
  entry_stop_on_limit TINYINT(1) NOT NULL DEFAULT 0,
  entry_benefit_image_path VARCHAR(255) NULL,
  field_agent_use TINYINT(1) NOT NULL DEFAULT 0,   -- 현장요원관리 사용 (프로젝트당 정액)
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
  location_desc VARCHAR(500) NULL,
  image_path VARCHAR(255) NULL,
  quiz_required TINYINT(1) NOT NULL DEFAULT 0,
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
  location_id BIGINT NULL,
  question VARCHAR(500) NOT NULL,
  question_image_path VARCHAR(500) NULL,
  choice_type ENUM('single', 'multi') NOT NULL DEFAULT 'single',
  correct_image_path VARCHAR(500) NULL,
  correct_sound_path VARCHAR(500) NULL,
  wrong_image_path VARCHAR(500) NULL,
  wrong_sound_path VARCHAR(500) NULL,
  display_seq INT NOT NULL,
  disabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_project (project_id),
  KEY idx_location (location_id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (location_id) REFERENCES project_locations(id)
);

CREATE TABLE IF NOT EXISTS visitor_quiz_attempts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  visitor_id BIGINT NOT NULL,
  quiz_id BIGINT NOT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  selected_choice_ids JSON NULL,
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attempt (visitor_id, quiz_id),
  KEY idx_quiz (quiz_id),
  FOREIGN KEY (visitor_id) REFERENCES visitors(id),
  FOREIGN KEY (quiz_id) REFERENCES project_quizzes(id)
);

CREATE TABLE IF NOT EXISTS project_quiz_choices (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  quiz_id BIGINT NOT NULL,
  choice_text VARCHAR(500) NOT NULL,
  choice_image_path VARCHAR(500) NULL,
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
  merchant_id BIGINT NULL,
  redemption_type ENUM('normal','grant') NOT NULL,
  amount BIGINT NOT NULL,
  eligible TINYINT(1) NOT NULL DEFAULT 0,
  redeemed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gr_merchant (merchant_id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (visitor_id) REFERENCES visitors(id),
  FOREIGN KEY (merchant_id) REFERENCES merchants(id)
);

CREATE TABLE IF NOT EXISTS project_gift_tiers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  threshold_pct INT NOT NULL,
  amount BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tier (project_id, threshold_pct),
  KEY idx_project (project_id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS gifts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  visitor_id BIGINT NOT NULL,
  token VARCHAR(64) NOT NULL,
  amount BIGINT NOT NULL,
  threshold_pct INT NOT NULL DEFAULT 100,
  status ENUM('issued','used') NOT NULL DEFAULT 'issued',
  qr_image_path VARCHAR(255) NULL,
  qr_view_pin_hash VARCHAR(255) NULL,
  qr_view_pin_set_at DATETIME NULL,
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME NULL,
  UNIQUE KEY uq_gift_token (token),
  UNIQUE KEY uq_gift_visitor_tier (project_id, visitor_id, threshold_pct),
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
-- 가맹점 → 프로젝트 지원 (지원 유형: visit_quest / reservation / entry)
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
  trigger_type ENUM('auto','manual') NOT NULL DEFAULT 'auto',  -- auto=시스템 자동, manual=관리자가 직접 발송
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

-- ── 입장관리 / 사전등록 ──
CREATE TABLE IF NOT EXISTS field_definitions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  field_key VARCHAR(64) NOT NULL UNIQUE,
  label_ko VARCHAR(80) NOT NULL,
  input_type VARCHAR(20) NOT NULL,
  choice_type ENUM('single','multi') NULL,             -- select 항목의 기본 선택 방식
  choice_type_locked TINYINT(1) NOT NULL DEFAULT 0,    -- 1=프로젝트에서 변경 불가
  options_json TEXT NULL,
  validation_regex VARCHAR(255) NULL,
  placeholder VARCHAR(120) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  disabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_reservation_fields (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  field_id BIGINT NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  choice_type_override ENUM('single','multi') NULL,    -- NULL = field_definitions.choice_type 사용
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_proj_field (project_id, field_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (field_id) REFERENCES field_definitions(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS reservations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  mode ENUM('reservation','entry') NOT NULL DEFAULT 'reservation',
  email_lower VARCHAR(255) NULL,                -- 1 visitor = 1 신청 (project_id+email 유니크)
  token VARCHAR(64) NOT NULL UNIQUE,
  pin_hash VARCHAR(80) NULL,
  fields_json TEXT NOT NULL,
  amount BIGINT NOT NULL,
  status ENUM('pending','activated','used','cancelled','expired') NOT NULL DEFAULT 'pending',
  qr_image_path VARCHAR(255) NULL,
  activated_at DATETIME NULL,
  activated_by_host_id BIGINT NULL,
  used_at DATETIME NULL,
  used_by_merchant_id BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_resv_project_status (project_id, status),
  KEY idx_resv_project_mode (project_id, mode),
  UNIQUE KEY uq_resv_project_email (project_id, email_lower),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

SET FOREIGN_KEY_CHECKS = 1;

-- 기본 사전등록 항목 시드(field_definitions)
INSERT INTO field_definitions (field_key, label_ko, input_type, options_json, placeholder, sort_order, is_system) VALUES
  ('name',              '이름',            'text',     NULL, '홍길동', 10, 1),
  ('birth_date',        '생년월일',         'date',     NULL, NULL, 20, 1),
  ('mobile',            '모바일 전화',     'phone',    NULL, '010-1234-5678', 30, 1),
  ('email',             '이메일',           'email',    NULL, 'user@example.com', 40, 1),
  ('address',           '주소',             'address',  NULL, NULL, 50, 1),
  ('gender',            '성별',             'select',   '["남","여","기타"]', NULL, 60, 1),
  ('age_group',         '연령대',           'select',   '["10대","20대","30대","40대","50대","60대","70대 이상"]', NULL, 70, 1),
  ('nationality',       '국적',             'text',     NULL, '대한민국', 80, 1),
  ('emergency_contact', '비상연락처',       'phone',    NULL, '010-1234-5678', 90, 1),
  ('party_size',        '동반 인원',        'number',   NULL, '1', 100, 1),
  ('visit_purpose',     '방문 목적',        'text',     NULL, NULL, 110, 1),
  ('car_number',        '차량번호',         'text',     NULL, '12가3456', 120, 1),
  ('preferred_time',    '방문 희망 시간',   'time',     NULL, NULL, 130, 1),
  ('company',           '소속/회사',        'text',     NULL, NULL, 140, 1),
  ('referral_source',   '알게된 경로',      'select',   '["SNS","지인 소개","뉴스/광고","인터넷 검색","포스터/현수막","라디오/TV","기타"]', NULL, 145, 1),
  ('newsletter_optin',  '소식지 수신 동의', 'select',   '["이메일","문자"]', NULL, 150, 1)
ON DUPLICATE KEY UPDATE label_ko = VALUES(label_ko), input_type = VALUES(input_type),
                        options_json = VALUES(options_json), placeholder = VALUES(placeholder),
                        sort_order = VALUES(sort_order);

-- ============================================================
--  현장요원관리 (field agents)
-- ============================================================
CREATE TABLE IF NOT EXISTS field_agents (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  name VARCHAR(80) NOT NULL,
  mobile VARCHAR(40) NOT NULL,
  email VARCHAR(190) NOT NULL,
  email_lower VARCHAR(190) NOT NULL,
  address TEXT NOT NULL,
  id_card_image_path VARCHAR(255) NOT NULL,
  bankbook_image_path VARCHAR(255) NOT NULL,
  terms_accepted TINYINT(1) NOT NULL DEFAULT 0,
  privacy_accepted TINYINT(1) NOT NULL DEFAULT 0,
  email_optin TINYINT(1) NOT NULL DEFAULT 0,
  push_optin TINYINT(1) NOT NULL DEFAULT 0,
  qr_token VARCHAR(64) NOT NULL UNIQUE,
  qr_image_path VARCHAR(255) NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agent_project_email (project_id, email_lower),
  KEY idx_agent_project (project_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_agent_attendance (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agent_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL,
  attended_date DATE NOT NULL,
  checked_in_at DATETIME NOT NULL,
  attendance_type ENUM('on_time','late') NOT NULL,
  note VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attendance_day (agent_id, attended_date),
  KEY idx_attendance_proj_date (project_id, attended_date),
  FOREIGN KEY (agent_id) REFERENCES field_agents(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ============================================================
--  배치 작업 이력 + 스케줄러 (procedure + event)
--  - batch_logs: 모든 배치 작업의 실행 결과 저장
--  - sp_update_project_statuses(p_source): 입금확인/시작일/종료일 조건에 따라
--      프로젝트 상태 전이(deposit_confirmed → ready_to_start → started → completed)
--      후 batch_logs에 결과 기록
--  - ev_daily_project_status_update: 매일 00:05 procedure 호출 ('event' source)
--
--  주의: 이벤트 스케줄러는 GLOBAL 설정으로 켜야 동작합니다.
--    root 권한:  SET GLOBAL event_scheduler = ON;
--    영구적용:   my.cnf 의 [mysqld] 섹션에 event_scheduler = ON 추가
-- ============================================================

CREATE TABLE IF NOT EXISTS batch_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_key VARCHAR(64) NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'unknown',
  status ENUM('ok','error') NOT NULL DEFAULT 'ok',
  result_summary VARCHAR(500) NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  error_msg TEXT NULL,
  details TEXT NULL,
  KEY idx_job_started (job_key, started_at),
  KEY idx_started (started_at)
);

-- 랜딩페이지 팝업 알림 (제목/내용/이미지 + 노출기간)
CREATE TABLE IF NOT EXISTS project_notifications (
  id BIGINT NOT NULL AUTO_INCREMENT,
  project_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  image_path VARCHAR(500) DEFAULT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notif_project (project_id),
  CONSTRAINT fk_notif_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 공지사항 (일반 게시 — 제목/내용/중요고정/노출여부)
CREATE TABLE IF NOT EXISTS project_notices (
  id BIGINT NOT NULL AUTO_INCREMENT,
  project_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  pinned TINYINT(1) NOT NULL DEFAULT 0,          -- 상단고정 (정렬과 무관하게 목록 앞단)
  show_as_popup TINYINT(1) NOT NULL DEFAULT 0,   -- 알림으로 보이기 (랜딩 팝업, 작성일~프로젝트 종료)
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notice_project (project_id),
  CONSTRAINT fk_notice_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 사용자별 그리드 컬럼 설정 (표시/숨김 + 순서) — 로그인 사용자(host/supervisor/merchant/partner)별 저장
CREATE TABLE IF NOT EXISTS user_grid_prefs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_type VARCHAR(20) NOT NULL,
  user_id VARCHAR(100) NOT NULL,
  grid_key VARCHAR(191) NOT NULL,
  prefs_json TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_grid (user_type, user_id, grid_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 문의사항 (회원/비회원 작성 + 관리자 답글, 공개/비공개, 수정용 PIN)
CREATE TABLE IF NOT EXISTS project_inquiries (
  id BIGINT NOT NULL AUTO_INCREMENT,
  project_id BIGINT NOT NULL,
  visitor_id BIGINT NULL,                       -- 회원(방문자) 매칭 시 푸시 발송용
  author_email VARCHAR(190) NOT NULL,
  author_name VARCHAR(100) NULL,
  is_member TINYINT(1) NOT NULL DEFAULT 0,      -- 사전/현장등록자 여부
  title VARCHAR(255) NOT NULL,
  content TEXT,
  is_public TINYINT(1) NOT NULL DEFAULT 0,      -- 기본 비공개
  edit_pin CHAR(4) NOT NULL,                    -- 본인 글 수정 확인용 4자리
  admin_reply TEXT NULL,
  replied_at DATETIME NULL,
  status ENUM('open','answered') NOT NULL DEFAULT 'open',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_inq_project (project_id),
  KEY idx_inq_email (author_email),
  CONSTRAINT fk_inq_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 동영상 (프로젝트별 YouTube 등록 — oEmbed 메타데이터 + 게시판)
CREATE TABLE IF NOT EXISTS project_videos (
  id BIGINT NOT NULL AUTO_INCREMENT,
  project_id BIGINT NOT NULL,
  video_id VARCHAR(32) NOT NULL,
  youtube_url VARCHAR(500) NOT NULL,
  title VARCHAR(300) NULL,
  author VARCHAR(200) NULL,
  thumbnail_url VARCHAR(500) NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_video_project (project_id),
  CONSTRAINT fk_video_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER //

DROP PROCEDURE IF EXISTS sp_update_project_statuses //
CREATE PROCEDURE sp_update_project_statuses(IN p_source VARCHAR(20))
BEGIN
  DECLARE v_started DATETIME DEFAULT NOW();
  DECLARE v_n1 INT DEFAULT 0;
  DECLARE v_n2 INT DEFAULT 0;
  DECLARE v_n3 INT DEFAULT 0;

  -- 1) 입금확인됨 + 시작일 도래/경과 → 진행중(started)
  UPDATE projects
  SET status = 'started',
      started_at = COALESCE(started_at, NOW()),
      updated_at = NOW()
  WHERE deposit_confirmed_at IS NOT NULL
    AND status IN ('deposit_confirmed', 'ready_to_start')
    AND from_date <= CURDATE();
  SET v_n1 = ROW_COUNT();

  -- 2) 입금확인됐지만 아직 시작일 전 → 시작대기(ready_to_start)
  UPDATE projects
  SET status = 'ready_to_start', updated_at = NOW()
  WHERE deposit_confirmed_at IS NOT NULL
    AND status = 'deposit_confirmed'
    AND from_date > CURDATE();
  SET v_n2 = ROW_COUNT();

  -- 3) 진행중 + 종료일 경과 → 완료(completed)
  UPDATE projects
  SET status = 'completed', updated_at = NOW()
  WHERE status = 'started' AND to_date < CURDATE();
  SET v_n3 = ROW_COUNT();

  INSERT INTO batch_logs (job_key, source, status, result_summary, started_at, finished_at)
  VALUES (
    'sp_update_project_statuses',
    COALESCE(p_source, 'unknown'),
    'ok',
    CONCAT('started:', v_n1, ' / ready_to_start:', v_n2, ' / completed:', v_n3),
    v_started,
    NOW()
  );
END //

DELIMITER ;

-- 매일 00:05 (서버 로컬 타임존) 상태 전이 procedure 호출
DROP EVENT IF EXISTS ev_daily_project_status_update;
CREATE EVENT ev_daily_project_status_update
ON SCHEDULE EVERY 1 DAY
STARTS TIMESTAMP(CURRENT_DATE + INTERVAL 1 DAY, '00:05:00')
COMMENT '일일 프로젝트 상태 자동 전이'
DO CALL sp_update_project_statuses('event');
