-- =================================================================
-- 마이그레이션: 2026-06-05
-- 내용: 퀴즈 기능 확장, 정산 컬럼 추가, 방문자 퀴즈 응시 기록,
--       Gift QR 비밀번호 필드, 발급 Gift 금액 일괄 보정
-- 적용 대상: 기존 인스턴스 (신규 인스턴스는 sql/schema.sql 만으로 충분)
-- 주의: ALTER 문은 idempotent 하지 않으므로 한 번만 실행해야 합니다.
-- =================================================================

USE tracker;

-- 1) 프로젝트 — 퀴즈 정답 보너스(단가) 컬럼 추가
ALTER TABLE projects
  ADD COLUMN quiz_bonus_per_correct INT NOT NULL DEFAULT 0 AFTER prize_qty;

-- 2) 목적지 — 퀴즈 필수 응시 여부 (Phase 6 예정 토글)
ALTER TABLE project_locations
  ADD COLUMN quiz_required TINYINT(1) NOT NULL DEFAULT 0 AFTER image_path;

-- 3) 퀴즈 확장 — 연계 목적지 / 질문 이미지 / 정답·오답 미디어
ALTER TABLE project_quizzes
  ADD COLUMN location_id          BIGINT       NULL AFTER project_id,
  ADD COLUMN question_image_path  VARCHAR(500) NULL AFTER question,
  ADD COLUMN correct_image_path   VARCHAR(500) NULL AFTER choice_type,
  ADD COLUMN correct_sound_path   VARCHAR(500) NULL AFTER correct_image_path,
  ADD COLUMN wrong_image_path     VARCHAR(500) NULL AFTER correct_sound_path,
  ADD COLUMN wrong_sound_path     VARCHAR(500) NULL AFTER wrong_image_path,
  ADD KEY idx_location (location_id),
  ADD CONSTRAINT fk_quiz_location FOREIGN KEY (location_id) REFERENCES project_locations(id);

-- 4) 퀴즈 답항 — 이미지 컬럼
ALTER TABLE project_quiz_choices
  ADD COLUMN choice_image_path VARCHAR(500) NULL AFTER choice_text;

-- 5) Gift QR 비밀번호 (Phase 5 예정 — 컬럼만 미리 준비)
ALTER TABLE gifts
  ADD COLUMN qr_view_pin_hash   VARCHAR(255) NULL AFTER qr_image_path,
  ADD COLUMN qr_view_pin_set_at DATETIME     NULL AFTER qr_view_pin_hash;

-- 6) 방문자 퀴즈 응시 기록
CREATE TABLE IF NOT EXISTS visitor_quiz_attempts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  visitor_id BIGINT NOT NULL,
  quiz_id    BIGINT NOT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  selected_choice_ids JSON NULL,
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attempt (visitor_id, quiz_id),
  KEY idx_quiz (quiz_id),
  FOREIGN KEY (visitor_id) REFERENCES visitors(id),
  FOREIGN KEY (quiz_id)    REFERENCES project_quizzes(id)
);

-- 7) 발급된(미사용) Gift 금액 보정
--    이전 코드는 base(gift_amount)만 amount 로 기록했음.
--    정답 보너스(prize_amount × 정답수) 반영분으로 일괄 UPDATE.
UPDATE gifts g
  JOIN projects p ON p.id = g.project_id
   SET g.amount = p.gift_amount + p.prize_amount * (
         SELECT COUNT(*) FROM visitor_quiz_attempts vqa
           JOIN project_quizzes q ON q.id = vqa.quiz_id
          WHERE vqa.visitor_id = g.visitor_id
            AND vqa.is_correct = 1
            AND q.project_id  = g.project_id
            AND q.disabled    = 0
       )
 WHERE g.status = 'issued';
