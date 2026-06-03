-- 프로젝트 객관식 퀴즈 등록 기능
-- - project_quizzes: 문제(질문) + 단일/다중 선택 여부
-- - project_quiz_choices: 보기들과 정답 여부

USE tracker;

CREATE TABLE IF NOT EXISTS project_quizzes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  question VARCHAR(500) NOT NULL,
  choice_type ENUM('single', 'multi') NOT NULL DEFAULT 'single',
  display_seq INT NOT NULL,
  disabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_project (project_id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS project_quiz_choices (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  quiz_id BIGINT NOT NULL,
  choice_text VARCHAR(500) NOT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  display_seq INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_quiz (quiz_id),
  FOREIGN KEY (quiz_id) REFERENCES project_quizzes(id) ON DELETE CASCADE
);
