-- ============================================================
-- ROUTINES (functions / procedures / events) — schema.sql 기반
-- ============================================================
USE tracker;

DROP FUNCTION IF EXISTS fn_encrypt;
DELIMITER //
CREATE FUNCTION fn_encrypt(p_value TEXT, p_key VARCHAR(64))
  RETURNS VARCHAR(512) CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci
  NO SQL DETERMINISTIC
  RETURN HEX(AES_ENCRYPT(p_value, p_key)) //
DELIMITER ;

DROP FUNCTION IF EXISTS fn_decrypt;
DELIMITER //
CREATE FUNCTION fn_decrypt(p_value VARCHAR(512), p_key VARCHAR(64))
  RETURNS TEXT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci
  NO SQL DETERMINISTIC
  RETURN CAST(AES_DECRYPT(UNHEX(p_value), p_key) AS CHAR) //
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_update_project_statuses;
DELIMITER //
CREATE PROCEDURE sp_update_project_statuses(IN p_source VARCHAR(20))
BEGIN
  DECLARE v_started DATETIME DEFAULT NOW();
  DECLARE v_n1 INT DEFAULT 0;
  DECLARE v_n2 INT DEFAULT 0;
  DECLARE v_n3 INT DEFAULT 0;

  UPDATE projects
  SET status = 'started', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
  WHERE deposit_confirmed_at IS NOT NULL
    AND status IN ('deposit_confirmed', 'ready_to_start')
    AND from_date <= CURDATE();
  SET v_n1 = ROW_COUNT();

  UPDATE projects
  SET status = 'ready_to_start', updated_at = NOW()
  WHERE deposit_confirmed_at IS NOT NULL
    AND status = 'deposit_confirmed'
    AND from_date > CURDATE();
  SET v_n2 = ROW_COUNT();

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
    v_started, NOW()
  );
END //
DELIMITER ;

DROP EVENT IF EXISTS ev_daily_project_status_update;
CREATE EVENT ev_daily_project_status_update
ON SCHEDULE EVERY 1 DAY
STARTS TIMESTAMP(CURRENT_DATE + INTERVAL 1 DAY, '00:05:00')
COMMENT '일일 프로젝트 상태 자동 전이'
DO CALL sp_update_project_statuses('event');

-- ============================================================
-- SCHEMA (테이블 구조 — 데이터 제외)
-- ============================================================
-- MySQL dump 10.13  Distrib 8.0.44, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: tracker
-- ------------------------------------------------------
-- Server version	8.0.44

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `tracker`
--

/*!40000 DROP DATABASE IF EXISTS `tracker`*/;

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `tracker` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;

USE `tracker`;

--
-- Table structure for table `batch_logs`
--

DROP TABLE IF EXISTS `batch_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `batch_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `job_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown',
  `status` enum('ok','error') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ok',
  `result_summary` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at` datetime DEFAULT NULL,
  `error_msg` text COLLATE utf8mb4_unicode_ci,
  `details` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `idx_job_started` (`job_key`,`started_at`),
  KEY `idx_started` (`started_at`)
) ENGINE=InnoDB AUTO_INCREMENT=875 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `email_logs`
--

DROP TABLE IF EXISTS `email_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `template_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `to_email` varchar(190) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `project_id` bigint DEFAULT NULL,
  `host_id` bigint DEFAULT NULL,
  `status` enum('sent','failed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `trigger_type` enum('auto','manual') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'auto',
  `error_msg` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=131 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `email_templates`
--

DROP TABLE IF EXISTS `email_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_templates` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `template_key` varchar(64) NOT NULL,
  `description` varchar(255) NOT NULL DEFAULT '',
  `subject` varchar(255) NOT NULL,
  `body_html` mediumtext NOT NULL,
  `variables` json DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `template_key` (`template_key`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `field_agent_attendance`
--

DROP TABLE IF EXISTS `field_agent_attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `field_agent_attendance` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `agent_id` bigint NOT NULL,
  `project_id` bigint NOT NULL,
  `attended_date` date NOT NULL,
  `checked_in_at` datetime NOT NULL,
  `attendance_type` enum('on_time','late') COLLATE utf8mb4_unicode_ci NOT NULL,
  `note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attendance_day` (`agent_id`,`attended_date`),
  KEY `idx_attendance_proj_date` (`project_id`,`attended_date`),
  CONSTRAINT `field_agent_attendance_ibfk_1` FOREIGN KEY (`agent_id`) REFERENCES `field_agents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `field_agent_attendance_ibfk_2` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `field_agents`
--

DROP TABLE IF EXISTS `field_agents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `field_agents` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `name` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mobile` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(190) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email_lower` varchar(190) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `id_card_image_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bankbook_image_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `terms_accepted` tinyint(1) NOT NULL DEFAULT '0',
  `privacy_accepted` tinyint(1) NOT NULL DEFAULT '0',
  `email_optin` tinyint(1) NOT NULL DEFAULT '0',
  `push_optin` tinyint(1) NOT NULL DEFAULT '0',
  `qr_token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `qr_image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `qr_token` (`qr_token`),
  UNIQUE KEY `uq_agent_project_email` (`project_id`,`email_lower`),
  KEY `idx_agent_project` (`project_id`),
  CONSTRAINT `field_agents_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `field_definitions`
--

DROP TABLE IF EXISTS `field_definitions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `field_definitions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `field_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label_ko` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `input_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `choice_type` enum('single','multi') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `choice_type_locked` tinyint(1) NOT NULL DEFAULT '0',
  `options_json` text COLLATE utf8mb4_unicode_ci,
  `validation_regex` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `placeholder` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_system` tinyint(1) NOT NULL DEFAULT '0',
  `disabled` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `field_key` (`field_key`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `gift_redemptions`
--

DROP TABLE IF EXISTS `gift_redemptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `gift_redemptions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `visitor_id` bigint NOT NULL,
  `merchant_id` bigint DEFAULT NULL,
  `redemption_type` enum('normal','grant') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` bigint NOT NULL,
  `eligible` tinyint(1) NOT NULL DEFAULT '0',
  `redeemed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `project_id` (`project_id`),
  KEY `visitor_id` (`visitor_id`),
  KEY `idx_gr_merchant` (`merchant_id`),
  CONSTRAINT `fk_gr_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`),
  CONSTRAINT `gift_redemptions_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
  CONSTRAINT `gift_redemptions_ibfk_2` FOREIGN KEY (`visitor_id`) REFERENCES `visitors` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `gifts`
--

DROP TABLE IF EXISTS `gifts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `gifts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `visitor_id` bigint NOT NULL,
  `token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` bigint NOT NULL,
  `threshold_pct` int NOT NULL DEFAULT '100',
  `status` enum('issued','used') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'issued',
  `qr_image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qr_view_pin_hash` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qr_view_pin_set_at` datetime DEFAULT NULL,
  `issued_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `used_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gift_token` (`token`),
  UNIQUE KEY `uq_gift_visitor_tier` (`project_id`,`visitor_id`,`threshold_pct`),
  KEY `visitor_id` (`visitor_id`),
  CONSTRAINT `gifts_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
  CONSTRAINT `gifts_ibfk_2` FOREIGN KEY (`visitor_id`) REFERENCES `visitors` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `host_email_verify_codes`
--

DROP TABLE IF EXISTS `host_email_verify_codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `host_email_verify_codes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` char(6) COLLATE utf8mb4_unicode_ci NOT NULL,
  `used` tinyint(1) NOT NULL DEFAULT '0',
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_hvc_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=40 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `host_project_pin_codes`
--

DROP TABLE IF EXISTS `host_project_pin_codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `host_project_pin_codes` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `host_id` bigint NOT NULL,
  `pin_code` char(6) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `used` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `host_id` (`host_id`),
  CONSTRAINT `host_project_pin_codes_ibfk_1` FOREIGN KEY (`host_id`) REFERENCES `hosts` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `hosts`
--

DROP TABLE IF EXISTS `hosts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `hosts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `host_name` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `host_email` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mobile_phone` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `organization_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `biz_no` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `biz_cert_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `biz_cert_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_zip` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_hash` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pending','approved','cancelled','terminated','locked') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `status_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `project_pin_fail_count` int NOT NULL DEFAULT '0',
  `project_locked` tinyint(1) NOT NULL DEFAULT '0',
  `last_login_ip` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `last_logout_at` datetime DEFAULT NULL,
  `password_reset_required` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `host_email` (`host_email`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `login_histories`
--

DROP TABLE IF EXISTS `login_histories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `login_histories` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_type` enum('host','supervisor','merchant') COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `login_ip` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `login_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `logout_at` datetime DEFAULT NULL,
  `session_id` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=316 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merchant_email_verify_codes`
--

DROP TABLE IF EXISTS `merchant_email_verify_codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merchant_email_verify_codes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` char(6) COLLATE utf8mb4_unicode_ci NOT NULL,
  `used` tinyint(1) NOT NULL DEFAULT '0',
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mvc_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merchants`
--

DROP TABLE IF EXISTS `merchants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merchants` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `merchant_name` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_name` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_phone` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_mobile` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `biz_no` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `biz_cert_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `biz_cert_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bank_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_account` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_copy_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_copy_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_zip` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_hash` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pending','approved','cancelled','terminated','locked') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `status_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_login_ip` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `last_logout_at` datetime DEFAULT NULL,
  `password_reset_required` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_merchant_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `partner_accounts`
--

DROP TABLE IF EXISTS `partner_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `partner_accounts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_applications`
--

DROP TABLE IF EXISTS `project_applications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_applications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `merchant_id` bigint NOT NULL,
  `status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `support_type` enum('reservation','entry','tour','quiz','survey_reward') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'tour',
  `support_types` json DEFAULT NULL COMMENT '吏?썝 ?좏삎 諛곗뿴: ["quest","reservation","entry"]',
  `decided_at` datetime DEFAULT NULL,
  `decided_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `applied_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_proj_merch_type` (`project_id`,`merchant_id`,`support_type`),
  KEY `idx_project` (`project_id`),
  KEY `idx_merchant` (`merchant_id`),
  CONSTRAINT `project_applications_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_applications_ibfk_2` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_daily_sequences`
--

DROP TABLE IF EXISTS `project_daily_sequences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_daily_sequences` (
  `seq_date` char(8) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_no` int NOT NULL,
  PRIMARY KEY (`seq_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_gift_tiers`
--

DROP TABLE IF EXISTS `project_gift_tiers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_gift_tiers` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `threshold_pct` int NOT NULL,
  `amount` bigint NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tier` (`project_id`,`threshold_pct`),
  KEY `idx_project` (`project_id`),
  CONSTRAINT `project_gift_tiers_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_inquiries`
--

DROP TABLE IF EXISTS `project_inquiries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_inquiries` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `visitor_id` bigint DEFAULT NULL,
  `author_email` varchar(190) COLLATE utf8mb4_unicode_ci NOT NULL,
  `author_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_member` tinyint(1) NOT NULL DEFAULT '0',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci,
  `is_public` tinyint(1) NOT NULL DEFAULT '0',
  `edit_pin` char(4) COLLATE utf8mb4_unicode_ci NOT NULL,
  `admin_reply` text COLLATE utf8mb4_unicode_ci,
  `replied_at` datetime DEFAULT NULL,
  `status` enum('open','answered') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_inq_project` (`project_id`),
  KEY `idx_inq_email` (`author_email`),
  CONSTRAINT `fk_inq_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_location_qr`
--

DROP TABLE IF EXISTS `project_location_qr`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_location_qr` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `location_id` bigint NOT NULL,
  `qr_url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `qr_image_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_location` (`location_id`),
  KEY `project_id` (`project_id`),
  CONSTRAINT `project_location_qr_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
  CONSTRAINT `project_location_qr_ibfk_2` FOREIGN KEY (`location_id`) REFERENCES `project_locations` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=34 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_locations`
--

DROP TABLE IF EXISTS `project_locations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_locations` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `location_seq` int NOT NULL,
  `display_seq` int NOT NULL,
  `dest_type` enum('location','exhibit') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'location',
  `location_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kakao_lat` decimal(12,8) DEFAULT NULL,
  `kakao_lng` decimal(12,8) DEFAULT NULL,
  `map_provider` enum('kakao','google') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location_desc` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quiz_required` tinyint(1) NOT NULL DEFAULT '0',
  `disabled` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_location_seq` (`project_id`,`location_seq`),
  UNIQUE KEY `uq_project_display_seq_active` (`project_id`,`display_seq`,`disabled`),
  CONSTRAINT `project_locations_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_notices`
--

DROP TABLE IF EXISTS `project_notices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_notices` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci,
  `pinned` tinyint(1) NOT NULL DEFAULT '0',
  `show_as_popup` tinyint(1) NOT NULL DEFAULT '0',
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notice_project` (`project_id`),
  CONSTRAINT `fk_notice_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_notifications`
--

DROP TABLE IF EXISTS `project_notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_notifications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci,
  `image_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `from_date` date NOT NULL,
  `to_date` date NOT NULL,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notif_project` (`project_id`),
  CONSTRAINT `fk_notif_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_partner_form_config`
--

DROP TABLE IF EXISTS `project_partner_form_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_partner_form_config` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `use_company_name_ko` tinyint(1) NOT NULL DEFAULT '1',
  `use_company_name_en` tinyint(1) NOT NULL DEFAULT '1',
  `use_ceo_name` tinyint(1) NOT NULL DEFAULT '1',
  `use_ceo_email` tinyint(1) NOT NULL DEFAULT '1',
  `use_ceo_mobile` tinyint(1) NOT NULL DEFAULT '1',
  `use_biz_cert_file` tinyint(1) NOT NULL DEFAULT '1',
  `use_company_phone` tinyint(1) NOT NULL DEFAULT '1',
  `use_company_fax` tinyint(1) NOT NULL DEFAULT '1',
  `use_company_address` tinyint(1) NOT NULL DEFAULT '1',
  `use_company_homepage` tinyint(1) NOT NULL DEFAULT '1',
  `use_company_logo` tinyint(1) NOT NULL DEFAULT '1',
  `use_company_fields` tinyint(1) NOT NULL DEFAULT '1',
  `use_contact_name` tinyint(1) NOT NULL DEFAULT '1',
  `use_contact_dept` tinyint(1) NOT NULL DEFAULT '1',
  `use_contact_position` tinyint(1) NOT NULL DEFAULT '1',
  `use_contact_phone` tinyint(1) NOT NULL DEFAULT '1',
  `use_contact_email` tinyint(1) NOT NULL DEFAULT '1',
  `use_booth_type` tinyint(1) NOT NULL DEFAULT '1',
  `use_booth_count` tinyint(1) NOT NULL DEFAULT '1',
  `use_facility` tinyint(1) NOT NULL DEFAULT '1',
  `use_extra_request` tinyint(1) NOT NULL DEFAULT '1',
  `field_options` text COMMENT 'JSON 배열: 참가분야 선택지',
  `booth_type_options` text COMMENT 'JSON 배열: 부스타입 선택지',
  `facility_options` text COMMENT 'JSON 배열: 부대시설 선택지',
  `work_hours_from` varchar(5) NOT NULL DEFAULT '10:00',
  `work_hours_to` varchar(5) NOT NULL DEFAULT '18:00',
  `show_work_hours` tinyint(1) NOT NULL DEFAULT '1',
  `terms_text` mediumtext COMMENT '약관 동의 본문',
  `privacy_text` mediumtext COMMENT '개인정보수집 동의 본문',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `project_id` (`project_id`),
  CONSTRAINT `fk_ppfc_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_partners`
--

DROP TABLE IF EXISTS `project_partners`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_partners` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `company_name_ko` varchar(255) DEFAULT NULL,
  `company_name_en` varchar(255) DEFAULT NULL,
  `ceo_name` varchar(100) DEFAULT NULL,
  `ceo_email` varchar(255) DEFAULT NULL,
  `ceo_mobile` varchar(30) DEFAULT NULL,
  `biz_cert_path` varchar(500) DEFAULT NULL,
  `company_phone` varchar(50) DEFAULT NULL,
  `company_fax` varchar(50) DEFAULT NULL,
  `company_address` varchar(500) DEFAULT NULL,
  `company_homepage` varchar(500) DEFAULT NULL,
  `company_logo_path` varchar(500) DEFAULT NULL,
  `company_fields` json DEFAULT NULL,
  `contact_name` varchar(100) DEFAULT NULL,
  `contact_dept` varchar(100) DEFAULT NULL,
  `contact_position` varchar(100) DEFAULT NULL,
  `contact_phone` varchar(50) DEFAULT NULL,
  `contact_email` varchar(255) DEFAULT NULL,
  `booth_type` varchar(100) DEFAULT NULL,
  `booth_unit_cost` int DEFAULT NULL,
  `booth_count` int DEFAULT NULL,
  `facility_json` json DEFAULT NULL,
  `quote_total` int DEFAULT NULL,
  `quote_json` json DEFAULT NULL,
  `facility` text,
  `extra_request` text,
  `agreed_terms` tinyint(1) NOT NULL DEFAULT '0',
  `agreed_privacy` tinyint(1) NOT NULL DEFAULT '0',
  `rejected_reason` varchar(500) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `deposit_confirmed_at` datetime DEFAULT NULL,
  `rejected_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_partner_proj` (`project_id`,`status`),
  CONSTRAINT `fk_pp_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_quiz_choices`
--

DROP TABLE IF EXISTS `project_quiz_choices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_quiz_choices` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `quiz_id` bigint NOT NULL,
  `choice_text` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `choice_image_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_correct` tinyint(1) NOT NULL DEFAULT '0',
  `display_seq` int NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_quiz` (`quiz_id`),
  CONSTRAINT `project_quiz_choices_ibfk_1` FOREIGN KEY (`quiz_id`) REFERENCES `project_quizzes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_quizzes`
--

DROP TABLE IF EXISTS `project_quizzes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_quizzes` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `location_id` bigint DEFAULT NULL,
  `question` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `question_image_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `choice_type` enum('single','multi') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'single',
  `correct_image_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `correct_sound_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `wrong_image_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `wrong_sound_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `display_seq` int NOT NULL,
  `disabled` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_project` (`project_id`),
  KEY `idx_location` (`location_id`),
  CONSTRAINT `fk_quiz_location` FOREIGN KEY (`location_id`) REFERENCES `project_locations` (`id`),
  CONSTRAINT `project_quizzes_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_reservation_fields`
--

DROP TABLE IF EXISTS `project_reservation_fields`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_reservation_fields` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `field_id` bigint NOT NULL,
  `is_required` tinyint(1) NOT NULL DEFAULT '0',
  `choice_type_override` enum('single','multi') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_proj_field` (`project_id`,`field_id`),
  KEY `field_id` (`field_id`),
  CONSTRAINT `project_reservation_fields_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_reservation_fields_ibfk_2` FOREIGN KEY (`field_id`) REFERENCES `field_definitions` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=61 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_survey_questions`
--

DROP TABLE IF EXISTS `project_survey_questions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_survey_questions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `question_def_id` bigint DEFAULT NULL COMMENT '카탈로그 참조 시 사용, 커스텀이면 NULL',
  `custom_label` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `custom_input_type` enum('text','textarea','choice','rating','yesno') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `custom_choice_type` enum('single','multi') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `custom_options_json` text COLLATE utf8mb4_unicode_ci,
  `is_required` tinyint(1) NOT NULL DEFAULT '0',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_psq_project` (`project_id`),
  KEY `question_def_id` (`question_def_id`),
  CONSTRAINT `project_survey_questions_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_survey_questions_ibfk_2` FOREIGN KEY (`question_def_id`) REFERENCES `survey_question_definitions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_survey_respondent_fields`
--

DROP TABLE IF EXISTS `project_survey_respondent_fields`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_survey_respondent_fields` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `field_id` bigint NOT NULL,
  `is_required` tinyint(1) NOT NULL DEFAULT '0',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_psrf` (`project_id`,`field_id`),
  KEY `field_id` (`field_id`),
  CONSTRAINT `project_survey_respondent_fields_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_survey_respondent_fields_ibfk_2` FOREIGN KEY (`field_id`) REFERENCES `field_definitions` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_surveys`
--

DROP TABLE IF EXISTS `project_surveys`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_surveys` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('draft','published','closed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `allow_anonymous` tinyint(1) NOT NULL DEFAULT '1' COMMENT '1=등록자 외 직접 응답 허용',
  `require_pre_registration` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1=사전·현장등록자만 응답 가능',
  `thank_you_message` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `reward_label` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '경품 설명',
  `reward_amount` bigint NOT NULL DEFAULT '0' COMMENT '경품 단가 금액',
  `reward_qty` int NOT NULL DEFAULT '0' COMMENT '경품 발급 수량 (0=무제한)',
  `reward_message` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '혜택 메시지 (QR 수령 안내)',
  `reward_image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '경품 이미지 경로',
  PRIMARY KEY (`id`),
  UNIQUE KEY `project_id` (`project_id`),
  CONSTRAINT `project_surveys_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_videos`
--

DROP TABLE IF EXISTS `project_videos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_videos` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `video_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `youtube_url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `author` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `thumbnail_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_video_project` (`project_id`),
  CONSTRAINT `fk_video_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_vote_ballots`
--

DROP TABLE IF EXISTS `project_vote_ballots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_vote_ballots` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `vote_id` bigint NOT NULL,
  `voter_email` varchar(255) NOT NULL,
  `partner_id` bigint NOT NULL,
  `voted_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_vote_voter_partner` (`vote_id`,`voter_email`,`partner_id`),
  KEY `idx_vote_partner` (`vote_id`,`partner_id`),
  KEY `fk_pvb_partner` (`partner_id`),
  CONSTRAINT `fk_pvb_partner` FOREIGN KEY (`partner_id`) REFERENCES `project_partners` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pvb_vote` FOREIGN KEY (`vote_id`) REFERENCES `project_votes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_vote_tiers`
--

DROP TABLE IF EXISTS `project_vote_tiers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_vote_tiers` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `vote_id` bigint NOT NULL,
  `tier_rank` int NOT NULL,
  `award_title` varchar(255) NOT NULL,
  `winner_count` int NOT NULL DEFAULT '1',
  `prize_title` varchar(255) DEFAULT NULL,
  `prize_desc` text,
  `prize_image_path` varchar(500) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_vote_rank` (`vote_id`,`tier_rank`),
  CONSTRAINT `fk_pvt_vote` FOREIGN KEY (`vote_id`) REFERENCES `project_votes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_votes`
--

DROP TABLE IF EXISTS `project_votes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_votes` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `target_type` varchar(20) NOT NULL DEFAULT 'partner',
  `votes_per_visitor` int NOT NULL DEFAULT '1',
  `tier_count` int NOT NULL DEFAULT '1',
  `vote_title` varchar(255) DEFAULT NULL,
  `description` text,
  `status` enum('draft','published','closed') NOT NULL DEFAULT 'draft',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `project_id` (`project_id`),
  CONSTRAINT `fk_pv_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `projects`
--

DROP TABLE IF EXISTS `projects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `projects` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `host_id` bigint NOT NULL,
  `project_name` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `project_serial` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `from_date` date NOT NULL,
  `to_date` date NOT NULL,
  `gift_amount` bigint NOT NULL,
  `gift_qty` int NOT NULL DEFAULT '0',
  `prize_amount` bigint NOT NULL DEFAULT '0',
  `prize_qty` int NOT NULL DEFAULT '0',
  `quiz_bonus_per_correct` int NOT NULL DEFAULT '0',
  `stop_on_budget_exceed` tinyint(1) NOT NULL DEFAULT '0',
  `budget_amount` bigint NOT NULL,
  `pin_hash` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pin_enc` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('draft','quoted','deposit_wait','deposit_confirmed','ready_to_start','started','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'quoted',
  `quote_days` int NOT NULL,
  `quote_amount` bigint NOT NULL,
  `quote_sent_at` datetime DEFAULT NULL,
  `quote_read_at` datetime DEFAULT NULL,
  `quote_read` tinyint(1) NOT NULL DEFAULT '0',
  `deposit_confirmed_at` datetime DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `supervisor_mobile_image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `supervisor_favicon_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `locations_submitted` tinyint(1) NOT NULL DEFAULT '0',
  `locations_submitted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `reservation_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `reservation_use` tinyint(1) NOT NULL DEFAULT '0',
  `reservation_benefit_amount` bigint NOT NULL DEFAULT '0',
  `reservation_benefit_label` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reservation_benefit_message` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reservation_benefit_max_count` int NOT NULL DEFAULT '0',
  `reservation_stop_on_limit` tinyint(1) NOT NULL DEFAULT '0',
  `reservation_benefit_image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reservation_start_at` datetime DEFAULT NULL,
  `entry_benefit_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `entry_use` tinyint(1) NOT NULL DEFAULT '0',
  `entry_benefit_amount` bigint NOT NULL DEFAULT '0',
  `entry_benefit_label` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entry_benefit_message` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entry_benefit_max_count` int NOT NULL DEFAULT '0',
  `entry_stop_on_limit` tinyint(1) NOT NULL DEFAULT '0',
  `entry_benefit_image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `field_agent_use` tinyint(1) NOT NULL DEFAULT '0',
  `survey_use` tinyint(1) NOT NULL DEFAULT '0' COMMENT '?ㅻЦ議곗궗 湲곕뒫 ?ъ슜 (?꾨줈?앺듃???뺤븸)',
  `tour_use` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Tour(목적지/스탬프) 사용 여부',
  `quiz_use` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Quiz 사용 여부',
  `mobile_design_use` tinyint(1) NOT NULL DEFAULT '1' COMMENT '랜딩페이지 디자인 N안 사용 여부',
  `favicon_use` tinyint(1) NOT NULL DEFAULT '1' COMMENT '모바일앱 아이콘 사용 여부',
  `tour_title` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Tour 제목',
  `tour_description` text COLLATE utf8mb4_unicode_ci COMMENT 'Tour 설명',
  `tour_image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Tour 대표 이미지',
  `survey_reward_use` tinyint(1) NOT NULL DEFAULT '0' COMMENT '설문 응답자 경품 지급 사용 (별도 비용 없음)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `project_serial` (`project_serial`),
  KEY `host_id` (`host_id`),
  CONSTRAINT `projects_ibfk_1` FOREIGN KEY (`host_id`) REFERENCES `hosts` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `reservations`
--

DROP TABLE IF EXISTS `reservations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reservations` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `mode` enum('reservation','entry') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'reservation',
  `email_lower` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pin_hash` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fields_json` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` bigint NOT NULL,
  `status` enum('pending','activated','used','cancelled','expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `qr_image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `activated_at` datetime DEFAULT NULL,
  `activated_by_host_id` bigint DEFAULT NULL,
  `used_at` datetime DEFAULT NULL,
  `used_by_merchant_id` bigint DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  UNIQUE KEY `uq_resv_project_email` (`project_id`,`email_lower`),
  KEY `idx_resv_project_status` (`project_id`,`status`),
  KEY `idx_resv_project_mode` (`project_id`,`mode`),
  CONSTRAINT `reservations_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `session_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `expires` int unsigned NOT NULL,
  `data` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `survey_question_definitions`
--

DROP TABLE IF EXISTS `survey_question_definitions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `survey_question_definitions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `question_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label_ko` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `input_type` enum('text','textarea','choice','rating','yesno') COLLATE utf8mb4_unicode_ci NOT NULL,
  `choice_type` enum('single','multi') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `options_json` text COLLATE utf8mb4_unicode_ci COMMENT '["옵션1","옵션2",...]',
  `category` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '만족도/구성/홍보/재방문/개선',
  `sort_order` int NOT NULL DEFAULT '0',
  `is_system` tinyint(1) NOT NULL DEFAULT '1',
  `disabled` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `question_key` (`question_key`)
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `survey_responses`
--

DROP TABLE IF EXISTS `survey_responses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `survey_responses` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `reservation_id` bigint DEFAULT NULL COMMENT 'visitor 사전·현장등록과 연결 (있을 때)',
  `respondent_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `respondent_fields_json` text COLLATE utf8mb4_unicode_ci COMMENT '익명 응답 시 수집된 개인정보',
  `answers_json` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `submitted_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `qr_token` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '응답 완료 후 발급되는 QR 토큰',
  `qr_image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '경품 수령 QR 이미지 파일 경로',
  `reward_used_at` datetime DEFAULT NULL COMMENT '경품 수령 완료 시각',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sr_qr_token` (`qr_token`),
  KEY `idx_sr_project` (`project_id`,`submitted_at`),
  KEY `idx_sr_resv` (`reservation_id`),
  CONSTRAINT `survey_responses_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `survey_responses_ibfk_2` FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_grid_prefs`
--

DROP TABLE IF EXISTS `user_grid_prefs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_grid_prefs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `grid_key` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `prefs_json` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_grid` (`user_type`,`user_id`,`grid_key`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `visitor_push_subscriptions`
--

DROP TABLE IF EXISTS `visitor_push_subscriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `visitor_push_subscriptions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `visitor_id` bigint NOT NULL,
  `endpoint` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `endpoint_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `p256dh` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `auth` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_endpoint_hash` (`endpoint_hash`),
  KEY `idx_visitor` (`visitor_id`),
  CONSTRAINT `visitor_push_subscriptions_ibfk_1` FOREIGN KEY (`visitor_id`) REFERENCES `visitors` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=61 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `visitor_quiz_attempts`
--

DROP TABLE IF EXISTS `visitor_quiz_attempts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `visitor_quiz_attempts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `visitor_id` bigint NOT NULL,
  `quiz_id` bigint NOT NULL,
  `is_correct` tinyint(1) NOT NULL DEFAULT '0',
  `selected_choice_ids` json DEFAULT NULL,
  `attempted_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attempt` (`visitor_id`,`quiz_id`),
  KEY `idx_quiz` (`quiz_id`),
  CONSTRAINT `visitor_quiz_attempts_ibfk_1` FOREIGN KEY (`visitor_id`) REFERENCES `visitors` (`id`),
  CONSTRAINT `visitor_quiz_attempts_ibfk_2` FOREIGN KEY (`quiz_id`) REFERENCES `project_quizzes` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=34 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `visitor_visits`
--

DROP TABLE IF EXISTS `visitor_visits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `visitor_visits` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `visitor_id` bigint NOT NULL,
  `location_id` bigint NOT NULL,
  `visited_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_visit` (`visitor_id`,`location_id`),
  KEY `project_id` (`project_id`),
  KEY `location_id` (`location_id`),
  CONSTRAINT `visitor_visits_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
  CONSTRAINT `visitor_visits_ibfk_2` FOREIGN KEY (`visitor_id`) REFERENCES `visitors` (`id`),
  CONSTRAINT `visitor_visits_ibfk_3` FOREIGN KEY (`location_id`) REFERENCES `project_locations` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=40 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `visitors`
--

DROP TABLE IF EXISTS `visitors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `visitors` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `project_id` bigint NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `consent_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_phone` (`project_id`,`phone`),
  CONSTRAINT `visitors_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=124 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-24  9:11:32
