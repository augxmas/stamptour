-- projects 테이블에 Prize 단가/수량 컬럼 추가
-- - prize_amount: Gift와 별도로 운영되는 Prize 단가 (BIGINT, default 0)
-- - prize_qty:    Prize 발급 수량 (INT, default 0)
-- 두 필드 모두 선택 입력이며 예산 계산(budget_amount)에는 포함되지 않는다.

USE tracker;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS prize_amount BIGINT NOT NULL DEFAULT 0 AFTER gift_qty,
  ADD COLUMN IF NOT EXISTS prize_qty INT NOT NULL DEFAULT 0 AFTER prize_amount;
