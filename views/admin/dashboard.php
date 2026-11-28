<section class="admin-page-header">
    <div>
        <h1>Dashboard CMS</h1>
        <p class="admin-subtitle">
            Selamat datang, <strong><?= Sanitizer::clean($currentUser['full_name'] ?? $currentUser['username'] ?? 'Admin') ?></strong>
            (<?= Sanitizer::clean(ucfirst((string)($currentUser['role'] ?? 'editor'))) ?>).
        </p>
    </div>
    <div class="admin-quick-links">
        <a href="/admin/posts" class="btn btn-primary">Kelola Artikel</a>
        <a href="/admin/comments" class="btn btn-secondary">Moderasi Komentar</a>
    </div>
</section>

<section class="stats-grid" aria-label="Ringkasan Statistik">
    <a href="/admin/posts" class="stat-card">
        <span class="stat-card-label">Total Artikel</span>
        <span class="stat-card-value"><?= (int)($postStats['total'] ?? 0) ?></span>
        <span class="stat-card-meta">Semua status artikel</span>
    </a>
    <a href="/admin/posts?status=published" class="stat-card stat-card--success">
        <span class="stat-card-label">Terbit</span>
        <span class="stat-card-value"><?= (int)($postStats['published'] ?? 0) ?></span>
        <span class="stat-card-meta">Tampil di blog publik</span>
    </a>
    <a href="/admin/posts?status=draft" class="stat-card stat-card--draft">
        <span class="stat-card-label">Draf</span>
        <span class="stat-card-value"><?= (int)($postStats['draft'] ?? 0) ?></span>
        <span class="stat-card-meta">Menunggu penyuntingan</span>
    </a>
    <a href="/admin/posts?status=archived" class="stat-card">
        <span class="stat-card-label">Diarsipkan</span>
        <span class="stat-card-value"><?= (int)($postStats['archived'] ?? 0) ?></span>
        <span class="stat-card-meta">Tidak tampil di publik</span>
    </a>
    <a href="/admin/comments?status=pending" class="stat-card stat-card--warning">
        <span class="stat-card-label">Komentar Menunggu</span>
        <span class="stat-card-value"><?= (int)($commentStats['pending'] ?? 0) ?></span>
        <span class="stat-card-meta">Perlu moderasi</span>
    </a>
    <a href="/admin/comments?status=approved" class="stat-card stat-card--success">
        <span class="stat-card-label">Komentar Disetujui</span>
        <span class="stat-card-value"><?= (int)($commentStats['approved'] ?? 0) ?></span>
        <span class="stat-card-meta">Aktif di diskusi</span>
    </a>
</section>

<section class="admin-dashboard-grid">
    <div class="admin-card">
        <div class="admin-card-header">
            <h2>Draf Artikel Terbaru</h2>
            <a href="/admin/posts?status=draft" class="btn btn-secondary btn-sm">Lihat Semua</a>
        </div>
        <?php if (empty($recentDrafts)): ?>
            <p class="admin-empty">Belum ada draf artikel saat ini.</p>
        <?php else: ?>
            <div class="table-responsive">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Judul</th>
                            <th>Kategori</th>
                            <th>Penulis</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($recentDrafts as $draft): ?>
                            <tr>
                                <td>
                                    <strong><?= Sanitizer::clean((string)($draft['title'] ?? '')) ?></strong>
                                </td>
                                <td><?= Sanitizer::clean((string)($draft['category_name'] ?? 'Umum')) ?></td>
                                <td><?= Sanitizer::clean((string)($draft['author_name'] ?? 'Admin')) ?></td>
                                <td><span class="badge badge-draft">Draf</span></td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        <?php endif; ?>
    </div>

    <div class="admin-card">
        <div class="admin-card-header">
            <h2>Komentar Menunggu Moderasi</h2>
            <a href="/admin/comments?status=pending" class="btn btn-secondary btn-sm">Moderasi</a>
        </div>
        <?php if (empty($pendingComments)): ?>
            <p class="admin-empty">Tidak ada komentar yang menunggu moderasi.</p>
        <?php else: ?>
            <div class="table-responsive">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Pengirim</th>
                            <th>Komentar</th>
                            <th>Artikel</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($pendingComments as $comment): ?>
                            <?php
                            $rawComment = (string)($comment['comment_text'] ?? '');
                            $excerptComment = function_exists('mb_strimwidth')
                                ? mb_strimwidth($rawComment, 0, 80, '...')
                                : (strlen($rawComment) > 80 ? substr($rawComment, 0, 77) . '...' : $rawComment);
                            ?>
                            <tr>
                                <td><?= Sanitizer::clean((string)($comment['author_name'] ?? '')) ?></td>
                                <td><?= Sanitizer::clean($excerptComment) ?></td>
                                <td><?= Sanitizer::clean((string)($comment['post_title'] ?? '')) ?></td>
                                <td><span class="badge badge-pending">Menunggu</span></td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        <?php endif; ?>
    </div>
</section>
