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

    <script src="/assets/js/utils.js"></script>
    <script src="/assets/js/main.js"></script>
    <script src="/assets/js/comments.js"></script>
</body>
</html>
