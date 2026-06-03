-- ============================================================
--  스케줄러: 프로젝트 상태 일일 자동 전이 + 배치 실행 이력
--  - batch_logs: 모든 배치 작업 실행 결과 저장 테이블
--  - sp_update_project_statuses(p_source): 상태 전이 + 결과를 batch_logs에 기록
--  - ev_daily_project_status_update: 매일 00:05 sp 호출 ('event' source)
--
--  적용:
--    1) tracker 사용자로: 테이블 + 프로시저 + 이벤트 생성
--       mysql -u tracker -p tracker < sql/scheduler.sql
--    2) root 사용자로: event_scheduler 전역 활성화 (1회 + my.cnf 영구화 권장)
--       mysql -u root -p -e "SET GLOBAL event_scheduler = ON;"
--       [my.cnf]
--       event_scheduler = ON
-- ============================================================

USE tracker;

-- 배치 작업 실행 이력
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

-- 기존 테이블에 details 컬럼 추가 (MariaDB 10.0.2+ IF NOT EXISTS 지원)
ALTER TABLE batch_logs ADD COLUMN IF NOT EXISTS details TEXT NULL AFTER error_msg;

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

-- 매일 00:05 (서버 로컬 타임존)에 상태 전이 procedure 호출
DROP EVENT IF EXISTS ev_daily_project_status_update;
CREATE EVENT ev_daily_project_status_update
ON SCHEDULE EVERY 1 DAY
STARTS TIMESTAMP(CURRENT_DATE + INTERVAL 1 DAY, '00:05:00')
COMMENT '일일 프로젝트 상태 자동 전이'
DO CALL sp_update_project_statuses('event');
