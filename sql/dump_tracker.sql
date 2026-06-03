/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19-12.2.2-MariaDB, for Win64 (AMD64)
--
-- Host: 127.0.0.1    Database: tracker
-- ------------------------------------------------------
-- Server version	12.2.2-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

--
-- Current Database: `tracker`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `tracker` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;

USE `tracker`;

--
-- Table structure for table `batch_logs`
--

DROP TABLE IF EXISTS `batch_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `batch_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `job_key` varchar(64) NOT NULL,
  `source` varchar(20) NOT NULL DEFAULT 'unknown',
  `status` enum('ok','error') NOT NULL DEFAULT 'ok',
  `result_summary` varchar(500) DEFAULT NULL,
  `started_at` datetime NOT NULL DEFAULT current_timestamp(),
  `finished_at` datetime DEFAULT NULL,
  `error_msg` text DEFAULT NULL,
  `details` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_job_started` (`job_key`,`started_at`),
  KEY `idx_started` (`started_at`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `batch_logs`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `batch_logs` WRITE;
/*!40000 ALTER TABLE `batch_logs` DISABLE KEYS */;
INSERT INTO `batch_logs` VALUES
(1,'sp_update_project_statuses','manual-test','ok','started:0 / ready_to_start:0 / completed:0','2026-06-03 20:13:19','2026-06-03 20:13:19',NULL,NULL),
(2,'sp_update_project_statuses','node','ok','started:0 / ready_to_start:0 / completed:0','2026-06-03 20:13:43','2026-06-03 20:13:43',NULL,NULL),
(3,'sp_update_project_statuses','node','ok','started:0 / ready_to_start:0 / completed:0','2026-06-03 20:14:54','2026-06-03 20:14:54',NULL,NULL),
(4,'sp_update_project_statuses','node','ok','started:0 / ready_to_start:0 / completed:0','2026-06-03 20:15:39','2026-06-03 20:15:39',NULL,NULL),
(5,'project_ending_notice','node','ok','projects:1 / sent:0 / skipped:2 / failed:0','2026-06-03 20:16:39','2026-06-03 20:16:39',NULL,NULL),
(6,'sp_update_project_statuses','node','ok','started:0 / ready_to_start:0 / completed:0','2026-06-03 20:27:02','2026-06-03 20:27:02',NULL,NULL),
(7,'sp_update_project_statuses','node','ok','started:0 / ready_to_start:0 / completed:0','2026-06-03 20:27:16','2026-06-03 20:27:16',NULL,NULL),
(8,'project_ending_notice','node','ok','projects:1 / sent:0 / skipped:2 / failed:0','2026-06-03 20:28:16','2026-06-03 20:28:16',NULL,'{\"projects\":[{\"project_id\":2,\"project_name\":\"주요 10개의 전시물\",\"project_serial\":\"20260523_0002\",\"to_date\":\"2026-06-06\",\"days_left\":3,\"recipients\":[{\"type\":\"host\",\"name\":\"김창호\",\"email\":\"augxmas@gmail.com\",\"status\":\"skipped\"},{\"type\":\"merchant\",\"name\":\"투섬\",\"email\":\"kimch@mono-rama.com\",\"status\":\"skipped\"}]}]}'),
(9,'sp_update_project_statuses','node','ok','started:0 / ready_to_start:0 / completed:0','2026-06-03 20:52:16','2026-06-03 20:52:16',NULL,NULL),
(10,'project_ending_notice','node','ok','projects:1 / sent:0 / skipped:2 / failed:0','2026-06-03 20:53:16','2026-06-03 20:53:16',NULL,'{\"projects\":[{\"project_id\":2,\"project_name\":\"주요 10개의 전시물\",\"project_serial\":\"20260523_0002\",\"to_date\":\"2026-06-06\",\"days_left\":3,\"recipients\":[{\"type\":\"host\",\"name\":\"김창호\",\"email\":\"augxmas@gmail.com\",\"status\":\"skipped\"},{\"type\":\"merchant\",\"name\":\"투섬\",\"email\":\"kimch@mono-rama.com\",\"status\":\"skipped\"}]}]}'),
(11,'qr_regenerate','host','ok','project:20260523_0002','2026-06-03 20:57:48','2026-06-03 20:57:48',NULL,'{\"project_id\":2,\"project_serial\":\"20260523_0002\",\"host_id\":2,\"reason\":\"노출됨\"}'),
(12,'sp_update_project_statuses','node','ok','started:0 / ready_to_start:0 / completed:0','2026-06-03 21:08:05','2026-06-03 21:08:05',NULL,NULL),
(13,'sp_update_project_statuses','node','ok','started:0 / ready_to_start:0 / completed:0','2026-06-03 21:08:19','2026-06-03 21:08:19',NULL,NULL),
(14,'project_ending_notice','node','ok','projects:1 / sent:0 / skipped:2 / failed:0','2026-06-03 21:09:19','2026-06-03 21:09:19',NULL,'{\"projects\":[{\"project_id\":2,\"project_name\":\"주요 10개의 전시물\",\"project_serial\":\"20260523_0002\",\"to_date\":\"2026-06-06\",\"days_left\":3,\"recipients\":[{\"type\":\"host\",\"name\":\"김창호\",\"email\":\"augxmas@gmail.com\",\"status\":\"skipped\"},{\"type\":\"merchant\",\"name\":\"투섬\",\"email\":\"kimch@mono-rama.com\",\"status\":\"skipped\"}]}]}'),
(15,'sp_update_project_statuses','node','ok','started:0 / ready_to_start:0 / completed:0','2026-06-03 21:22:30','2026-06-03 21:22:30',NULL,NULL),
(16,'sp_update_project_statuses','node','ok','started:0 / ready_to_start:0 / completed:0','2026-06-03 21:23:06','2026-06-03 21:23:06',NULL,NULL),
(17,'project_ending_notice','node','ok','projects:1 / sent:0 / skipped:2 / failed:0','2026-06-03 21:24:06','2026-06-03 21:24:06',NULL,'{\"projects\":[{\"project_id\":2,\"project_name\":\"주요 10개의 전시물\",\"project_serial\":\"20260523_0002\",\"to_date\":\"2026-06-06\",\"days_left\":3,\"recipients\":[{\"type\":\"host\",\"name\":\"김창호\",\"email\":\"augxmas@gmail.com\",\"status\":\"skipped\"},{\"type\":\"merchant\",\"name\":\"투섬\",\"email\":\"kimch@mono-rama.com\",\"status\":\"skipped\"}]}]}'),
(18,'sp_update_project_statuses','node','ok','started:0 / ready_to_start:0 / completed:0','2026-06-03 21:44:06','2026-06-03 21:44:06',NULL,NULL),
(19,'project_ending_notice','node','ok','projects:1 / sent:0 / skipped:2 / failed:0','2026-06-03 21:45:06','2026-06-03 21:45:06',NULL,'{\"projects\":[{\"project_id\":2,\"project_name\":\"주요 10개의 전시물\",\"project_serial\":\"20260523_0002\",\"to_date\":\"2026-06-06\",\"days_left\":3,\"recipients\":[{\"type\":\"host\",\"name\":\"김창호\",\"email\":\"augxmas@gmail.com\",\"status\":\"skipped\"},{\"type\":\"merchant\",\"name\":\"투섬\",\"email\":\"kimch@mono-rama.com\",\"status\":\"skipped\"}]}]}');
/*!40000 ALTER TABLE `batch_logs` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `email_logs`
--

DROP TABLE IF EXISTS `email_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `template_key` varchar(100) NOT NULL,
  `to_email` varchar(190) NOT NULL,
  `subject` varchar(255) NOT NULL,
  `project_id` bigint(20) DEFAULT NULL,
  `host_id` bigint(20) DEFAULT NULL,
  `status` enum('sent','failed') NOT NULL,
  `error_msg` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=52 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `email_logs`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `email_logs` WRITE;
/*!40000 ALTER TABLE `email_logs` DISABLE KEYS */;
INSERT INTO `email_logs` VALUES
(4,'email_verify','kimch@monorama.kr','[모노라마] 이메일 인증 코드',NULL,NULL,'failed','Invalid login: 535 5.7.1 Username and Password not accepted OlLYCRQ-TJuZRyV5xoOs1Q - nsmtp','2026-05-23 13:41:10'),
(5,'email_verify','kimch@monorama.kr','[모노라마] 이메일 인증 코드',NULL,NULL,'failed','Invalid login: 535 5.7.1 Username and Password not accepted lBOh+GtcR7CO93DJmoHCZw - nsmtp','2026-05-23 13:43:33'),
(6,'email_verify','kimch@monrama.kr','[모노라마] 이메일 인증 코드',NULL,NULL,'failed','Invalid login: 535 5.7.1 Username and Password not accepted kNurxts9ST6pHcoOKbuQxA - nsmtp','2026-05-23 13:47:56'),
(7,'email_verify','kimch@mono-rama.com','[모노라마] 이메일 인증 코드',NULL,NULL,'failed','Invalid login: 535 5.7.1 Username and Password not accepted uIjqfO8eQwmF3wTWYsUtQA - nsmtp','2026-05-23 13:48:41'),
(8,'email_verify','augxmas@gmail.com','[모노라마] 이메일 인증 코드',NULL,NULL,'failed','Invalid login: 535 5.7.1 Username and Password not accepted R+PJwrV5RC+uLoke-BKbww - nsmtp','2026-05-23 13:50:44'),
(9,'email_verify','augxmas@gmail.com','[모노라마] 이메일 인증 코드',NULL,NULL,'sent',NULL,'2026-05-23 13:59:11'),
(10,'email_verify','augxmas@gmail.com','[모노라마] 이메일 인증 코드',NULL,NULL,'sent',NULL,'2026-05-23 14:11:34'),
(11,'email_verify','augxmas@gmail.com','[모노라마] 이메일 인증 코드',NULL,NULL,'sent',NULL,'2026-05-23 14:14:01'),
(12,'host_registration_submitted','augxmas@gmail.com','[모노라마] 회원가입 신청이 완료되었습니다',NULL,2,'sent',NULL,'2026-05-23 14:15:07'),
(13,'supervisor_new_host','kimch@mono-rama.com','[모노라마 트래커] 신규 Host 가입 신청 확인 요청',NULL,2,'sent',NULL,'2026-05-23 14:15:07'),
(14,'host_status_approved','augxmas@gmail.com','[모노라마] 회원가입이 승인되었습니다',NULL,2,'sent',NULL,'2026-05-23 14:43:32'),
(15,'project_pin','augxmas@gmail.com','[모노라마] 프로젝트 등록 비밀번호',NULL,2,'sent',NULL,'2026-05-23 14:49:13'),
(16,'project_pin','augxmas@gmail.com','[모노라마] Gift 승인 비밀번호',NULL,2,'sent',NULL,'2026-05-23 14:56:53'),
(17,'project_pin','augxmas@gmail.com','[모노라마] Gift 승인 비밀번호',NULL,2,'sent',NULL,'2026-05-23 15:19:03'),
(18,'project_quote','augxmas@gmail.com','[모노라마] 견적서 - 국중박 top 5 방문',1,2,'sent',NULL,'2026-05-23 15:20:41'),
(19,'supervisor_quote_sent','kimch@mono-rama.com','[모노라마 트래커] 견적서 발송 알림 - 국중박 top 5 방문',1,2,'sent',NULL,'2026-05-23 15:20:41'),
(20,'project_pin','augxmas@gmail.com','[모노라마] Gift 승인 비밀번호',NULL,2,'sent',NULL,'2026-05-23 18:00:11'),
(21,'project_pin','augxmas@gmail.com','[모노라마] Gift 승인 비밀번호',NULL,2,'sent',NULL,'2026-05-23 18:06:26'),
(22,'project_quote','augxmas@gmail.com','[모노라마] 견적서 - 주요 10개의 전시물',2,2,'sent',NULL,'2026-05-23 18:07:17'),
(23,'supervisor_quote_sent','kimch@mono-rama.com','[모노라마 트래커] 견적서 발송 알림 - 주요 10개의 전시물',2,2,'sent',NULL,'2026-05-23 18:07:17'),
(24,'email_verify','kimch@mono-rama.com','[모노라마] 이메일 인증 코드',NULL,NULL,'sent',NULL,'2026-05-24 17:28:14'),
(25,'email_verify','kimch@mono-rama.com','[모노라마] 이메일 인증 코드',NULL,NULL,'sent',NULL,'2026-05-24 17:32:36'),
(26,'email_verify','kimch@mono-rama.com','[모노라마] 이메일 인증 코드',NULL,NULL,'sent',NULL,'2026-05-24 17:41:20'),
(27,'email_verify','kimch@mono-rama.com','[모노라마] 이메일 인증 코드',NULL,NULL,'sent',NULL,'2026-05-24 17:42:42'),
(28,'email_verify','kimch@mono-rama.com','[모노라마] 이메일 인증 코드',NULL,NULL,'sent',NULL,'2026-05-24 17:49:48'),
(29,'email_verify','kimch@mono-rama.com','[모노라마] 이메일 인증 코드',NULL,NULL,'sent',NULL,'2026-05-24 17:54:14'),
(30,'email_verify','kimch@mono-rama.com','[모노라마] 이메일 인증 코드',NULL,NULL,'sent',NULL,'2026-05-24 18:00:19'),
(31,'merchant_registration_submitted','kimch@mono-rama.com','[모노라마] 가맹점 가입 신청이 완료되었습니다',NULL,NULL,'sent',NULL,'2026-05-24 18:02:55'),
(32,'supervisor_new_merchant','kimch@mono-rama.com','[모노라마 트래커] 신규 가맹점 가입 신청 확인 요청',NULL,NULL,'sent',NULL,'2026-05-24 18:02:55'),
(33,'merchant_status_approved','kimch@mono-rama.com','[모노라마] 가맹점 가입이 승인되었습니다',NULL,NULL,'sent',NULL,'2026-05-24 18:06:11'),
(34,'project_support_request','augxmas@gmail.com','[모노라마 트래커] 가맹점 프로젝트 지원 요청 - 주요 10개의 전시물',NULL,NULL,'sent',NULL,'2026-05-24 18:34:44'),
(35,'host_new_application','augxmas@gmail.com','[모노라마 트래커] 가맹점 프로젝트 지원 신청 - 주요 10개의 전시물',NULL,NULL,'sent',NULL,'2026-05-24 19:03:52'),
(36,'merchant_application_approved','kimch@mono-rama.com','[모노라마] 프로젝트 참여가 승인되었습니다 - 주요 10개의 전시물',NULL,NULL,'sent',NULL,'2026-05-24 19:04:24'),
(37,'host_new_application','augxmas@gmail.com','[모노라마 트래커] 가맹점 프로젝트 지원 신청 - 주요 10개의 전시물',NULL,NULL,'sent',NULL,'2026-05-24 19:24:53'),
(38,'merchant_application_approved','kimch@mono-rama.com','[모노라마] 프로젝트 참여가 승인되었습니다 - 주요 10개의 전시물',NULL,NULL,'sent',NULL,'2026-05-24 19:25:43'),
(39,'host_new_application','augxmas@gmail.com','[모노라마 트래커] 가맹점 프로젝트 지원 신청 - 주요 10개의 전시물',NULL,NULL,'sent',NULL,'2026-05-24 19:33:40'),
(40,'merchant_application_approved','kimch@mono-rama.com','[모노라마] 프로젝트 참여가 승인되었습니다 - 주요 10개의 전시물',NULL,NULL,'sent',NULL,'2026-05-24 19:34:35'),
(41,'host_temp_password','augxmas@gmail.com','[모노라마] 임시 비밀번호 안내',NULL,2,'sent',NULL,'2026-05-25 09:20:51'),
(42,'supervisor_direct_email','augxmas@gmail.com','tracker에서 보내는 메일',NULL,2,'sent',NULL,'2026-06-03 19:13:21'),
(43,'host_status_cancelled','augxmas@gmail.com','[모노라마] 회원가입 신청이 취소되었습니다',NULL,2,'sent',NULL,'2026-06-03 19:35:07'),
(44,'host_status_approved','augxmas@gmail.com','[모노라마] 회원가입이 승인되었습니다',NULL,2,'sent',NULL,'2026-06-03 19:35:20'),
(45,'project_ending_notice','augxmas@gmail.com','[모노라마] 프로젝트 종료 안내 - 주요 10개의 전시물',2,2,'sent',NULL,'2026-06-03 20:04:57'),
(46,'project_ending_notice','kimch@mono-rama.com','[모노라마] 프로젝트 종료 안내 - 주요 10개의 전시물',2,NULL,'sent',NULL,'2026-06-03 20:04:57'),
(47,'merchant_status_cancelled','kimch@mono-rama.com','[모노라마] 가맹점 가입 신청이 취소되었습니다',NULL,NULL,'sent',NULL,'2026-06-03 20:41:05'),
(48,'merchant_status_approved','kimch@mono-rama.com','[모노라마] 가맹점 가입이 승인되었습니다',NULL,NULL,'sent',NULL,'2026-06-03 20:41:12'),
(49,'project_pin','augxmas@gmail.com','[모노라마] Gift 승인 비밀번호',NULL,2,'sent',NULL,'2026-06-03 21:12:22'),
(50,'project_quote','augxmas@gmail.com','[모노라마] 견적서 - 국토장전',4,2,'sent',NULL,'2026-06-03 21:14:33'),
(51,'supervisor_quote_sent','kimch@mono-rama.com','[모노라마 트래커] 견적서 발송 알림 - 국토장전',4,2,'sent',NULL,'2026-06-03 21:14:33');
/*!40000 ALTER TABLE `email_logs` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `gift_redemptions`
--

DROP TABLE IF EXISTS `gift_redemptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `gift_redemptions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `project_id` bigint(20) NOT NULL,
  `visitor_id` bigint(20) NOT NULL,
  `redemption_type` enum('normal','grant') NOT NULL,
  `amount` bigint(20) NOT NULL,
  `eligible` tinyint(1) NOT NULL DEFAULT 0,
  `redeemed_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `project_id` (`project_id`),
  KEY `visitor_id` (`visitor_id`),
  CONSTRAINT `1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
  CONSTRAINT `2` FOREIGN KEY (`visitor_id`) REFERENCES `visitors` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `gift_redemptions`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `gift_redemptions` WRITE;
/*!40000 ALTER TABLE `gift_redemptions` DISABLE KEYS */;
INSERT INTO `gift_redemptions` VALUES
(1,2,3,'grant',10000,1,'2026-05-25 14:43:12');
/*!40000 ALTER TABLE `gift_redemptions` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `gifts`
--

DROP TABLE IF EXISTS `gifts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `gifts` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `project_id` bigint(20) NOT NULL,
  `visitor_id` bigint(20) NOT NULL,
  `token` varchar(64) NOT NULL,
  `amount` bigint(20) NOT NULL,
  `status` enum('issued','used') NOT NULL DEFAULT 'issued',
  `qr_image_path` varchar(255) DEFAULT NULL,
  `issued_at` datetime NOT NULL DEFAULT current_timestamp(),
  `used_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gift_token` (`token`),
  UNIQUE KEY `uq_gift_visitor` (`project_id`,`visitor_id`),
  KEY `visitor_id` (`visitor_id`),
  CONSTRAINT `1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
  CONSTRAINT `2` FOREIGN KEY (`visitor_id`) REFERENCES `visitors` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `gifts`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `gifts` WRITE;
/*!40000 ALTER TABLE `gifts` DISABLE KEYS */;
/*!40000 ALTER TABLE `gifts` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `host_email_verify_codes`
--

DROP TABLE IF EXISTS `host_email_verify_codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `host_email_verify_codes` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `code` char(6) NOT NULL,
  `used` tinyint(1) NOT NULL DEFAULT 0,
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `host_email_verify_codes`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `host_email_verify_codes` WRITE;
/*!40000 ALTER TABLE `host_email_verify_codes` DISABLE KEYS */;
INSERT INTO `host_email_verify_codes` VALUES
(1,'kimch@monorama.kr','702689',0,'2026-05-23 13:51:10','2026-05-23 13:41:10'),
(2,'kimch@monorama.kr','139306',0,'2026-05-23 13:53:33','2026-05-23 13:43:33'),
(3,'kimch@monrama.kr','594922',0,'2026-05-23 13:57:56','2026-05-23 13:47:56'),
(4,'kimch@mono-rama.com','702543',0,'2026-05-23 13:58:41','2026-05-23 13:48:41'),
(5,'augxmas@gmail.com','273508',0,'2026-05-23 14:00:44','2026-05-23 13:50:44'),
(6,'augxmas@gmail.com','895699',1,'2026-05-23 14:09:10','2026-05-23 13:59:10'),
(7,'augxmas@gmail.com','741777',1,'2026-05-23 14:21:33','2026-05-23 14:11:33'),
(8,'augxmas@gmail.com','265018',1,'2026-05-23 14:24:00','2026-05-23 14:14:00');
/*!40000 ALTER TABLE `host_email_verify_codes` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `host_project_pin_codes`
--

DROP TABLE IF EXISTS `host_project_pin_codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `host_project_pin_codes` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `host_id` bigint(20) NOT NULL,
  `pin_code` char(6) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `host_id` (`host_id`),
  CONSTRAINT `1` FOREIGN KEY (`host_id`) REFERENCES `hosts` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `host_project_pin_codes`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `host_project_pin_codes` WRITE;
/*!40000 ALTER TABLE `host_project_pin_codes` DISABLE KEYS */;
INSERT INTO `host_project_pin_codes` VALUES
(1,2,'996254','2026-05-23 14:59:13',0,'2026-05-23 14:49:13'),
(2,2,'200570','2026-05-23 15:06:53',0,'2026-05-23 14:56:53'),
(3,2,'873494','2026-05-23 15:29:02',1,'2026-05-23 15:19:02'),
(4,2,'427386','2026-05-23 18:10:11',0,'2026-05-23 18:00:11'),
(5,2,'564234','2026-05-23 18:16:25',1,'2026-05-23 18:06:25'),
(6,2,'382552','2026-06-03 21:22:22',1,'2026-06-03 21:12:22');
/*!40000 ALTER TABLE `host_project_pin_codes` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `hosts`
--

DROP TABLE IF EXISTS `hosts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `hosts` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `host_name` varchar(512) NOT NULL,
  `organization_name` varchar(200) DEFAULT NULL,
  `biz_no` varchar(20) DEFAULT NULL,
  `biz_cert_path` varchar(255) DEFAULT NULL,
  `biz_cert_name` varchar(255) DEFAULT NULL,
  `host_email` varchar(512) NOT NULL,
  `mobile_phone` varchar(128) DEFAULT NULL,
  `phone` varchar(128) DEFAULT NULL,
  `password_hash` varchar(80) NOT NULL,
  `status` enum('pending','approved','cancelled','terminated','locked') NOT NULL DEFAULT 'pending',
  `status_reason` varchar(255) DEFAULT NULL,
  `project_pin_fail_count` int(11) NOT NULL DEFAULT 0,
  `project_locked` tinyint(1) NOT NULL DEFAULT 0,
  `last_login_ip` varchar(80) DEFAULT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `last_logout_at` datetime DEFAULT NULL,
  `password_reset_required` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `address_zip` varchar(10) DEFAULT NULL,
  `address1` varchar(512) DEFAULT NULL,
  `address2` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `host_email` (`host_email`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `hosts`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `hosts` WRITE;
/*!40000 ALTER TABLE `hosts` DISABLE KEYS */;
INSERT INTO `hosts` VALUES
(2,'3EC8555624BC559E83EA3330B54101CC','(주)모노라마','2778600185','C:\\proj\\traker\\uploads\\biz-certs\\1779513306788_4shot.jpg','4shot.jpg','C6DBD011970AF33816A9C4D70F1A106A4B74198DAE390FE47256E3D776F9E68B','66DE38183F3C9D34672B17E229AC9DC2','274950E4D8142C26B1A8419AFAD18892','$2b$12$9dlS3mX.N2JfXVR5HXQNte/qV3WZfrJq.owJcG3Acdn4PUwhwQJY.','approved',NULL,0,0,'::1','2026-06-03 21:44:53','2026-05-25 12:33:14',0,'2026-05-23 14:15:07','2026-06-03 21:44:53','17532','경기 안성시 일죽면 판교길 12','101');
/*!40000 ALTER TABLE `hosts` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `login_histories`
--

DROP TABLE IF EXISTS `login_histories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `login_histories` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_type` enum('host','supervisor','merchant') NOT NULL,
  `user_id` varchar(120) NOT NULL,
  `login_ip` varchar(80) NOT NULL,
  `login_at` datetime NOT NULL DEFAULT current_timestamp(),
  `logout_at` datetime DEFAULT NULL,
  `session_id` varchar(200) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=139 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `login_histories`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `login_histories` WRITE;
/*!40000 ALTER TABLE `login_histories` DISABLE KEYS */;
INSERT INTO `login_histories` VALUES
(1,'supervisor','supervisor','::1','2026-05-23 13:00:21',NULL,'N9HVLDqnWFwvrPKgaqQb3bKdllNhIirY'),
(2,'supervisor','supervisor','::1','2026-05-23 14:15:49',NULL,'ibAsz2EeM4BAjjkPVaDklvnQarUTZV8K'),
(3,'supervisor','supervisor','::1','2026-05-23 14:32:38',NULL,'CuZne_7AIpny-wys-EKBINxu0c_au1Ps'),
(4,'supervisor','supervisor','::1','2026-05-23 14:40:49',NULL,'vpgCT4n1JOOkGwWGVgLJ_nAcDyLWQoIT'),
(5,'host','2','::1','2026-05-23 14:45:42',NULL,'8NXfegPGdW1gsQkl2ZI4aTfB1LjgBAhF'),
(6,'host','2','::1','2026-05-23 14:56:43',NULL,'RCcI99y-_A8lkdYKzhJrzcw20fjyHh1F'),
(7,'host','2','::1','2026-05-23 15:18:38',NULL,'89apn5PAQGpT9Rh_3CMCg3fW63CT_5HH'),
(8,'supervisor','supervisor','::1','2026-05-23 15:21:34',NULL,'Sj7G6RK3IM_J_CA0CQ_dlc65Wa8JTL0i'),
(9,'host','2','::1','2026-05-23 15:37:10',NULL,'aJLFRWxaFlpHxDGb9cDsZ1sevi5BVTNh'),
(10,'supervisor','supervisor','::1','2026-05-23 15:37:41',NULL,'i8c2t4PkERUHyqfqaDpt-1pOUflSsq1C'),
(11,'supervisor','supervisor','::1','2026-05-23 17:17:45',NULL,'B23L0QedfouDJT2SLbx3Jd2zxkLsZ-Cv'),
(12,'supervisor','supervisor','::1','2026-05-23 17:38:45',NULL,'VTvGA_wqt_Fh4oQU194Qm5IBW3suL6Hm'),
(13,'supervisor','supervisor','::1','2026-05-23 17:45:10',NULL,'60FBBxf8iMWSWwakU4otPTrWz66a3Sq5'),
(14,'supervisor','supervisor','::1','2026-05-23 17:58:36',NULL,'-SWMjfmnywH4lVT3VdsoKExCtFw7EWYc'),
(15,'host','2','::1','2026-05-23 17:59:47',NULL,'TrAJK5lZBLDCEiJ57oEcRv9JKa_d_U4v'),
(16,'supervisor','supervisor','::1','2026-05-23 18:07:45',NULL,'XID4ANNFWwSmHd-gt9j_Kc0W9sagxh8k'),
(17,'supervisor','supervisor','::1','2026-05-23 18:42:53',NULL,'vc0A3OxViS7JcDYF9Nc3rQWV9un2xYq8'),
(18,'host','2','::1','2026-05-23 18:43:38',NULL,'lXEPQr7nSEP2BwzqqFf8kYs3Ra-2O8At'),
(19,'host','2','::1','2026-05-24 09:31:01',NULL,'zJ5aSNCSyyzKkHY8Bvo1c0PAwQtMO2SY'),
(20,'host','2','::1','2026-05-24 09:49:20',NULL,'OtTZKadMDWkJ2P4LsFOSwiG3fMXWLCxV'),
(21,'host','2','::1','2026-05-24 10:02:06',NULL,'HkJ9gj-mEOU9MkZ6Lyf9PVLK0jF1L8ye'),
(22,'host','2','::1','2026-05-24 10:30:39',NULL,'mWorh9ix78iwKMSy-ZXaYFPSb2cJDkVR'),
(23,'host','2','::1','2026-05-24 10:38:27',NULL,'cuyBP6LZteckIaW-B83EPa79alvt6LfI'),
(24,'host','2','::1','2026-05-24 11:03:34',NULL,'RhEosi34Yk257xWjTBA5H76LRuB_zM5i'),
(25,'host','2','::1','2026-05-24 11:03:34',NULL,'RhEosi34Yk257xWjTBA5H76LRuB_zM5i'),
(26,'host','2','112.172.128.12','2026-05-24 11:06:39',NULL,'FS3nbmqhGy3GTv70JUgM76pwCJsCGIg1'),
(27,'supervisor','supervisor','112.172.128.12','2026-05-24 11:18:27',NULL,'k5zpxipe3vkwssw2WQ_QERIDPl_PdWVV'),
(28,'host','2','112.172.128.12','2026-05-24 12:36:58',NULL,'xM_B1Q95wDFI4AxidMp7pkB-lfebsIrk'),
(29,'supervisor','supervisor','112.172.128.12','2026-05-24 12:38:05',NULL,'AGZomyfXeZc4KOQ9uYTM1BF3K0wRyhne'),
(30,'supervisor','supervisor','112.172.128.12','2026-05-24 12:51:19',NULL,'rmHvGCbRbTaKzwJNS9UR93CPfkZ1Ler2'),
(31,'host','2','112.172.128.12','2026-05-24 12:51:38',NULL,'7YxTtDf4hVHUPXK3z1KvmutJY79t1Gkt'),
(32,'host','2','112.172.128.12','2026-05-24 13:34:18',NULL,'c9MpbTSITtmBQMwmu5hbg72A8qFn3EVy'),
(33,'host','2','112.172.128.12','2026-05-24 13:43:34',NULL,'7yZvoZxDtlasHVaOPWAXUbzczKLs00jZ'),
(34,'host','2','112.172.128.12','2026-05-24 14:02:39','2026-05-24 14:02:49','YxfeaSWeQg_YgqQ9nz3Qm4bLmwWSTYgh'),
(35,'host','2','112.172.128.12','2026-05-24 14:03:04',NULL,'OHiL-Se3kqR_0lTKxS7HtAQfex158Zbv'),
(36,'host','2','112.172.128.12','2026-05-24 14:12:23',NULL,'3oyDraMzgpY0aJ4lSNGbRORfvfLAHkMu'),
(37,'host','2','112.172.128.12','2026-05-24 14:18:33',NULL,'6NcfFbd1kP4jd8BcyLoDEReASKM68Pll'),
(38,'host','2','112.172.128.12','2026-05-24 14:24:07',NULL,'xEAuyUOeOAVDgZNgasV95cGD7CunC68M'),
(39,'host','2','112.172.128.12','2026-05-24 14:29:05',NULL,'Yz4_uI4B4ceZFDg6IEwcqgPEXNhUz6SI'),
(40,'host','2','112.172.128.12','2026-05-24 14:55:06',NULL,'ahOvGZEB1BN3w6U6WgPzCkmFSZpkQfOx'),
(41,'host','2','112.172.128.12','2026-05-24 15:01:32',NULL,'aGfgHjK7OxsKRSQqMJW2bHa1HynCzkE_'),
(42,'supervisor','supervisor','112.172.128.12','2026-05-24 15:15:03',NULL,'KX9GO5Fd1As9qV093kNl6crWwmtxh3ah'),
(43,'supervisor','supervisor','112.172.128.12','2026-05-24 15:22:20',NULL,'m9EP-Q01alqIpwjEtuc74vw2yCMDE-KG'),
(44,'supervisor','supervisor','112.172.128.12','2026-05-24 15:39:37','2026-05-24 16:10:18','5SIKCcDUpe3KaUlMxO36iPKYzxOwzvZ2'),
(45,'supervisor','supervisor','112.172.128.12','2026-05-24 16:10:42','2026-05-24 16:18:39','9i2-ItsFHzMw8c4eVGR20aST991d3Wi4'),
(46,'supervisor','supervisor','112.172.128.12','2026-05-24 16:18:41','2026-05-24 16:33:43','0zg07J2mLdkm4ziZjiAoopO8nRQZKYzz'),
(47,'host','2','112.172.128.12','2026-05-24 16:31:39',NULL,'0WfF0pVHtR5gXH2anHVopM2SjPYxHUSQ'),
(48,'supervisor','supervisor','112.172.128.12','2026-05-24 16:33:59','2026-05-24 16:35:33','pmRrGxtVmYQOZvfhIaKQBStj8IwPGZCS'),
(49,'supervisor','supervisor','112.172.128.12','2026-05-24 16:35:45','2026-05-24 16:46:13','IcmKmeYJD_6FR9bdUiv--na0_rFBws-V'),
(50,'supervisor','supervisor','112.172.128.12','2026-05-24 16:46:15','2026-05-24 16:56:00','eQ5YDuM5ORDS7l86SItIhgLdBitzhfMD'),
(52,'supervisor','supervisor','112.172.128.12','2026-05-24 18:03:57','2026-05-24 18:22:41','ssh4WyS630_20VUtriUzFZdwWvooD7Bi'),
(53,'merchant','4','112.172.128.12','2026-05-24 18:06:14',NULL,'pBMC3V4rqnhW2vtM_LQKc6ndngF3XGcC'),
(54,'supervisor','supervisor','112.172.128.12','2026-05-24 18:15:41','2026-05-24 18:29:45','dTtebZBPHbYbelcqSyKhGvalMnZLa_WA'),
(55,'supervisor','supervisor','112.172.128.12','2026-05-24 18:29:46','2026-05-24 18:35:07','EDElFrJ12LykQ9TnrHt45uEtA1KvNO2J'),
(56,'host','2','112.172.128.12','2026-05-24 18:35:22',NULL,'Lmabd11s56o2GXEejdxy4rJ7pBmUUt4A'),
(57,'merchant','4','112.172.128.12','2026-05-24 19:02:14','2026-05-24 19:07:49','y8UbEGF4mb7kaRhpnE47oIyBvCSWpOtE'),
(58,'host','2','112.172.128.12','2026-05-24 19:03:06',NULL,'B6xlq7RfLWeygoyphwpfI_Do81_WRU0i'),
(59,'merchant','4','112.172.128.12','2026-05-24 19:08:01',NULL,'dX6wlrWgxi4AtHTbqPKBSvow2hQvEqvq'),
(60,'merchant','4','112.172.128.12','2026-05-24 19:08:01',NULL,'srHC0OzLMEUuPPzjmqJEqdQh9amqIrRk'),
(61,'merchant','4','112.172.128.12','2026-05-24 19:13:18',NULL,'4FVFQ_MmwUZN9fv3yPf8Ulo657t__oiY'),
(62,'merchant','4','112.172.128.12','2026-05-24 19:22:15',NULL,'AaFmkQxiVNUfES6Khvj_t9vgwQFDVRFr'),
(63,'host','2','112.172.128.12','2026-05-24 19:25:30',NULL,'i-nFjTFXU3cP_BVUEPFhpyacEFgEiz2B'),
(64,'host','2','112.172.128.12','2026-05-24 19:25:30',NULL,'i-nFjTFXU3cP_BVUEPFhpyacEFgEiz2B'),
(65,'merchant','4','112.172.128.12','2026-05-24 19:32:15',NULL,'Zp36dJbtSRb279bbd43N63Ko3CYlwrxQ'),
(66,'host','2','112.172.128.12','2026-05-24 19:34:23',NULL,'swsObOMH7lhY0gzu3-ev9idcWC1cexCc'),
(67,'merchant','4','112.172.128.12','2026-05-24 19:38:47',NULL,'BAlVMJHHimrP73DnRlsBgwZWXmaMFBqr'),
(68,'merchant','4','112.172.128.12','2026-05-24 19:46:11',NULL,'HrPhF597Q65ilcso4XRLxtT0Rxlglrnh'),
(69,'merchant','4','112.172.128.12','2026-05-24 20:00:34',NULL,'ErC1gGCTQN4aXxBa9fXk7GOV64g89Dcr'),
(70,'merchant','4','112.172.128.12','2026-05-25 09:00:00','2026-05-25 09:00:36','xY8raoIS5XS-nGUalIPkUu1MRjdzU_yN'),
(71,'merchant','4','112.172.128.12','2026-05-25 09:01:59','2026-05-25 09:02:02','3jbGOax2xIuxgdwr-PXmzuyHFVNQ94Qn'),
(72,'merchant','4','112.172.128.12','2026-05-25 09:02:25','2026-05-25 09:02:31','P3VXYp3xMTQ3Fi-tufrjWWjcGVDJdSpA'),
(73,'merchant','4','112.172.128.12','2026-05-25 09:18:02','2026-05-25 09:18:06','5JiMINXSHSZjb3GdgxagaYme8I1nYiBW'),
(74,'merchant','4','112.172.128.12','2026-05-25 09:18:28','2026-05-25 09:18:33','OqUdq0U9nHElo9QkNbyHcnh2lJ14xNrI'),
(75,'host','2','112.172.128.12','2026-05-25 09:21:19',NULL,'H5KvLXvKW2UxwvfFlWn9jd2om84vATdI'),
(76,'host','2','112.172.128.12','2026-05-25 09:44:02',NULL,'k7c736yb5R9PUDnap6QDkzmIiLEaumi8'),
(77,'host','2','112.172.128.12','2026-05-25 09:44:02',NULL,'k7c736yb5R9PUDnap6QDkzmIiLEaumi8'),
(78,'merchant','4','112.172.128.12','2026-05-25 09:51:01',NULL,'bVJpjU-fed_LjJyjQC1-ZltxQ64K6NO6'),
(79,'merchant','4','112.172.128.12','2026-05-25 09:55:57',NULL,'8FpBkhMwGZATRH-JyySs2XJEa8SbGqmG'),
(80,'merchant','4','112.172.128.12','2026-05-25 09:55:57',NULL,'8FpBkhMwGZATRH-JyySs2XJEa8SbGqmG'),
(81,'merchant','4','112.172.128.12','2026-05-25 09:56:58',NULL,'nyAreHcoo_glxzLHTzA_r8-lUW8qNmlq'),
(82,'host','2','112.172.128.12','2026-05-25 10:01:33',NULL,'sBETKarInBoFB4x-m3sqqPHEwP6Pcqzc'),
(83,'merchant','4','112.172.128.12','2026-05-25 10:06:03',NULL,'OPc5nFE21mbwsFgBCm512_yjzrAABAvI'),
(84,'host','2','112.172.128.12','2026-05-25 10:07:30','2026-05-25 10:14:45','RKpvOQYc0MW3j0LhWlbH1spwgErrz87A'),
(85,'merchant','4','112.172.128.12','2026-05-25 10:30:47','2026-05-25 10:34:22','0dpPrcEDSx8QhdPO3HM8GsV2o5eC5xXZ'),
(86,'host','2','112.172.128.12','2026-05-25 10:33:59','2026-05-25 10:37:40','GC8pbfM-puI-vnqJSAW2IAPCwcNM1ysr'),
(87,'merchant','4','112.172.128.12','2026-05-25 10:34:37','2026-05-25 10:37:48','T54HNTTiKwj2OjzVwsX7ThQSRJTci1i1'),
(88,'host','2','112.172.128.12','2026-05-25 10:43:43','2026-05-25 10:58:08','dcSqj65OFTLnNO9tiIQJSbMM3bq95YBQ'),
(89,'merchant','4','112.172.128.12','2026-05-25 10:52:35',NULL,'_8nd8JBgC52wjzm5FsslKDmRBBT8Iv6I'),
(90,'host','2','112.172.128.12','2026-05-25 10:58:10',NULL,'aauBNVVUZ4OPEytDDL0ZQS48nJmV_DGm'),
(91,'host','2','112.172.128.12','2026-05-25 10:58:10','2026-05-25 11:01:15','8i0kbtDo7y8OI8tJ4fUcNRgHzQsolFIB'),
(92,'host','2','112.172.128.12','2026-05-25 11:06:19','2026-05-25 11:45:39','oM96X6ssyKyZCe9lk-BD5OcPNjd9eM2D'),
(93,'merchant','4','112.172.128.12','2026-05-25 11:08:42',NULL,'MokzY6TnPdIhfBlksiYf03CuqaGuCEAW'),
(94,'merchant','4','112.172.128.12','2026-05-25 11:10:56','2026-05-25 11:15:10','AkMCnSGuQKKNfaNCwMzYBWr6Hc1Pqzxf'),
(95,'supervisor','supervisor','112.172.128.12','2026-05-25 11:13:55','2026-05-25 11:18:30','GM57AKBF50cVAPUuBfbLTFS4L8v9pik7'),
(96,'supervisor','supervisor','112.172.128.12','2026-05-25 11:18:42','2026-05-25 11:37:44','Osu2BAwMJPpiUcf-_e0Sd3VZtPZgvfiR'),
(97,'merchant','4','112.172.128.12','2026-05-25 11:19:07',NULL,'8rNaRNNuUYZSlTwWPlTDXa6dDfIJTtPX'),
(98,'merchant','4','112.172.128.12','2026-05-25 11:21:12','2026-05-25 11:45:41','lokoHRMvw4qKYJSEU2h_xaiAtPcLK13j'),
(99,'supervisor','supervisor','112.172.128.12','2026-05-25 11:37:46','2026-05-25 12:04:16','bP7ePOQkDZo9bt7D7tVKIdpCMXZUro1g'),
(100,'merchant','4','112.172.128.12','2026-05-25 11:44:29','2026-05-25 11:50:52','CbyiI0JMU0ly0BPrXXPf2eiXAmHZ2dxp'),
(101,'merchant','4','112.172.128.12','2026-05-25 11:50:54',NULL,'4Sat8WBnYq9BBc6qA373IazcXdOMJOzK'),
(102,'host','2','112.172.128.12','2026-05-25 11:51:57','2026-05-25 12:02:47','B7kjupUiTJucx1pJ4sIwya3GEDTAttSF'),
(103,'merchant','4','112.172.128.12','2026-05-25 11:52:43','2026-05-25 12:03:17','MZEXYXeo3jVtFFb2PtBrjE5WzUZUx5qX'),
(104,'host','2','112.172.128.12','2026-05-25 12:33:09','2026-05-25 12:33:14','dfXw0zpAA6CQGZNc0I1s-ZPLq-N5NLCE'),
(105,'host','2','112.172.128.12','2026-05-25 12:33:09','2026-05-25 12:33:14','dfXw0zpAA6CQGZNc0I1s-ZPLq-N5NLCE'),
(106,'merchant','4','112.172.128.12','2026-05-25 12:34:20','2026-05-25 12:41:27','g7xeFlrvBoQS_pHlBO5m1puCpp-y-1SP'),
(107,'host','2','112.172.128.12','2026-05-25 12:34:36','2026-05-25 12:48:21','rtkyW6BvdffzXCa-DXY4UrAVDNCp-iI2'),
(108,'merchant','4','112.172.128.12','2026-05-25 12:42:32','2026-05-25 12:46:36','bUYIh_ttgvskSU_GUmHPOJW2TU05y027'),
(109,'merchant','4','112.172.128.12','2026-05-25 13:55:21','2026-05-25 14:01:37','MISUwQdQruyo-0zdQIQGbFW0vVgGvO2V'),
(110,'merchant','4','112.172.128.12','2026-05-25 14:01:50','2026-05-25 14:16:56','j8yshT7eyKvy3cysR9Na-N6rLOWQY-8o'),
(111,'merchant','4','112.172.128.12','2026-05-25 14:24:05','2026-05-25 14:30:04','5CvhIg1VuxPrSNWIX7DUz48Kjeuaxbhd'),
(112,'host','2','112.172.128.12','2026-05-25 14:26:30',NULL,'U7sHPwmyBNFneDjRx7nSZUtGQ-AWHu5d'),
(113,'merchant','4','112.172.128.12','2026-05-25 14:42:55',NULL,'vJ5996G19fO1tEHeyrDzey58MoGGmtg_'),
(114,'host','2','112.172.128.12','2026-05-25 15:04:09','2026-05-25 15:08:11','nsJxpOzU3tJJt70t_VwsPNmwGGCBAC0a'),
(115,'host','2','112.172.128.12','2026-05-25 15:04:09','2026-05-25 15:08:11','nsJxpOzU3tJJt70t_VwsPNmwGGCBAC0a'),
(116,'host','2','112.172.128.12','2026-05-25 15:09:16',NULL,'ZPrjcGJuk7K9N5DgpY6wjVdZJ6TkD5I6'),
(117,'host','2','112.172.128.12','2026-05-25 15:09:16','2026-05-25 15:43:08','x_buq9jyvLcFtIgiNIixE5wo9fw8yn7U'),
(118,'merchant','4','112.172.128.12','2026-05-25 15:16:59','2026-05-25 15:43:08','x_buq9jyvLcFtIgiNIixE5wo9fw8yn7U'),
(119,'merchant','4','112.172.128.12','2026-05-25 15:16:59','2026-05-25 15:43:08','x_buq9jyvLcFtIgiNIixE5wo9fw8yn7U'),
(120,'merchant','4','112.172.128.12','2026-05-25 15:36:47',NULL,'SZzzgSuXTOxXNvmgQC2z9mESynowklz5'),
(121,'merchant','4','112.172.128.12','2026-05-25 15:36:47','2026-05-25 15:41:02','Bwo3wLmeDEieXtcw-3Kt0YZLa64GfHBc'),
(122,'supervisor','supervisor','::1','2026-06-03 16:01:19',NULL,'3KpAnp82UFXtJv9jmV2eHNtkRbpp5-7q'),
(123,'host','2','::1','2026-06-03 16:03:05','2026-06-03 16:08:16','Q6Hgsc0AkDu3lsOzwD1q1-8KnBPsmCrT'),
(124,'supervisor','supervisor','::1','2026-06-03 19:00:03','2026-06-03 20:00:21','PMySYalFMU2R82RDqJ3aYduHDtMBoncz'),
(125,'supervisor','supervisor','::1','2026-06-03 19:10:18',NULL,'xCyiB_5fS43NYfvzoY6v_6r3Jhf80-yC'),
(126,'supervisor','supervisor','::1','2026-06-03 19:26:13',NULL,'wJ5LpsTdHtn7mJHgMIuLRq1i4ksD1xb4'),
(127,'supervisor','supervisor','::1','2026-06-03 19:26:25',NULL,'dGS2daT0f2oiw8mVftnOx-Ha8NsLoEqa'),
(128,'supervisor','supervisor','::1','2026-06-03 19:26:41',NULL,'cnKsedmEgXaNfcHMB5LxX1CXHJjlA_Yx'),
(129,'supervisor','supervisor','::1','2026-06-03 19:39:52',NULL,'yKw_Y1gi-qXhHQpD2mf8XpF4PwQB-6TL'),
(130,'supervisor','supervisor','::1','2026-06-03 19:50:26',NULL,'SZyO79H_TBAWq3T15oIBLRXQprXHDRaJ'),
(131,'supervisor','supervisor','::1','2026-06-03 20:01:12','2026-06-03 20:44:19','GKqKP5oe86SPYL8LzzXsQijSoAY6RUxc'),
(132,'host','2','::1','2026-06-03 20:06:09','2026-06-03 21:16:37','Le54G55e-3kHXtZwnJgVFn20t8dUUrXy'),
(133,'supervisor','supervisor','::1','2026-06-03 20:22:18',NULL,'5v2b_JND_y0C8ekKyqodITSGzRVeynVa'),
(134,'supervisor','supervisor','::1','2026-06-03 20:30:29',NULL,'RGfmn9LAXcaSwCSR-wp99zMvAHRwGSWV'),
(135,'supervisor','supervisor','::1','2026-06-03 21:15:04','2026-06-03 21:16:37','Le54G55e-3kHXtZwnJgVFn20t8dUUrXy'),
(136,'host','2','::1','2026-06-03 21:16:50','2026-06-03 21:43:58','lSawSy8OYnWYEuzLm5p2EVkzLOWrrMBN'),
(137,'host','2','::1','2026-06-03 21:44:53','2026-06-03 21:54:52','iROJM8va9USw4ZPDL1T2Vyg6AhFSt0Kg'),
(138,'supervisor','supervisor','::1','2026-06-03 21:55:00','2026-06-03 21:59:04','hsL-tW8f2uP4XHtzV9QihVdceKJo8gcy');
/*!40000 ALTER TABLE `login_histories` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `merchant_email_verify_codes`
--

DROP TABLE IF EXISTS `merchant_email_verify_codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `merchant_email_verify_codes` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `code` char(6) NOT NULL,
  `used` tinyint(1) NOT NULL DEFAULT 0,
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_mvc_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `merchant_email_verify_codes`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `merchant_email_verify_codes` WRITE;
/*!40000 ALTER TABLE `merchant_email_verify_codes` DISABLE KEYS */;
INSERT INTO `merchant_email_verify_codes` VALUES
(1,'kimch@mono-rama.com','536496',0,'2026-05-24 17:38:15','2026-05-24 17:28:14'),
(2,'kimch@mono-rama.com','787924',1,'2026-05-24 17:42:38','2026-05-24 17:32:36'),
(3,'kimch@mono-rama.com','155061',1,'2026-05-24 17:51:21','2026-05-24 17:41:19'),
(4,'kimch@mono-rama.com','642280',1,'2026-05-24 17:52:44','2026-05-24 17:42:42'),
(5,'kimch@mono-rama.com','158476',1,'2026-05-24 17:59:50','2026-05-24 17:49:48'),
(6,'kimch@mono-rama.com','179443',1,'2026-05-24 18:04:15','2026-05-24 17:54:13'),
(7,'kimch@mono-rama.com','465424',1,'2026-05-24 18:10:21','2026-05-24 18:00:19');
/*!40000 ALTER TABLE `merchant_email_verify_codes` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `merchants`
--

DROP TABLE IF EXISTS `merchants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `merchants` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `merchant_name` varchar(512) NOT NULL,
  `contact_name` varchar(512) DEFAULT NULL,
  `contact_phone` varchar(128) DEFAULT NULL,
  `contact_mobile` varchar(128) DEFAULT NULL,
  `biz_no` varchar(20) DEFAULT NULL,
  `biz_cert_path` varchar(255) DEFAULT NULL,
  `biz_cert_name` varchar(255) DEFAULT NULL,
  `email` varchar(512) NOT NULL,
  `bank_name` varchar(100) DEFAULT NULL,
  `bank_code` varchar(10) DEFAULT NULL,
  `bank_account` varchar(512) DEFAULT NULL,
  `bank_copy_path` varchar(255) DEFAULT NULL,
  `bank_copy_name` varchar(255) DEFAULT NULL,
  `password_hash` varchar(80) NOT NULL,
  `status` enum('pending','approved','cancelled','terminated','locked') NOT NULL DEFAULT 'pending',
  `status_reason` varchar(255) DEFAULT NULL,
  `last_login_ip` varchar(80) DEFAULT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `last_logout_at` datetime DEFAULT NULL,
  `password_reset_required` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `address_zip` varchar(20) DEFAULT NULL,
  `address1` varchar(255) DEFAULT NULL,
  `address2` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_merchant_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `merchants`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `merchants` WRITE;
/*!40000 ALTER TABLE `merchants` DISABLE KEYS */;
INSERT INTO `merchants` VALUES
(4,'3FAE468718A6A8E5210174667E89C5C8','56317D6315F0024C9142EC35490CAF28','21A7858DBCEAB64758519F2303727EFF','35CEEC280A49F2CF41AB4FB88F2EB70E','1231212234','C:\\proj\\tracker\\uploads\\merchant-docs\\1779613376632_art-in-paradise-pattaya.jpg','art-in-paradise-pattaya.jpg','A234C7E2ABCD7B4928419EB4B1B3C9A50FF30DBE1D39AAF31BF51FC75B232AF1','우리은행','020','6B28F65EF0016384330F382D42AC59E0','C:\\proj\\tracker\\uploads\\merchant-docs\\1779613376633_1shot.jpeg','1shot.jpeg','$2b$12$CyYqNf8wpLhwaL6fKO.RmudZ6Jzz4oI2ONlBgDXgUq7GukfkwbOH6','approved',NULL,'112.172.128.12','2026-05-25 15:36:47','2026-05-25 14:01:37',0,'2026-05-24 18:02:54','2026-06-03 20:41:12','07797','서울 강서구 마곡중앙로 지하 135','1층');
/*!40000 ALTER TABLE `merchants` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `project_applications`
--

DROP TABLE IF EXISTS `project_applications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_applications` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `project_id` bigint(20) NOT NULL,
  `merchant_id` bigint(20) NOT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `decided_at` datetime DEFAULT NULL,
  `decided_reason` varchar(255) DEFAULT NULL,
  `applied_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_proj_merchant` (`project_id`,`merchant_id`),
  KEY `idx_project` (`project_id`),
  KEY `idx_merchant` (`merchant_id`),
  CONSTRAINT `fk_pa_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pa_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `project_applications`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `project_applications` WRITE;
/*!40000 ALTER TABLE `project_applications` DISABLE KEYS */;
INSERT INTO `project_applications` VALUES
(4,2,4,'approved','2026-05-24 19:34:35',NULL,'2026-05-24 19:33:40','2026-05-24 19:33:40','2026-05-24 19:34:35');
/*!40000 ALTER TABLE `project_applications` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `project_daily_sequences`
--

DROP TABLE IF EXISTS `project_daily_sequences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_daily_sequences` (
  `seq_date` char(8) NOT NULL,
  `last_no` int(11) NOT NULL,
  PRIMARY KEY (`seq_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `project_daily_sequences`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `project_daily_sequences` WRITE;
/*!40000 ALTER TABLE `project_daily_sequences` DISABLE KEYS */;
INSERT INTO `project_daily_sequences` VALUES
('20260523',2),
('20260603',1);
/*!40000 ALTER TABLE `project_daily_sequences` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `project_location_qr`
--

DROP TABLE IF EXISTS `project_location_qr`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_location_qr` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `project_id` bigint(20) NOT NULL,
  `location_id` bigint(20) NOT NULL,
  `qr_url` varchar(255) NOT NULL,
  `qr_image_path` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_location` (`location_id`),
  KEY `project_id` (`project_id`),
  CONSTRAINT `1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
  CONSTRAINT `2` FOREIGN KEY (`location_id`) REFERENCES `project_locations` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `project_location_qr`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `project_location_qr` WRITE;
/*!40000 ALTER TABLE `project_location_qr` DISABLE KEYS */;
INSERT INTO `project_location_qr` VALUES
(2,2,5,'http://localhost:5000/v/20260523_0002/01','C:\\proj\\tracker\\uploads\\qr\\2\\qr_20260523_0002_01.png','2026-05-24 12:42:53'),
(3,2,6,'http://localhost:5000/v/20260523_0002/02','C:\\proj\\tracker\\uploads\\qr\\2\\qr_20260523_0002_02.png','2026-05-24 12:42:53'),
(4,2,7,'http://localhost:5000/v/20260523_0002/03','C:\\proj\\tracker\\uploads\\qr\\2\\qr_20260523_0002_03.png','2026-05-24 12:42:53');
/*!40000 ALTER TABLE `project_location_qr` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `project_locations`
--

DROP TABLE IF EXISTS `project_locations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_locations` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `project_id` bigint(20) NOT NULL,
  `location_seq` int(11) NOT NULL,
  `display_seq` int(11) NOT NULL,
  `dest_type` enum('location','exhibit') NOT NULL DEFAULT 'location',
  `location_name` varchar(100) NOT NULL,
  `kakao_lat` decimal(12,8) DEFAULT NULL,
  `kakao_lng` decimal(12,8) DEFAULT NULL,
  `location_desc` varchar(50) DEFAULT NULL,
  `image_path` varchar(255) DEFAULT NULL,
  `disabled` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_location_seq` (`project_id`,`location_seq`),
  UNIQUE KEY `uq_project_display_seq_active` (`project_id`,`display_seq`,`disabled`),
  CONSTRAINT `1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `project_locations`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `project_locations` WRITE;
/*!40000 ALTER TABLE `project_locations` DISABLE KEYS */;
INSERT INTO `project_locations` VALUES
(5,2,1,1,'exhibit','반가사유상',NULL,NULL,NULL,'C:\\proj\\tracker\\uploads\\location-icons\\1779586315323_3shot.jpg',0,'2026-05-24 10:31:54','2026-05-24 10:31:54'),
(6,2,2,2,'exhibit','김홍도 그림',NULL,NULL,NULL,'C:\\proj\\tracker\\uploads\\location-icons\\1779586391797_gostop.png',0,'2026-05-24 10:33:10','2026-05-24 10:38:39'),
(7,2,3,3,'exhibit','추사 김정희',NULL,NULL,NULL,'C:\\proj\\tracker\\uploads\\location-icons\\1779586807382_ëí¬_5.png',0,'2026-05-24 10:40:06','2026-05-24 10:40:06');
/*!40000 ALTER TABLE `project_locations` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `project_quiz_choices`
--

DROP TABLE IF EXISTS `project_quiz_choices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_quiz_choices` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `quiz_id` bigint(20) NOT NULL,
  `choice_text` varchar(500) NOT NULL,
  `is_correct` tinyint(1) NOT NULL DEFAULT 0,
  `display_seq` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_quiz` (`quiz_id`),
  CONSTRAINT `1` FOREIGN KEY (`quiz_id`) REFERENCES `project_quizzes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `project_quiz_choices`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `project_quiz_choices` WRITE;
/*!40000 ALTER TABLE `project_quiz_choices` DISABLE KEYS */;
/*!40000 ALTER TABLE `project_quiz_choices` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `project_quizzes`
--

DROP TABLE IF EXISTS `project_quizzes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_quizzes` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `project_id` bigint(20) NOT NULL,
  `question` varchar(500) NOT NULL,
  `choice_type` enum('single','multi') NOT NULL DEFAULT 'single',
  `display_seq` int(11) NOT NULL,
  `disabled` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_project` (`project_id`),
  CONSTRAINT `1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `project_quizzes`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `project_quizzes` WRITE;
/*!40000 ALTER TABLE `project_quizzes` DISABLE KEYS */;
/*!40000 ALTER TABLE `project_quizzes` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `projects`
--

DROP TABLE IF EXISTS `projects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `projects` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `host_id` bigint(20) NOT NULL,
  `project_name` varchar(160) NOT NULL,
  `project_serial` varchar(20) NOT NULL,
  `description` varchar(200) NOT NULL,
  `from_date` date NOT NULL,
  `to_date` date NOT NULL,
  `gift_amount` bigint(20) NOT NULL,
  `gift_qty` int(11) NOT NULL DEFAULT 0,
  `prize_amount` bigint(20) NOT NULL DEFAULT 0,
  `prize_qty` int(11) NOT NULL DEFAULT 0,
  `budget_amount` bigint(20) NOT NULL,
  `pin_hash` varchar(80) NOT NULL,
  `pin_enc` varchar(255) DEFAULT NULL,
  `status` enum('draft','quoted','deposit_wait','deposit_confirmed','ready_to_start','started','completed','cancelled') NOT NULL DEFAULT 'quoted',
  `quote_days` int(11) NOT NULL,
  `quote_amount` bigint(20) NOT NULL,
  `quote_sent_at` datetime DEFAULT NULL,
  `quote_read_at` datetime DEFAULT NULL,
  `quote_read` tinyint(1) NOT NULL DEFAULT 0,
  `deposit_confirmed_at` datetime DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `supervisor_mobile_image_path` varchar(255) DEFAULT NULL,
  `supervisor_favicon_path` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `locations_submitted` tinyint(1) NOT NULL DEFAULT 0,
  `locations_submitted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `project_serial` (`project_serial`),
  KEY `host_id` (`host_id`),
  CONSTRAINT `1` FOREIGN KEY (`host_id`) REFERENCES `hosts` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `projects`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `projects` WRITE;
/*!40000 ALTER TABLE `projects` DISABLE KEYS */;
INSERT INTO `projects` VALUES
(1,2,'국중박 top 5 방문','20260523_0001','국중박 5개의 중요 전시물 확인','2026-05-25','2026-06-01',60000,3,0,0,180000,'$2b$10$8/7qrMghH7wip3HIp676Ee2cBpoanhNKsMdV2h/3VmSifHLE8eb3W',NULL,'quoted',8,800730000,'2026-05-23 15:20:40',NULL,0,NULL,NULL,NULL,NULL,NULL,'2026-05-23 15:20:40','2026-05-23 15:20:40',0,NULL),
(2,2,'주요 10개의 전시물','20260523_0002','주요 10개의 전시물','2026-05-24','2026-06-06',10000,1000,0,0,10000000,'$2b$10$KpZN/X.6SyHoBnmXTserBeQIaa01eeSHDl2PrezXTGJrHCkUK3r0u','F5D369D59862C1EE33D425C00342C36F','started',14,870000,'2026-05-23 18:07:16','2026-05-23 18:07:55',1,'2026-05-24 12:42:53',NULL,'2026-05-24 12:49:00','C:\\proj\\tracker\\uploads\\supervisor-assets\\1779605283537_stamp_tour_landing_national_museum.svg','C:\\proj\\tracker\\uploads\\supervisor-assets\\1779605299690_stamp_tour_pwa_icon_national_museum.svg','2026-05-23 18:07:16','2026-05-24 19:28:23',1,'2026-05-24 10:40:16'),
(4,2,'국토장전','20260603_0001','3군데 지정 장소를 돌고 쿼즈 맞추기','2026-06-04','2026-06-15',10000,20,500,100,200000,'$2b$10$r1aIbNho6TBMEHHR38W/cOLkTc/nMRoiXeVRGjPxiqfW4AZn0vUOK','CCFB39E98E71747D923D4574FAE3C3AE','started',12,850000,'2026-06-03 21:14:32','2026-06-03 21:15:16',1,'2026-06-03 21:15:44',NULL,NULL,NULL,NULL,'2026-06-03 21:14:32','2026-06-03 21:16:10',0,NULL);
/*!40000 ALTER TABLE `projects` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `session_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `expires` int(11) unsigned NOT NULL,
  `data` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sessions`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sessions` WRITE;
/*!40000 ALTER TABLE `sessions` DISABLE KEYS */;
/*!40000 ALTER TABLE `sessions` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `visitor_push_subscriptions`
--

DROP TABLE IF EXISTS `visitor_push_subscriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `visitor_push_subscriptions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `visitor_id` bigint(20) NOT NULL,
  `endpoint` text NOT NULL,
  `endpoint_hash` char(64) NOT NULL,
  `p256dh` varchar(255) NOT NULL,
  `auth` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_endpoint_hash` (`endpoint_hash`),
  KEY `idx_visitor` (`visitor_id`),
  CONSTRAINT `1` FOREIGN KEY (`visitor_id`) REFERENCES `visitors` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `visitor_push_subscriptions`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `visitor_push_subscriptions` WRITE;
/*!40000 ALTER TABLE `visitor_push_subscriptions` DISABLE KEYS */;
INSERT INTO `visitor_push_subscriptions` VALUES
(1,2,'https://fcm.googleapis.com/fcm/send/eyymAMa_XAs:APA91bFeJKZfcdIR3F1KINUtgexAlzOgj8VwjzEyn0Ay-nxA5fddxT8zMeRxfLFZk4SoiLF3HED5yoCtd0SDWaCqa2B0nP2YVwNpAaEmEo5upi4YA88agR6Fe84uIIGVrKVjbwYt5jcd','9ab99076eedd724ce0a4f7ab245f0ccd43bed6d6fdc86f53bfe66383906f569b','BDAMxHieOLdle_9iAhlaCLQ9ogpbT0nu3DN-X1o9wJDer2hMFtfZnyw7CniyzhFireapt935V3CJRRX72F1HPdM','8xbSbMxFddUDsG9JPxIQXg','2026-05-25 14:40:59','2026-05-25 14:40:59');
/*!40000 ALTER TABLE `visitor_push_subscriptions` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `visitor_visits`
--

DROP TABLE IF EXISTS `visitor_visits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `visitor_visits` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `project_id` bigint(20) NOT NULL,
  `visitor_id` bigint(20) NOT NULL,
  `location_id` bigint(20) NOT NULL,
  `visited_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_visit` (`visitor_id`,`location_id`),
  KEY `project_id` (`project_id`),
  KEY `location_id` (`location_id`),
  CONSTRAINT `1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
  CONSTRAINT `2` FOREIGN KEY (`visitor_id`) REFERENCES `visitors` (`id`),
  CONSTRAINT `3` FOREIGN KEY (`location_id`) REFERENCES `project_locations` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `visitor_visits`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `visitor_visits` WRITE;
/*!40000 ALTER TABLE `visitor_visits` DISABLE KEYS */;
INSERT INTO `visitor_visits` VALUES
(5,2,2,5,'2026-05-25 14:40:57'),
(6,2,2,6,'2026-05-25 14:41:10');
/*!40000 ALTER TABLE `visitor_visits` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `visitors`
--

DROP TABLE IF EXISTS `visitors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `visitors` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `project_id` bigint(20) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `consent_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_phone` (`project_id`,`phone`),
  CONSTRAINT `1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `visitors`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `visitors` WRITE;
/*!40000 ALTER TABLE `visitors` DISABLE KEYS */;
INSERT INTO `visitors` VALUES
(2,2,'01026854082','2026-05-25 14:40:57','2026-05-25 14:40:57'),
(3,2,'01026854052',NULL,'2026-05-25 14:43:12');
/*!40000 ALTER TABLE `visitors` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Dumping events for database 'tracker'
--
/*!50106 SET @save_time_zone= @@TIME_ZONE */ ;
/*!50106 DROP EVENT IF EXISTS `ev_daily_project_status_update` */;
DELIMITER ;;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;;
/*!50003 SET character_set_client  = utf8mb4 */ ;;
/*!50003 SET character_set_results = utf8mb4 */ ;;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;;
/*!50003 SET @saved_time_zone      = @@time_zone */ ;;
/*!50003 SET time_zone             = 'SYSTEM' */ ;;
/*!50106 CREATE*/ /*!50117 DEFINER=`tracker`@`%`*/ /*!50106 EVENT `ev_daily_project_status_update` ON SCHEDULE EVERY 1 DAY STARTS '2026-06-04 00:05:00' ON COMPLETION NOT PRESERVE ENABLE COMMENT '??? ?????? ??? ??? ???' DO CALL sp_update_project_statuses('event') */ ;;
/*!50003 SET time_zone             = @saved_time_zone */ ;;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;;
/*!50003 SET character_set_client  = @saved_cs_client */ ;;
/*!50003 SET character_set_results = @saved_cs_results */ ;;
/*!50003 SET collation_connection  = @saved_col_connection */ ;;
DELIMITER ;
/*!50106 SET TIME_ZONE= @save_time_zone */ ;

--
-- Dumping routines for database 'tracker'
--
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP FUNCTION IF EXISTS `fn_decrypt` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`tracker`@`%` FUNCTION `fn_decrypt`(p_value VARCHAR(512), p_key VARCHAR(64)) RETURNS text CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci
    NO SQL
    DETERMINISTIC
RETURN CAST(AES_DECRYPT(UNHEX(p_value), p_key) AS CHAR) ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP FUNCTION IF EXISTS `fn_encrypt` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`tracker`@`%` FUNCTION `fn_encrypt`(p_value TEXT, p_key VARCHAR(64)) RETURNS varchar(512) CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci
    NO SQL
    DETERMINISTIC
RETURN HEX(AES_ENCRYPT(p_value, p_key)) ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_update_project_statuses` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
DELIMITER ;;
CREATE DEFINER=`tracker`@`%` PROCEDURE `sp_update_project_statuses`(IN p_source VARCHAR(20))
BEGIN
  DECLARE v_started DATETIME DEFAULT NOW();
  DECLARE v_n1 INT DEFAULT 0;
  DECLARE v_n2 INT DEFAULT 0;
  DECLARE v_n3 INT DEFAULT 0;

  
  UPDATE projects
  SET status = 'started',
      started_at = COALESCE(started_at, NOW()),
      updated_at = NOW()
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
    v_started,
    NOW()
  );
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

-- Dump completed on 2026-06-03 22:18:04
