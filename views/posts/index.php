<section class="hero">
    <h1>Wawasan, Kode, & Kebebasan Web</h1>
    <p>Aplikasi blog modern tanpa beban framework luar. Cepat, tangguh, dan digerakkan oleh kolaborasi sistem multi-agen otonom.</p>
</section>

<?php if (!empty($dbError)): ?>
    <div style="background: #fee2e2; border: 1px solid #f87171; color: #991b1b; padding: 1rem; border-radius: 8px; margin-bottom: 2rem;">
        <strong>Perhatian Database:</strong> <?= htmlspecialchars($dbError, ENT_QUOTES, 'UTF-8') ?>
        <p style="margin-top: 0.5rem; font-size: 0.9rem;">Pastikan MySQL aktif dan skema <code>database/schema.sql</code> telah dieksekusi.</p>
    </div>
<?php endif; ?>

<section class="posts-section">
    <?php if (empty($posts)): ?>
        <p style="text-align: center; color: var(--text-muted); padding: 3rem 0;">Belum ada artikel yang dipublikasikan. Jalankan <code>php scripts/daily_content.php</code> untuk membuat artikel pertama!</p>
    <?php else: ?>
        <div class="posts-grid">
            <?php foreach ($posts as $item): ?>
                <article class="post-card">
                    <div>
                        <div class="post-meta">
                            <span class="post-category"><?= htmlspecialchars($item['category_name'] ?? 'Umum', ENT_QUOTES, 'UTF-8') ?></span>
                            <span>•</span>
                            <span><?= !empty($item['published_at']) ? date('d M Y', strtotime((string)$item['published_at'])) : '-' ?></span>
                            <span>•</span>
                            <span><?= (int)$item['reading_time'] ?> mnt baca</span>
                        </div>
                        <h2 class="post-title">
                            <a href="/post/<?= urlencode($item['slug']) ?>">
                                <?= htmlspecialchars($item['title'], ENT_QUOTES, 'UTF-8') ?>
                            </a>
                        </h2>
                        <p class="post-excerpt">
                            <?= htmlspecialchars($item['excerpt'] ?? '', ENT_QUOTES, 'UTF-8') ?>
                        </p>
                    </div>
                    <div class="post-footer">
                        <span>Oleh: <?= htmlspecialchars($item['author_name'] ?? 'Admin', ENT_QUOTES, 'UTF-8') ?></span>
                        <span>💬 <?= (int)$item['comment_count'] ?> Komentar</span>
                    </div>
                </article>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
</section>
