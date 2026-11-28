-- Migrasi: Menambahkan Full-Text Search pada kolom title dan content di tabel posts
USE `neoblog`;

-- Pastikan indeks tidak duplikat dengan drop if exists atau cek informasi skema
SET @index_exists = (
    SELECT COUNT(*) 
    FROM information_schema.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'posts' 
      AND INDEX_NAME = 'idx_posts_search'
);

SET @sql = IF(@index_exists = 0, 'ALTER TABLE posts ADD FULLTEXT INDEX idx_posts_search (title, content)', 'SELECT "Index already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
