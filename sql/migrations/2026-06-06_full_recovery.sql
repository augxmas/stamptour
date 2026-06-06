-- ============================================================
--  모노라마 트래커 — 형상관리 복구 SQL (2026-06-06)
--
--  본 파일 1개로 마지막 형상관리(a7793d9) 이후 추가/변경된
--  모든 DB 스키마·객체·시드 데이터를 복구합니다.
--
--  실행:  mysql -u tracker -p tracker < sql/migrations/2026-06-06_full_recovery.sql
--  사전조건: schema.sql 의 기본 테이블(projects, hosts, merchants 등)이 이미 존재
--
--  포함 내역:
--    1) 사전등록/현장등록 관련 (field_definitions, project_reservation_fields, reservations)
--    2) 현장요원관리 (field_agents, field_agent_attendance)
--    3) projects 컬럼 추가 (reservation/entry/field_agent/use_allowed)
--    4) project_applications.support_type + 구조 재정의
--    5) email_logs.trigger_type
--    6) field_definitions 시드 (사전등록 폼 항목 카탈로그)
-- ============================================================

USE tracker;
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1) projects 컬럼 추가 (입장관리·현장요원·옵션 메시지)
--    IF NOT EXISTS 가 ALTER 에는 없으므로 동적 SQL 패턴 사용
-- ============================================================
DELIMITER $$
DROP PROCEDURE IF EXISTS _sp_add_col_if_missing$$
CREATE PROCEDURE _sp_add_col_if_missing(
  IN p_table VARCHAR(64),
  IN p_col   VARCHAR(64),
  IN p_def   VARCHAR(500)
)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_col)
  THEN
    SET @s = CONCAT('ALTER TABLE ', p_table, ' ADD COLUMN ', p_col, ' ', p_def);
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END$$
DELIMITER ;

-- projects 신규 컬럼들
CALL _sp_add_col_if_missing('projects', 'reservation_enabled',          "TINYINT(1) NOT NULL DEFAULT 0");
CALL _sp_add_col_if_missing('projects', 'reservation_use',              "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '프로젝트 등록 시 옵션 선택 여부'");
CALL _sp_add_col_if_missing('projects', 'reservation_benefit_amount',   "BIGINT NOT NULL DEFAULT 0");
CALL _sp_add_col_if_missing('projects', 'reservation_benefit_label',    "VARCHAR(120) NULL");
CALL _sp_add_col_if_missing('projects', 'reservation_benefit_message',  "VARCHAR(120) NULL");
CALL _sp_add_col_if_missing('projects', 'reservation_benefit_max_count',"INT NOT NULL DEFAULT 0");
CALL _sp_add_col_if_missing('projects', 'reservation_stop_on_limit',    "TINYINT(1) NOT NULL DEFAULT 0");
CALL _sp_add_col_if_missing('projects', 'reservation_benefit_image_path',"VARCHAR(255) NULL");
CALL _sp_add_col_if_missing('projects', 'reservation_start_at',         "DATETIME NULL");
CALL _sp_add_col_if_missing('projects', 'entry_benefit_enabled',        "TINYINT(1) NOT NULL DEFAULT 0");
CALL _sp_add_col_if_missing('projects', 'entry_use',                    "TINYINT(1) NOT NULL DEFAULT 0");
CALL _sp_add_col_if_missing('projects', 'entry_benefit_amount',         "BIGINT NOT NULL DEFAULT 0");
CALL _sp_add_col_if_missing('projects', 'entry_benefit_label',          "VARCHAR(120) NULL");
CALL _sp_add_col_if_missing('projects', 'entry_benefit_message',        "VARCHAR(120) NULL");
CALL _sp_add_col_if_missing('projects', 'entry_benefit_max_count',      "INT NOT NULL DEFAULT 0");
CALL _sp_add_col_if_missing('projects', 'entry_stop_on_limit',          "TINYINT(1) NOT NULL DEFAULT 0");
CALL _sp_add_col_if_missing('projects', 'entry_benefit_image_path',     "VARCHAR(255) NULL");
CALL _sp_add_col_if_missing('projects', 'field_agent_use',              "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '현장요원관리 옵션 (정액)'");

-- ============================================================
-- 2) field_definitions — 사전등록 폼 항목 카탈로그
-- ============================================================
CREATE TABLE IF NOT EXISTS field_definitions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  field_key VARCHAR(64) NOT NULL UNIQUE,
  label_ko VARCHAR(80) NOT NULL,
  input_type VARCHAR(20) NOT NULL,
  choice_type ENUM('single','multi') NULL,
  choice_type_locked TINYINT(1) NOT NULL DEFAULT 0,
  options_json TEXT NULL,
  validation_regex VARCHAR(255) NULL,
  placeholder VARCHAR(120) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  disabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- field_definitions choice_type 컬럼 후행 보장
CALL _sp_add_col_if_missing('field_definitions', 'choice_type',        "ENUM('single','multi') NULL");
CALL _sp_add_col_if_missing('field_definitions', 'choice_type_locked', "TINYINT(1) NOT NULL DEFAULT 0");

-- ============================================================
-- 3) project_reservation_fields — 프로젝트별 폼 항목 선택 + 필수 여부
-- ============================================================
CREATE TABLE IF NOT EXISTS project_reservation_fields (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  field_id BIGINT NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  choice_type_override ENUM('single','multi') NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_proj_field (project_id, field_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (field_id) REFERENCES field_definitions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CALL _sp_add_col_if_missing('project_reservation_fields', 'choice_type_override', "ENUM('single','multi') NULL");

-- ============================================================
-- 4) reservations — visitor 사전등록 / 현장등록 데이터
-- ============================================================
CREATE TABLE IF NOT EXISTS reservations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  mode ENUM('reservation','entry') NOT NULL DEFAULT 'reservation',
  email_lower VARCHAR(255) NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5) field_agents — 현장요원
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6) field_agent_attendance — 현장요원 출근/지각 기록
-- ============================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7) project_applications — 가맹점 지원 (유형별 별도 row 구조)
-- ============================================================
CALL _sp_add_col_if_missing('project_applications', 'support_types', "JSON NULL COMMENT '구버전: 배열 보관 호환용'");
CALL _sp_add_col_if_missing('project_applications', 'support_type',  "ENUM('quest','reservation','entry') NULL");

-- UNIQUE 키 재정의 (전 행 단일 → 유형별)
SET @has_old_uniq := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='project_applications' AND INDEX_NAME='uniq_proj_merchant');
SET @s := IF(@has_old_uniq > 0, 'ALTER TABLE project_applications DROP INDEX uniq_proj_merchant', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @has_new_uniq := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='project_applications' AND INDEX_NAME='uniq_proj_merch_type');
SET @s := IF(@has_new_uniq = 0,
  'ALTER TABLE project_applications ADD UNIQUE KEY uniq_proj_merch_type (project_id, merchant_id, support_type)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 기존 NULL support_type 데이터는 'quest' 로 기본 채움 후 NOT NULL 적용
UPDATE project_applications SET support_type='quest' WHERE support_type IS NULL;
ALTER TABLE project_applications MODIFY support_type ENUM('quest','reservation','entry') NOT NULL DEFAULT 'quest';

-- ============================================================
-- 8) email_logs — 시스템 자동/수동 발송 구분
-- ============================================================
CALL _sp_add_col_if_missing('email_logs', 'trigger_type', "ENUM('auto','manual') NOT NULL DEFAULT 'auto'");

-- ============================================================
-- 9) field_definitions — 사전등록 폼 항목 시드 (16종)
-- ============================================================
INSERT INTO field_definitions (field_key, label_ko, input_type, choice_type, choice_type_locked, options_json, placeholder, sort_order, is_system) VALUES
  ('name',              '이름',          'text',     NULL,    0, NULL, '홍길동',          10, 1),
  ('birth_date',        '생년월일',       'date',     NULL,    0, NULL, NULL,             20, 1),
  ('mobile',            '모바일 전화',    'phone',    NULL,    0, NULL, '010-1234-5678',  30, 1),
  ('email',             '이메일',         'email',    NULL,    0, NULL, 'user@example.com', 40, 1),
  ('address',           '주소',           'address',  NULL,    0, NULL, NULL,             50, 1),
  ('gender',            '성별',           'select',   'single',1, '["남","여","기타"]', NULL, 60, 1),
  ('age_group',         '연령대',         'select',   'single',1, '["10대","20대","30대","40대","50대","60대","70대 이상"]', NULL, 70, 1),
  ('nationality',       '국적',           'text',     NULL,    0, NULL, '대한민국',       80, 1),
  ('emergency_contact', '비상연락처',     'phone',    NULL,    0, NULL, '010-1234-5678',  90, 1),
  ('party_size',        '동반 인원',      'number',   NULL,    0, NULL, '1',             100, 1),
  ('visit_purpose',     '방문 목적',      'text',     NULL,    0, NULL, NULL,            110, 1),
  ('car_number',        '차량번호',       'text',     NULL,    0, NULL, '12가3456',     120, 1),
  ('preferred_time',    '방문 희망 시간', 'time',     NULL,    0, NULL, NULL,            130, 1),
  ('company',           '소속/회사',      'text',     NULL,    0, NULL, NULL,            140, 1),
  ('referral_source',   '알게된 경로',    'select',   'multi', 0, '["SNS","지인 소개","뉴스/광고","인터넷 검색","포스터/현수막","라디오/TV","기타"]', NULL, 145, 1),
  ('newsletter_optin',  '소식지 수신 동의','select',  'multi', 0, '["이메일","문자"]', NULL, 150, 1)
ON DUPLICATE KEY UPDATE
  label_ko = VALUES(label_ko),
  input_type = VALUES(input_type),
  choice_type = VALUES(choice_type),
  choice_type_locked = VALUES(choice_type_locked),
  options_json = VALUES(options_json),
  placeholder = VALUES(placeholder),
  sort_order = VALUES(sort_order);

-- ============================================================
-- 정리
-- ============================================================
DROP PROCEDURE IF EXISTS _sp_add_col_if_missing;
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 검증 쿼리 (실행 후 컬럼/객체 존재 확인용 — 참고)
-- ============================================================
-- SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
--   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('projects','field_agents','reservations','project_applications','email_logs','field_definitions')
--   ORDER BY TABLE_NAME, ORDINAL_POSITION;
