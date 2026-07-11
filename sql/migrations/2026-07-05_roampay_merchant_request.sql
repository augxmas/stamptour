ALTER TABLE merchants
  ADD COLUMN roampay_request_status ENUM('none','approval_requested','request_received','request_unavailable') NOT NULL DEFAULT 'none' AFTER roampay_status_reason,
  ADD COLUMN roampay_requested_at DATETIME NULL AFTER roampay_request_status,
  ADD COLUMN roampay_request_attempts INT NOT NULL DEFAULT 0 AFTER roampay_requested_at,
  ADD COLUMN roampay_response_status_code INT NULL AFTER roampay_request_attempts,
  ADD COLUMN roampay_response_body LONGTEXT NULL AFTER roampay_response_status_code,
  ADD COLUMN roampay_response_at DATETIME NULL AFTER roampay_response_body,
  ADD KEY idx_merchants_roampay_request_status (roampay_request_status);
