ALTER TABLE hosts
  ADD COLUMN host_serial VARCHAR(13) NULL AFTER id;

SET @host_serial_date := '';
SET @host_serial_seq := 0;

UPDATE hosts h
JOIN (
  SELECT ordered.id,
         ordered.ymd,
         @host_serial_seq := IF(@host_serial_date = ordered.ymd, @host_serial_seq + 1, 1) AS seq_no,
         @host_serial_date := ordered.ymd AS _set_date
    FROM (
      SELECT id, DATE_FORMAT(COALESCE(created_at, NOW()), '%Y%m%d') AS ymd
        FROM hosts
       WHERE host_serial IS NULL
       ORDER BY COALESCE(created_at, NOW()), id
    ) ordered
) s ON s.id = h.id
SET h.host_serial = CONCAT(s.ymd, '_H', LPAD(s.seq_no, 3, '0'))
WHERE h.host_serial IS NULL;

ALTER TABLE hosts
  MODIFY host_serial VARCHAR(13) NOT NULL,
  ADD UNIQUE KEY uq_host_serial (host_serial);
