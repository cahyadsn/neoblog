-- ===================================================
-- Skema Database NeoBlog (MySQL 8.0+ / MariaDB)
-- DDL Idempotent dengan Indexing & Foreign Keys
-- ===================================================

CREATE DATABASE IF NOT EXISTS `neoblog` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `neoblog`;

-- Tabel Pengguna (Admin & Penulis)
CREATE TABLE IF NOT EXISTS `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(50) NOT NULL UNIQUE,
    `email` VARCHAR(100) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `full_name` VARCHAR(100) NOT NULL,
    `role` ENUM('admin', 'editor', 'author') DEFAULT 'author',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabel Kategori
CREATE TABLE IF NOT EXISTS `categories` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(100) NOT NULL UNIQUE,
    `description` VARCHAR(255) NULL,
    INDEX `idx_categories_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabel Artikel / Posts
CREATE TABLE IF NOT EXISTS `posts` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `author_id` INT NOT NULL,
    `category_id` INT NULL,
    `title` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(255) NOT NULL UNIQUE,
    `excerpt` TEXT NULL,
    `content` LONGTEXT NOT NULL,
    `reading_time` INT DEFAULT 3,
    `status` ENUM('draft', 'published', 'archived') DEFAULT 'published',
    `published_at` TIMESTAMP NULL DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL,
    INDEX `idx_posts_slug` (`slug`),
    INDEX `idx_posts_status_published` (`status`, `published_at`),
    INDEX `idx_posts_author` (`author_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabel Komentar (Mendukung Threading/Nested Comments)
CREATE TABLE IF NOT EXISTS `comments` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `post_id` INT NOT NULL,
    `parent_id` INT NULL,
    `author_name` VARCHAR(100) NOT NULL,
    `author_email` VARCHAR(100) NOT NULL,
    `comment_text` TEXT NOT NULL,
    `is_approved` TINYINT(1) DEFAULT 1,
    `is_bot_reply` TINYINT(1) DEFAULT 0,
    `is_admin_reply` TINYINT(1) DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`parent_id`) REFERENCES `comments`(`id`) ON DELETE CASCADE,
    INDEX `idx_comments_post` (`post_id`, `created_at`),
    INDEX `idx_comments_parent` (`parent_id`),
    INDEX `idx_comments_approved` (`is_approved`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
