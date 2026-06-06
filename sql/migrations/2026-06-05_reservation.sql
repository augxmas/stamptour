-- ============================================================
-- 입장관리 / 사전등록 기능
--   - field_definitions       : 사전등록 폼에 사용할 항목 카탈로그
--   - project_reservation_fields : 프로젝트별 선택 항목 + 필수여부
--   - projects.* (4 cols)     : 사전등록 활성/혜택 정보
--   - reservations            : visitor 사전등록 데이터 (다음 단계)
-- ============================================================

-- 사전등록 폼에 사용할 항목 카탈로그(전 시스템 공통)
CREATE TABLE IF NOT EXISTS field_definitions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  field_key VARCHAR(64) NOT NULL UNIQUE,        -- 식별 키: name, birth_date, mobile, ...
  label_ko VARCHAR(80) NOT NULL,                -- 한국어 라벨
  input_type VARCHAR(20) NOT NULL,              -- text / date / phone / email / address / select / number / time / checkbox
  options_json TEXT NULL,                       -- select 항목 옵션 JSON 배열 (["남","여","기타"])
  validation_regex VARCHAR(255) NULL,           -- 보조 검증용
  placeholder VARCHAR(120) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_system TINYINT(1) NOT NULL DEFAULT 0,      -- 1=시스템 기본(삭제 금지)
  disabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 프로젝트별 사전등록 폼 구성(선택한 항목 + 필수 여부 + 정렬)
CREATE TABLE IF NOT EXISTS project_reservation_fields (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  field_id BIGINT NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_proj_field (project_id, field_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (field_id) REFERENCES field_definitions(id) ON DELETE RESTRICT
);

-- 프로젝트 자체에 예약 활성/혜택 정보 추가
ALTER TABLE projects
  ADD COLUMN reservation_enabled         TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN reservation_benefit_amount  BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN reservation_benefit_label   VARCHAR(120) NULL,
  ADD COLUMN reservation_benefit_max_count INT NOT NULL DEFAULT 0,
  ADD COLUMN reservation_stop_on_limit  TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN reservation_benefit_image_path VARCHAR(255) NULL,
  ADD COLUMN reservation_start_at       DATETIME NULL,
  ADD COLUMN entry_benefit_enabled      TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN entry_benefit_amount       BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN reservation_benefit_message VARCHAR(120) NULL,
  ADD COLUMN entry_benefit_message       VARCHAR(120) NULL,
  ADD COLUMN entry_benefit_label        VARCHAR(120) NULL,
  ADD COLUMN entry_benefit_max_count    INT NOT NULL DEFAULT 0,
  ADD COLUMN entry_stop_on_limit        TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN entry_benefit_image_path   VARCHAR(255) NULL,
  ADD COLUMN field_agent_use            TINYINT(1) NOT NULL DEFAULT 0;
  -- max_count = 0 → 무제한, stop_on_limit = 한도 초과 시 혜택 발급 중지

-- visitor 사전등록 기록 (다음 단계에서 사용; 미리 생성)
CREATE TABLE IF NOT EXISTS reservations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  mode ENUM('reservation','entry') NOT NULL DEFAULT 'reservation',
  email_lower VARCHAR(255) NULL,                -- 1 visitor = 1 신청 (project_id+email 유니크)
  token VARCHAR(64) NOT NULL UNIQUE,            -- QR url 식별자
  pin_hash VARCHAR(80) NULL,                    -- 본인확인용 PIN(선택)
  fields_json TEXT NOT NULL,                    -- 입력값 스냅샷
  amount BIGINT NOT NULL,                       -- 혜택 금액 스냅샷
  status ENUM('pending','activated','used','cancelled','expired') NOT NULL DEFAULT 'pending',
  qr_image_path VARCHAR(255) NULL,
  activated_at DATETIME NULL,                   -- 출입관리 담당자가 활성화한 시각
  activated_by_host_id BIGINT NULL,             -- 활성화 처리한 호스트 id
  used_at DATETIME NULL,
  used_by_merchant_id BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_resv_project_status (project_id, status),
  KEY idx_resv_project_mode (project_id, mode),
  UNIQUE KEY uq_resv_project_email (project_id, email_lower),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ── 기본 사전등록 항목 시드 ──
INSERT INTO field_definitions (field_key, label_ko, input_type, options_json, placeholder, sort_order, is_system) VALUES
  ('name',              '이름',        'text',     NULL, '홍길동', 10, 1),
  ('birth_date',        '생년월일',     'date',     NULL, NULL, 20, 1),
  ('mobile',            '모바일 전화', 'phone',    NULL, '010-1234-5678', 30, 1),
  ('email',             '이메일',       'email',    NULL, 'user@example.com', 40, 1),
  ('address',           '주소',         'address',  NULL, NULL, 50, 1),
  ('gender',            '성별',         'select',   '["남","여","기타"]', NULL, 60, 1),
  ('age_group',         '연령대',       'select',   '["10대","20대","30대","40대","50대","60대","70대 이상"]', NULL, 70, 1),
  ('nationality',       '국적',         'text',     NULL, '대한민국', 80, 1),
  ('emergency_contact', '비상연락처',   'phone',    NULL, '010-1234-5678', 90, 1),
  ('party_size',        '동반 인원',    'number',   NULL, '1', 100, 1),
  ('visit_purpose',     '방문 목적',    'text',     NULL, NULL, 110, 1),
  ('car_number',        '차량번호',     'text',     NULL, '12가3456', 120, 1),
  ('preferred_time',    '방문 희망 시간', 'time',  NULL, NULL, 130, 1),
  ('company',           '소속/회사',    'text',     NULL, NULL, 140, 1),
  ('referral_source',   '알게된 경로',  'select',   '["SNS","지인 소개","뉴스/광고","인터넷 검색","포스터/현수막","라디오/TV","기타"]', NULL, 145, 1),
  ('newsletter_optin',  '소식지 수신 동의', 'select',   '["이메일","문자"]', NULL, 150, 1)
ON DUPLICATE KEY UPDATE label_ko = VALUES(label_ko), input_type = VALUES(input_type),
                        options_json = VALUES(options_json), placeholder = VALUES(placeholder),
                        sort_order = VALUES(sort_order);
