<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <?php if (class_exists('CSRF')): ?>
        <meta name="csrf-token" content="<?= htmlspecialchars(CSRF::getToken(), ENT_QUOTES, 'UTF-8') ?>">
    <?php endif; ?>
    <title><?= htmlspecialchars($pageTitle ?? $title ?? 'NeoBlog - Native PHP Blog Platform', ENT_QUOTES, 'UTF-8') ?></title>
    <link rel="stylesheet" href="/assets/css/style.css">
</head>
<body>
    <header class="site-header">
        <div class="container navbar">
            <a href="/" class="brand">
                <span>Neo</span>Blog
            </a>
            <ul class="nav-links">
                <li><a href="/">Beranda</a></li>
                <li>
                    <button id="searchOpenBtn" class="nav-search-btn" aria-label="Buka Pencarian Artikel">
                        <span>🔍 Cari...</span>
                        <kbd class="search-kbd">Ctrl K</kbd>
                    </button>
                </li>
                <li>
                    <button id="themeToggleBtn" class="theme-toggle-btn" aria-label="Toggle tema">
                        🌙 Mode Gelap
                    </button>
                </li>
            </ul>
        </div>
    </header>

    <main class="main-content">
        <div class="container">
            <?php
            // Muat view konten yang sesuai
            if (!empty($contentView) && file_exists($contentView)) {
                require $contentView;
            } elseif (isset($post)) {
                require VIEW_PATH . '/posts/detail.php';
            } else {
                require VIEW_PATH . '/posts/index.php';
            }
            ?>
        </div>
    </main>

    <footer class="site-footer">
        <div class="container">
            <p>&copy; <?= date('Y') ?> NeoBlog. Dibangun dengan <strong>PHP Native</strong>, <strong>MySQL</strong>, dan <strong>Vanilla JS/CSS</strong>.</p>
        </div>
    </footer>

    <!-- Modal Live Search -->
    <div id="searchModal" class="search-modal-backdrop" role="dialog" aria-modal="true" aria-label="Pencarian Artikel">
        <div class="search-dialog">
            <div class="search-input-wrapper">
                <span class="search-icon">🔍</span>
                <input type="text" id="searchInput" class="search-input" placeholder="Cari artikel berdasarkan judul atau konten..." autocomplete="off" spellcheck="false">
                <button type="button" id="searchCloseBtn" class="search-close-btn" aria-label="Tutup Pencarian">&times;</button>
            </div>
            <div id="searchResults" class="search-results-container">
                <div class="search-empty-state">Ketik kata kunci untuk mencari artikel...</div>
            </div>
            <div class="search-footer-hint">
                <span>Tekan <kbd class="search-kbd">↑</kbd> <kbd class="search-kbd">↓</kbd> untuk memilih</span>
                <span><kbd class="search-kbd">Enter</kbd> untuk buka, <kbd class="search-kbd">Esc</kbd> untuk tutup</span>
            </div>
        </div>
    </div>

    <script src="/assets/js/utils.js"></script>
    <script src="/assets/js/main.js"></script>
    <script src="/assets/js/comments.js"></script>
    <script src="/assets/js/search.js"></script>
</body>
</html>
