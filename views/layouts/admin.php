<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="<?= Sanitizer::clean(CSRF::getToken()) ?>">
    <title><?= Sanitizer::clean($pageTitle ?? 'Dashboard CMS - NeoBlog') ?></title>
    <link rel="stylesheet" href="/assets/css/style.css">
</head>
<body class="admin-body">
    <header class="site-header admin-header">
        <div class="container navbar admin-navbar">
            <a href="/admin" class="brand">
                <span>Neo</span>Blog <span class="brand-badge">CMS</span>
            </a>

            <nav class="admin-nav" aria-label="Navigasi Admin">
                <a href="/admin" class="admin-nav-link <?= ($activeNav ?? '') === 'dashboard' ? 'is-active' : '' ?>">Dashboard</a>
                <a href="/admin/posts" class="admin-nav-link <?= ($activeNav ?? '') === 'posts' ? 'is-active' : '' ?>">Artikel</a>
                <a href="/admin/comments" class="admin-nav-link <?= ($activeNav ?? '') === 'comments' ? 'is-active' : '' ?>">Komentar</a>
                <a href="/" class="admin-nav-link">Lihat Blog</a>
            </nav>

            <div class="admin-topbar-actions">
                <span class="admin-user-badge">
                    <?= Sanitizer::clean($currentUser['full_name'] ?? $currentUser['username'] ?? 'Admin') ?>
                    <?php $role = (string)($currentUser['role'] ?? 'editor'); ?>
                    <span class="badge badge-role-<?= Sanitizer::clean($role) ?>"><?= Sanitizer::clean(ucfirst($role)) ?></span>
                </span>
                <button id="themeToggleBtn" type="button" class="theme-toggle-btn" aria-label="Toggle tema">
                    🌙 Mode Gelap
                </button>
                <form method="POST" action="/admin/logout" class="admin-logout-form">
                    <?= CSRF::field() ?>
                    <button type="submit" class="btn btn-secondary btn-sm">Keluar</button>
                </form>
            </div>
        </div>
    </header>

    <main class="main-content admin-main">
        <div class="container">
            <?php if (!empty($flashSuccess)): ?>
                <div class="alert alert-success" role="status"><?= Sanitizer::clean((string)$flashSuccess) ?></div>
            <?php endif; ?>
            <?php if (!empty($flashError)): ?>
                <div class="alert alert-danger" role="alert"><?= Sanitizer::clean((string)$flashError) ?></div>
            <?php endif; ?>

            <?php
            if (!empty($contentView) && file_exists($contentView)) {
                require $contentView;
            }
            ?>
        </div>
    </main>

    <footer class="site-footer">
        <div class="container">
            <p>&copy; <?= date('Y') ?> NeoBlog CMS. Dibangun dengan <strong>PHP Native</strong>, <strong>MySQL</strong>, dan <strong>Vanilla JS/CSS</strong>.</p>
        </div>
    </footer>

    <?php if (defined('PUBLIC_PATH') && file_exists(PUBLIC_PATH . '/assets/js/utils.js')): ?>
        <script src="/assets/js/utils.js"></script>
    <?php endif; ?>
    <script src="/assets/js/main.js"></script>
    <?php if (defined('PUBLIC_PATH') && file_exists(PUBLIC_PATH . '/assets/js/admin.js')): ?>
        <script src="/assets/js/admin.js"></script>
    <?php endif; ?>
</body>
</html>
