-- ===================================================
-- Data Awal (Seeders) NeoBlog
-- ===================================================

USE `neoblog`;

-- Akun Pengguna Default (Password: admin123, editor123, author123)
-- Hash dibuat dengan password_hash(..., PASSWORD_BCRYPT)
INSERT INTO `users` (`id`, `username`, `email`, `password_hash`, `full_name`, `role`)
VALUES
(1, 'admin', 'admin@neoblog.local', '$2y$10$vAhFIEizJyP/on.8uzRjA.gVRFBfmWsxRuYyn46UuzXA6j1D/0WRO', 'Administrator NeoBlog', 'admin'),
(2, 'editor', 'editor@neoblog.local', '$2y$10$.P.eYBFC/6lbZKB1HHfNBew/EbSkr3seg0oDNWwBPZ7aW/PooHQXO', 'Editor NeoBlog', 'editor'),
(3, 'author', 'author@neoblog.local', '$2y$10$jO0cOFpmJ0XwoqXNIVxO4OpUpYwMdax0XUZ.CNA2G1QkmPYQWN7S2', 'Author NeoBlog', 'author')
ON DUPLICATE KEY UPDATE
    `password_hash` = VALUES(`password_hash`),
    `full_name` = VALUES(`full_name`),
    `role` = VALUES(`role`);

-- Kategori Default
INSERT INTO `categories` (`id`, `name`, `slug`, `description`)
VALUES 
(1, 'Teknologi', 'teknologi', 'Artikel seputar pemrograman, web dev, dan sistem perangkat lunak'),
(2, 'Kecerdasan Buatan', 'kecerdasan-buatan', 'Wawasan seputar AI, agen pintar, dan automasi'),
(3, 'Tutorial', 'tutorial', 'Panduan teknis langkah demi langkah implementasi praktis')
ON DUPLICATE KEY UPDATE `name` = `name`;

-- Artikel Contoh (Published, Draft, dan Archived)
INSERT INTO `posts` (`id`, `author_id`, `category_id`, `title`, `slug`, `excerpt`, `content`, `reading_time`, `status`, `published_at`)
VALUES
(
    1, 1, 1,
    'Membangun Web Modern dengan PHP Native dan Vanilla Web Stack',
    'membangun-web-modern-php-native-vanilla-stack',
    'Menjelajahi keunggulan performa, kesederhanaan, dan kebebasan kontrol saat membangun aplikasi web menggunakan PHP murni dan JavaScript tanpa framework.',
    '<p>Dalam era di mana framework JavaScript dan PHP semakin kompleks dengan ratusan dependensi npm atau vendor, membangun aplikasi web menggunakan <strong>PHP Native</strong> dan <strong>Vanilla CSS/JS</strong> menawarkan angin segar dalam hal kecepatan dan pemahaman mendalam atas mekanisme web dasar.</p><h3>Kenapa Memilih Native?</h3><ul><li><strong>Tanpa Over-engineering:</strong> Tidak ada siklus build rumit yang memakan waktu lama.</li><li><strong>Kecepatan Eksekusi Maksimal:</strong> Waktu respons server di bawah 20 milidetik.</li><li><strong>Portabilitas Tinggi:</strong> Berjalan di hampir semua hosting web tanpa konfigurasi aneh.</li></ul><p>Dengan menerapkan prinsip arsitektur yang rapi seperti pemisahan kontrol dan model data, aplikasi native tetap bersih, terukur, dan mudah dirawat.</p>',
    4, 'published', NOW()
),
(
    2, 1, 2,
    'Evolusi Multi-Agent Systems dalam Rekayasa Perangkat Lunak',
    'evolusi-multi-agent-systems-rekayasa-perangkat-lunak',
    'Bagaimana agen otonom khusus berkolaborasi layaknya tim pengembang manusia untuk merancang, menguji, dan merilis sistem digital.',
    '<p>Kolaborasi antar agen AI (Multi-Agent Systems) bukan lagi fiksi ilmiah. Dengan membagi tanggung jawab kepada subagen yang memiliki keahlian spesifik—seperti arsitek database, pengembang backend, desainer antarmuka, dan penguji kode—proses pengembangan perangkat lunak menjadi jauh lebih sistematis.</p><p>Setiap agen dapat memvalidasi artefak satu sama lain, meminimalkan halusinasi, dan memastikan standar keamanan kode terpenuhi sebelum kode diluncurkan ke tahap produksi.</p>',
    5, 'published', NOW()
),
(
    3, 2, 3,
    'Panduan Praktis Optimasi Query MySQL untuk Aplikasi Skala Menengah',
    'panduan-praktis-optimasi-query-mysql',
    'Draf catatan teknis mengenai penggunaan EXPLAIN, composite index, dan penghindaran N+1 query pada aplikasi PHP native.',
    '<p>Artikel ini masih dalam tahap penyusunan draf. Pembahasan mencakup strategi indexing, penggunaan prepared statements yang efisien, serta pemantauan slow query log.</p>',
    6, 'draft', NULL
),
(
    4, 1, 1,
    'Catatan Rilis Arsitektur Awal NeoBlog v1.0',
    'catatan-rilis-arsitektur-awal-neoblog-v1',
    'Arsip dokumentasi rilis versi awal NeoBlog sebelum pembaruan Dashboard CMS.',
    '<p>Dokumentasi ini diarsipkan sebagai referensi historis perancangan struktur dasar NeoBlog menggunakan PHP Native dan Vanilla Web Stack.</p>',
    3, 'archived', NOW()
)
ON DUPLICATE KEY UPDATE `title` = `title`;

-- Komentar Contoh (Disetujui dan Menunggu Moderasi)
INSERT INTO `comments` (`id`, `post_id`, `parent_id`, `author_name`, `author_email`, `comment_text`, `is_approved`, `is_bot_reply`, `is_admin_reply`, `created_at`)
VALUES
(1, 1, NULL, 'Budi Santoso', 'budi@example.com', 'Tulisan yang sangat membuka wawasan! Pendekatan vanilla memang membuat kode jauh lebih mudah dipahami secara menyeluruh.', 1, 0, 0, NOW()),
(2, 1, 1, 'NeoBlog Assistant', 'bot@neoblog.local', 'Terima kasih atas apresiasinya, Budi! Memahami dasar native juga membuat kita lebih bijak saat memilih framework di kemudian hari.', 1, 1, 0, NOW()),
(3, 1, NULL, 'Siti Rahma', 'siti@example.com', 'Apakah ada rencana menambahkan dukungan moderasi komentar dan pengelolaan draf langsung dari dashboard admin?', 0, 0, 0, NOW()),
(4, 2, NULL, 'Andi Wijaya', 'andi@example.com', 'Sangat menarik melihat bagaimana sistem multi-agen menjaga kualitas kode. Mohon tinjau komentar saya ini.', 0, 0, 0, NOW())
ON DUPLICATE KEY UPDATE `author_name` = `author_name`;
