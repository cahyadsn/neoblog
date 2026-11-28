<?php
$statusTabs = [
    'all'       => 'Semua',
    'draft'     => 'Draf',
    'published' => 'Terbit',
    'archived'  => 'Diarsipkan',
];
$statusLabels = [
    'published' => 'Terbit',
    'draft'     => 'Draf',
    'archived'  => 'Diarsipkan',
];
$activeStatus = $currentStatus ?? 'all';
$search = $searchQuery ?? '';
?>

<section class="admin-page-header">
    <div>
        <h1>Kelola Artikel</h1>
        <p class="admin-subtitle">Kelola draf, penerbitan, dan arsip artikel NeoBlog.</p>
    </div>
    <div class="admin-quick-links">
        <a href="/admin/posts/create" class="btn btn-primary">+ Buat Artikel Baru</a>
    </div>
</section>

<div id="adminAjaxFeedback" class="alert" style="display: none;" role="status" aria-live="polite"></div>

<section class="admin-toolbar" aria-label="Filter dan Pencarian Artikel">
    <div class="filter-pills">
        <?php foreach ($statusTabs as $key => $label): ?>
            <?php
            $query = ['status' => $key];
            if ($search !== '') {
                $query['q'] = $search;
            }
            $href = '/admin/posts?' . http_build_query($query);
            $count = (int)($counts[$key] ?? 0);
            ?>
            <a href="<?= Sanitizer::clean($href) ?>" class="filter-pill <?= $activeStatus === $key ? 'is-active' : '' ?>">
                <?= Sanitizer::clean($label) ?> (<?= $count ?>)
            </a>
        <?php endforeach; ?>
    </div>

    <form method="GET" action="/admin/posts" class="admin-search-form">
        <input type="hidden" name="status" value="<?= Sanitizer::clean($activeStatus) ?>">
        <input
            type="search"
            name="q"
            class="form-control"
            value="<?= Sanitizer::clean($search) ?>"
            placeholder="Cari judul atau slug..."
            aria-label="Cari artikel"
        >
        <button type="submit" class="btn btn-secondary btn-sm">Cari</button>
        <?php if ($search !== ''): ?>
            <a href="/admin/posts?status=<?= urlencode($activeStatus) ?>" class="btn btn-secondary btn-sm">Reset</a>
        <?php endif; ?>
    </form>
</section>

<section class="admin-card">
    <?php if (empty($posts)): ?>
        <p class="admin-empty">
            Tidak ada artikel yang cocok dengan filter saat ini.
            <a href="/admin/posts/create">Buat artikel baru</a>.
        </p>
    <?php else: ?>
        <div class="table-responsive">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Judul</th>
                        <th>Kategori</th>
                        <th>Penulis</th>
                        <th>Status</th>
                        <th>Tanggal</th>
                        <th>Aksi</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($posts as $item): ?>
                        <?php
                        $postId = (int)($item['id'] ?? 0);
                        $status = (string)($item['status'] ?? 'draft');
                        $badgeLabel = $statusLabels[$status] ?? ucfirst($status);
                        $dateVal = ($status === 'published' && !empty($item['published_at']))
                            ? $item['published_at']
                            : ($item['updated_at'] ?? $item['created_at'] ?? null);
                        $dateFormatted = !empty($dateVal) ? date('d M Y, H:i', strtotime((string)$dateVal)) : '-';
                        ?>
                        <tr data-post-id="<?= $postId ?>">
                            <td>
                                <strong><?= Sanitizer::clean((string)($item['title'] ?? '')) ?></strong>
                                <span class="table-subtext">
                                    /post/<?= Sanitizer::clean((string)($item['slug'] ?? '')) ?>
                                    <?php if ($status === 'published' && !empty($item['slug'])): ?>
                                        · <a href="/post/<?= urlencode((string)$item['slug']) ?>" target="_blank" rel="noopener noreferrer">Pratinjau</a>
                                    <?php endif; ?>
                                </span>
                            </td>
                            <td><?= Sanitizer::clean((string)($item['category_name'] ?? 'Umum')) ?></td>
                            <td><?= Sanitizer::clean((string)($item['author_name'] ?? 'Admin')) ?></td>
                            <td>
                                <span class="badge badge-<?= Sanitizer::clean($status) ?>" data-status-badge>
                                    <?= Sanitizer::clean($badgeLabel) ?>
                                </span>
                            </td>
                            <td><?= Sanitizer::clean($dateFormatted) ?></td>
                            <td>
                                <div class="table-actions">
                                    <a href="/admin/posts/<?= $postId ?>/edit" class="btn btn-secondary btn-sm">Sunting</a>

                                    <?php if ($status !== 'published'): ?>
                                        <form method="POST" action="/admin/posts/<?= $postId ?>/status" class="inline-form js-post-status-form">
                                            <?= CSRF::field() ?>
                                            <input type="hidden" name="status" value="published">
                                            <button type="submit" class="btn btn-success btn-sm">Terbitkan</button>
                                        </form>
                                    <?php endif; ?>

                                    <?php if ($status !== 'draft'): ?>
                                        <form method="POST" action="/admin/posts/<?= $postId ?>/status" class="inline-form js-post-status-form">
                                            <?= CSRF::field() ?>
                                            <input type="hidden" name="status" value="draft">
                                            <button type="submit" class="btn btn-secondary btn-sm">Jadikan Draf</button>
                                        </form>
                                    <?php endif; ?>

                                    <?php if ($status !== 'archived'): ?>
                                        <form method="POST" action="/admin/posts/<?= $postId ?>/status" class="inline-form js-post-status-form">
                                            <?= CSRF::field() ?>
                                            <input type="hidden" name="status" value="archived">
                                            <button type="submit" class="btn btn-warning btn-sm">Arsipkan</button>
                                        </form>
                                    <?php endif; ?>

                                    <form
                                        method="POST"
                                        action="/admin/posts/<?= $postId ?>/delete"
                                        class="inline-form js-delete-form"
                                        data-confirm="Yakin ingin menghapus artikel ini? Tindakan ini tidak dapat dibatalkan."
                                    >
                                        <?= CSRF::field() ?>
                                        <button type="submit" class="btn btn-danger btn-sm">Hapus</button>
                                    </form>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    <?php endif; ?>
</section>
