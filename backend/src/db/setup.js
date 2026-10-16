import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
dotenv.config();

const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'newtonite_ops',
  multipleStatements: true
};
const connection = await mysql.createConnection(config);
await connection.query(`
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('ADMIN','MANAGER','LEAD','MEMBER') NOT NULL DEFAULT 'MEMBER',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS teams (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS team_members (
  team_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (team_id, user_id),
  CONSTRAINT fk_tm_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_tm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS work_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  type ENUM('INCIDENT','CUSTOMER_ISSUE','PAYMENT','COMPLIANCE','TASK') NOT NULL DEFAULT 'TASK',
  status ENUM('OPEN','IN_PROGRESS','AWAITING_APPROVAL','BLOCKED','RESOLVED','CLOSED') NOT NULL DEFAULT 'OPEN',
  priority ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  team_id BIGINT UNSIGNED NOT NULL,
  assignee_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  due_at DATETIME NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_wi_team FOREIGN KEY (team_id) REFERENCES teams(id),
  CONSTRAINT fk_wi_assignee FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_wi_creator FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_wi_team_status (team_id, status),
  INDEX idx_wi_priority (priority),
  INDEX idx_wi_assignee (assignee_id),
  INDEX idx_wi_updated (updated_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS comments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  work_item_id BIGINT UNSIGNED NOT NULL,
  author_id BIGINT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_comment_item FOREIGN KEY (work_item_id) REFERENCES work_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_comment_author FOREIGN KEY (author_id) REFERENCES users(id),
  INDEX idx_comments_item (work_item_id, created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  work_item_id BIGINT UNSIGNED NOT NULL,
  actor_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(60) NOT NULL,
  details JSON NULL,
  summary VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_activity_item FOREIGN KEY (work_item_id) REFERENCES work_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_activity_actor FOREIGN KEY (actor_id) REFERENCES users(id),
  INDEX idx_activity_item (work_item_id, created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  idem_key VARCHAR(120) NOT NULL,
  response_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_idem_user_key (user_id, idem_key),
  CONSTRAINT fk_idem_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
`);
await connection.end();
console.log('Database schema created/verified.');
