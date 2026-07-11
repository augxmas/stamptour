ALTER TABLE merchants
  ADD COLUMN merchant_serial VARCHAR(13) NULL AFTER id,
  ADD COLUMN system_approved_at DATETIME NULL AFTER status_reason,
  ADD COLUMN roampay_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' AFTER system_approved_at,
  ADD COLUMN roampay_approved_at DATETIME NULL AFTER roampay_status,
  ADD COLUMN roampay_status_reason VARCHAR(255) NULL AFTER roampay_approved_at;

SET @merchant_serial_date := '';
SET @merchant_serial_seq := 0;

UPDATE merchants m
JOIN (
  SELECT
    ordered.id,
    ordered.ymd,
    @merchant_serial_seq := IF(@merchant_serial_date = ordered.ymd, @merchant_serial_seq + 1, 1) AS seq_no,
    @merchant_serial_date := ordered.ymd AS _set_date
  FROM (
    SELECT id, DATE_FORMAT(created_at, '%Y%m%d') AS ymd
    FROM merchants
    ORDER BY created_at ASC, id ASC
  ) ordered
) s ON s.id = m.id
SET m.merchant_serial = CONCAT(s.ymd, '_', LPAD(s.seq_no, 4, '0'))
WHERE m.merchant_serial IS NULL;

UPDATE merchants
SET system_approved_at = COALESCE(system_approved_at, updated_at)
WHERE status = 'approved';

ALTER TABLE merchants
  MODIFY merchant_serial VARCHAR(13) NOT NULL,
  ADD UNIQUE KEY uq_merchant_serial (merchant_serial),
  ADD KEY idx_merchants_roampay_status (roampay_status);
