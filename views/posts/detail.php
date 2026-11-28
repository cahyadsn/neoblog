<article class="post-detail">
    <header class="post-detail-header">
        <div class="post-meta" style="margin-bottom: 1rem;">
            <span class="post-category"><?= htmlspecialchars($post['category_name'] ?? 'Umum', ENT_QUOTES, 'UTF-8') ?></span>
            <span>•</span>
            <span><?= !empty($post['published_at']) ? 'Dipublikasikan pada ' . date('d F Y', strtotime((string)$post['published_at'])) : 'Belum dipublikasikan' ?></span>
            <span>•</span>
            <span><?= (int)$post['reading_time'] ?> menit baca</span>
            <span>•</span>
            <span>Penulis: <?= htmlspecialchars($post['author_name'] ?? 'Admin', ENT_QUOTES, 'UTF-8') ?></span>
        </div>
        <h1><?= htmlspecialchars($post['title'], ENT_QUOTES, 'UTF-8') ?></h1>
    </header>

    <div class="post-detail-content">
        <!-- Konten HTML artikel terverifikasi -->
        <?= $post['content'] ?>
    </div>

    <!-- Area Komentar -->
    <section class="comments-section">
        <h3>Tinggalkan Komentar</h3>
        <p style="color: var(--text-muted); margin-bottom: 1.5rem; font-size: 0.95rem;">Mari berdiskusi dengan sopan dan konstruktif.</p>

        <div class="comment-form-container">
            <form id="commentForm" method="POST" action="/api/comments">
                <?= CSRF::field() ?>
                <input type="hidden" name="post_id" value="<?= (int)$post['id'] ?>">
                <input type="hidden" name="parent_id" id="commentParentId" value="">

                <div id="replyingToBanner" class="replying-to-banner" style="display: none;">
                    <span>Membalas komentar <strong id="replyingToName"></strong></span>
                    <button type="button" id="cancelReplyBtn" class="btn btn-secondary btn-sm">Batal</button>
                </div>

                <div class="form-group">
                    <label for="author_name">Nama Anda</label>
                    <input type="text" id="author_name" name="author_name" class="form-control" placeholder="Contoh: Budi Santoso" required>
                </div>

                <div class="form-group">
                    <label for="author_email">Alamat Email (tidak akan dipublikasikan)</label>
                    <input type="email" id="author_email" name="author_email" class="form-control" placeholder="budi@example.com" required>
                </div>

                <div class="form-group">
                    <label for="comment_text">Komentar atau Pertanyaan</label>
                    <textarea id="comment_text" name="comment_text" class="form-control" rows="4" placeholder="Tulis tanggapan Anda di sini..." required></textarea>
                </div>

                <button type="submit" class="btn btn-primary">Kirim Komentar</button>
                <div id="commentFeedback" style="display: none;"></div>
            </form>
        </div>

        <h3 id="commentsCountHeading">Diskusi Komunitas (<span id="commentsCount"><?= count($comments ?? []) ?></span>)</h3>
        <div id="commentsList" class="comments-list" style="margin-top: 1rem;">
            <?php if (empty($comments)): ?>
                <p class="empty-comments" style="color: var(--text-muted);">Belum ada komentar untuk artikel ini. Jadilah yang pertama berkomentar!</p>
            <?php else: ?>
                <?php
                $commentsById = [];
                foreach ($comments as $item) {
                    $itemId = isset($item['id']) ? (int)$item['id'] : 0;
                    if ($itemId > 0) {
                        $commentsById[$itemId] = $item;
                    }
                }

                $rootComments = [];
                $childrenByParent = [];
                foreach ($comments as $item) {
                    $itemId = isset($item['id']) ? (int)$item['id'] : 0;
                    $parentId = (isset($item['parent_id']) && $item['parent_id'] !== '' && $item['parent_id'] !== null)
                        ? (int)$item['parent_id']
                        : null;

                    if ($itemId > 0 && $parentId !== null && $parentId !== $itemId && isset($commentsById[$parentId])) {
                        $childrenByParent[$parentId][] = $item;
                    } else {
                        $rootComments[] = $item;
                    }
                }

                $visited = [];
                $renderCommentNode = function (array $c, int $depth = 0) use (&$renderCommentNode, &$childrenByParent, &$visited): void {
                    $cid = isset($c['id']) ? (int)$c['id'] : 0;
                    if ($cid > 0) {
                        if (isset($visited[$cid])) {
                            return;
                        }
                        $visited[$cid] = true;
                    }

                    $parentIdVal = (isset($c['parent_id']) && $c['parent_id'] !== '' && $c['parent_id'] !== null)
                        ? (int)$c['parent_id']
                        : '';
                    $isAdminReply = !empty($c['is_admin_reply']);
                    $isBotReply = !empty($c['is_bot_reply']);
                    $authorName = (string)($c['author_name'] ?? '');
                    $commentText = (string)($c['comment_text'] ?? '');
                    $createdAt = $c['created_at'] ?? null;
                    $dateFormatted = !empty($createdAt) ? date('d M Y, H:i', strtotime((string)$createdAt)) : '';

                    $classes = ['comment-item'];
                    if ($depth > 0) {
                        $classes[] = 'comment-reply';
                        $cappedDepth = min($depth, 3);
                        if ($cappedDepth >= 2) {
                            $classes[] = 'depth-' . $cappedDepth;
                        }
                    }
                    if ($isAdminReply) {
                        $classes[] = 'admin-reply';
                    } elseif ($isBotReply) {
                        $classes[] = 'bot-reply';
                    }
                    ?>
                    <div
                        <?= $cid > 0 ? 'id="comment-' . $cid . '"' : '' ?>
                        class="<?= implode(' ', $classes) ?>"
                        data-comment-id="<?= $cid > 0 ? $cid : '' ?>"
                        data-parent-id="<?= $parentIdVal !== '' ? (int)$parentIdVal : '' ?>"
                        data-depth="<?= $depth ?>"
                    >
                        <div class="comment-header">
                            <span class="comment-author">
                                <?= Sanitizer::clean($authorName) ?>
                                <?php if ($isAdminReply): ?>
                                    <span class="badge badge-admin">Admin</span>
                                <?php elseif ($isBotReply): ?>
                                    <span class="badge">Assistant</span>
                                <?php endif; ?>
                            </span>
                            <span class="comment-date"><?= Sanitizer::clean($dateFormatted) ?></span>
                        </div>
                        <div class="comment-body">
                            <?= nl2br(Sanitizer::clean($commentText)) ?>
                        </div>
                        <?php if ($cid > 0): ?>
                            <div class="comment-actions">
                                <button
                                    type="button"
                                    class="reply-btn"
                                    data-comment-id="<?= $cid ?>"
                                    data-author="<?= Sanitizer::clean($authorName) ?>"
                                >Balas</button>
                            </div>
                        <?php endif; ?>
                    </div>
                    <?php
                    if ($cid > 0 && !empty($childrenByParent[$cid])) {
                        foreach ($childrenByParent[$cid] as $child) {
                            $renderCommentNode($child, $depth + 1);
                        }
                    }
                };

                foreach ($rootComments as $rootComment) {
                    $renderCommentNode($rootComment, 0);
                }

                foreach ($comments as $item) {
                    $cid = isset($item['id']) ? (int)$item['id'] : 0;
                    if ($cid > 0 && !isset($visited[$cid])) {
                        $renderCommentNode($item, 0);
                    }
                }
                ?>
            <?php endif; ?>
        </div>
    </section>
</article>
