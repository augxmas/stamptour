-- hosts 테이블/이메일 인증 코드 테이블 + 암호화 UDF 정합화 마이그레이션
-- 적용 시점에 hosts 테이블이 비어있다는 전제 (host_name/host_email 컬럼 폭/타입 변경 안전)
--
-- 1) fn_encrypt / fn_decrypt 저장 함수
--    - 코드 (src/utils/encrypt.ts) 가 SELECT/INSERT/WHERE 에서 사용
--    - MariaDB 기본 block_encryption_mode = aes-128-ecb 이므로 동일 평문→동일 암호문 (동등 비교 가능)
--    - VARCHAR 저장 호환을 위해 HEX 인코딩
DROP FUNCTION IF EXISTS fn_encrypt;
DROP FUNCTION IF EXISTS fn_decrypt;

DELIMITER //
CREATE FUNCTION fn_encrypt(p_text TEXT, p_key VARCHAR(255))
RETURNS TEXT
DETERMINISTIC
SQL SECURITY INVOKER
BEGIN
  IF p_text IS NULL THEN RETURN NULL; END IF;
  RETURN HEX(AES_ENCRYPT(p_text, p_key));
END//

CREATE FUNCTION fn_decrypt(p_cipher TEXT, p_key VARCHAR(255))
RETURNS TEXT
DETERMINISTIC
SQL SECURITY INVOKER
BEGIN
  IF p_cipher IS NULL THEN RETURN NULL; END IF;
  RETURN CONVERT(AES_DECRYPT(UNHEX(p_cipher), p_key) USING utf8mb4);
END//
DELIMITER ;

-- 2) hosts 테이블에 누락 컬럼 추가 + 암호화 컬럼 폭 확장
--    merchants 테이블 컨벤션을 따른다.
ALTER TABLE hosts
  MODIFY COLUMN host_name  VARCHAR(512) NOT NULL,
  MODIFY COLUMN host_email VARCHAR(512) NOT NULL;

ALTER TABLE hosts
  ADD COLUMN mobile_phone VARCHAR(255) NULL          AFTER host_email,
  ADD COLUMN phone        VARCHAR(255) NULL          AFTER mobile_phone,
  ADD COLUMN organization_name VARCHAR(255) NULL     AFTER phone,
  ADD COLUMN biz_no          VARCHAR(20)  NULL       AFTER organization_name,
  ADD COLUMN biz_cert_path   VARCHAR(255) NULL       AFTER biz_no,
  ADD COLUMN biz_cert_name   VARCHAR(255) NULL       AFTER biz_cert_path,
  ADD COLUMN address_zip     VARCHAR(20)  NULL       AFTER biz_cert_name,
  ADD COLUMN address1        VARCHAR(255) NULL       AFTER address_zip,
  ADD COLUMN address2        VARCHAR(255) NULL       AFTER address1,
  ADD COLUMN password_reset_required TINYINT(1) NOT NULL DEFAULT 0 AFTER last_logout_at;

-- 3) host 회원가입 이메일 인증 코드 테이블
CREATE TABLE IF NOT EXISTS host_email_verify_codes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code  CHAR(6) NOT NULL,
  used  TINYINT(1) NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_hvc_email (email)
);
