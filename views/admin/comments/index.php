<?php
$statusTabs = [
    'all'      => 'Semua',
    'pending'  => 'Menunggu / Tersembunyi',
    'approved' => 'Disetujui',
];
$activeStatus = $currentStatus ?? 'all';
$filterPostId = $postId ?? null;
?>

<section class="admin-page-header">
    <div>
        <h1>Moderasi Komentar</h1>
        <p class="admin-subtitle">Tinjau, setujui, sembunyikan, balas sebagai admin, atau hapus komentar pembaca.</p>
    </div>
    <div class="admin-quick-links">
        <?php if (!empty($filterPostId)): ?>
            <a href="/admin/comments?status=<?= urlencode($activeStatus) ?>" class="btn btn-secondary">Tampilkan Semua Artikel</a>
        <?php endif; ?>
        <a href="/admin" class="btn btn-secondary">&larr; Dashboard</a>
    </div>
</section>

<div id="adminAjaxFeedback" class="alert" style="display: none;" role="status" aria-live="polite"></div>

<section class="admin-toolbar" aria-label="Filter Status Komentar">
    <div class="filter-pills">
        <?php foreach ($statusTabs as $key => $label): ?>
            <?php
            $query = ['status' => $key];
            if (!empty($filterPostId)) {
                $query['post_id'] = (int)$filterPostId;
            }
            $href = '/admin/comments?' . http_build_query($query);
            $count = (int)($counts[$key] ?? 0);
            ?>
            <a href="<?= Sanitizer::clean($href) ?>" class="filter-pill <?= $activeStatus === $key ? 'is-active' : '' ?>">
                <?= Sanitizer::clean($label) ?> (<span data-filter-count="<?= Sanitizer::clean($key) ?>"><?= $count ?></span>)
            </a>
        <?php endforeach; ?>
    </div>
</section>

<section class="admin-card">
    <?php if (empty($comments)): ?>
        <p class="admin-empty">Tidak ada komentar pada filter saat ini.</p>
    <?php else: ?>
        <div class="table-responsive">
            <table class="admin-table" id="commentsModerationTable">
                <thead>
                    <tr>
                        <th>Pengirim</th>
                        <th>Komentar</th>
                        <th>Artikel</th>
                        <th>Status</th>
                        <th>Tanggal</th>
                        <th>Aksi</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($comments as $item): ?>
                        <?php
                        $commentId = (int)($item['id'] ?? 0);
                        $parentId = !empty($item['parent_id']) ? (int)$item['parent_id'] : 0;
                        $isApproved = (int)($item['is_approved'] ?? 0) === 1;
                        $isAdminReply = !empty($item['is_admin_reply']);
                        $isBotReply = !empty($item['is_bot_reply']);
                        $authorName = (string)($item['author_name'] ?? 'Anonim');
                        $authorEmail = (string)($item['author_email'] ?? '');
                        $postTitle = (string)($item['post_title'] ?? 'Artikel');
                        $postSlug = (string)($item['post_slug'] ?? '');
                        $postStatus = (string)($item['post_status'] ?? 'published');
                        $parentAuthorName = (string)($item['parent_author_name'] ?? '');
                        $createdAt = $item['created_at'] ?? null;
                        $dateFormatted = !empty($createdAt) ? date('d M Y, H:i', strtotime((string)$createdAt)) : '-';
                        ?>
                        <tr
                            data-comment-id="<?= $commentId ?>"
                            data-parent-id="<?= $parentId > 0 ? $parentId : '' ?>"
                            data-status="<?= $isApproved ? 'approved' : 'pending' ?>"
                        >
                            <td>
                                <strong><?= Sanitizer::clean($authorName) ?></strong>
                                <?php if ($isAdminReply): ?>
                                    <span class="badge badge-admin">Admin</span>
                                <?php elseif ($isBotReply): ?>
                                    <span class="badge badge-bot">Assistant</span>
                                <?php endif; ?>
                                <?php if ($authorEmail !== ''): ?>
                                    <span class="table-subtext"><?= Sanitizer::clean($authorEmail) ?></span>
                                <?php endif; ?>
                            </td>
                            <td>
                                <?php if ($parentId > 0): ?>
                                    <span class="comment-parent-indicator">
                                        Balasan untuk #<?= $parentId ?><?= $parentAuthorName !== '' ? ' (' . Sanitizer::clean($parentAuthorName) . ')' : '' ?>
                                    </span>
                                <?php endif; ?>
                                <div class="comment-moderation-text"><?= nl2br(Sanitizer::clean((string)($item['comment_text'] ?? ''))) ?></div>
                            </td>
                            <td>
                                <strong><?= Sanitizer::clean($postTitle) ?></strong>
                                <?php if ($postSlug !== ''): ?>
                                    <span class="table-subtext">
                                        <?php if ($postStatus === 'published'): ?>
                                            <a href="/post/<?= urlencode($postSlug) ?>" target="_blank" rel="noopener noreferrer">/post/<?= Sanitizer::clean($postSlug) ?></a>
                                        <?php else: ?>
                                            /post/<?= Sanitizer::clean($postSlug) ?> (<?= Sanitizer::clean($postStatus) ?>)
                                        <?php endif; ?>
                                    </span>
                                <?php endif; ?>
                            </td>
                            <td>
                                <span class="badge <?= $isApproved ? 'badge-approved' : 'badge-pending' ?>" data-status-badge>
                                    <?= $isApproved ? 'Disetujui' : 'Menunggu' ?>
                                </span>
                            </td>
                            <td><?= Sanitizer::clean($dateFormatted) ?></td>
                            <td>
                                <div class="table-actions">
                                    <?php if (!$isApproved): ?>
                                        <form method="POST" action="/admin/comments/<?= $commentId ?>/approve" class="inline-form js-comment-moderate-form" data-action="approve">
                                            <?= CSRF::field() ?>
                                            <button type="submit" class="btn btn-success btn-sm">Setujui</button>
                                        </form>
                                    <?php else: ?>
                                        <form method="POST" action="/admin/comments/<?= $commentId ?>/hide" class="inline-form js-comment-moderate-form" data-action="hide">
                                            <?= CSRF::field() ?>
                                            <button type="submit" class="btn btn-warning btn-sm">Sembunyikan</button>
                                        </form>
                                    <?php endif; ?>

                                    <form
                                        method="POST"
                                        action="/admin/comments/<?= $commentId ?>/delete"
                                        class="inline-form js-comment-delete-form"
                                        data-confirm="Yakin ingin menghapus komentar ini beserta seluruh balasannya?"
                                    >
                                        <?= CSRF::field() ?>
                                        <button type="submit" class="btn btn-danger btn-sm">Hapus</button>
                                    </form>
                                </div>

                                <details class="admin-reply-details">
                                    <summary class="btn btn-secondary btn-sm">Balas</summary>
                                    <form method="POST" action="/admin/comments/<?= $commentId ?>/reply" class="admin-reply-form js-comment-reply-form">
                                        <?= CSRF::field() ?>
                                        <textarea
                                            name="comment_text"
                                            class="form-control"
                                            rows="2"
                                            placeholder="Tulis balasan resmi admin..."
                                            required
                                        ></textarea>
                                        <button type="submit" class="btn btn-primary btn-sm">Kirim Balasan</button>
                                    </form>
                                </details>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    <?php endif; ?>
</section>
