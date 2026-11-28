<?php
$isEdit = ($mode ?? '') === 'edit' || !empty($post['id']);
$actionUrl = $isEdit ? '/admin/posts/' . (int)$post['id'] . '/update' : '/admin/posts';
$val = static fn(string $key, string $default = ''): string => (string)($old[$key] ?? $post[$key] ?? $default);
$selectedCategory = $val('category_id', '');
$selectedStatus = $val('status', 'draft');
$readingTimeVal = $val('reading_time', '3');
?>

<section class="admin-page-header">
    <div>
        <h1><?= $isEdit ? 'Sunting Artikel' : 'Buat Artikel Baru' ?></h1>
        <p class="admin-subtitle">
            <?= $isEdit ? 'Perbarui konten, kategori, atau status publikasi artikel.' : 'Tulis artikel baru dan simpan sebagai draf atau langsung terbitkan.' ?>
        </p>
    </div>
    <div class="admin-quick-links">
        <a href="/admin/posts" class="btn btn-secondary">&larr; Kembali ke Daftar</a>
    </div>
</section>

<section class="admin-card">
    <?php if (!empty($errors)): ?>
        <div class="alert alert-danger" role="alert">
            <strong>Periksa kembali isian formulir:</strong>
            <ul style="margin-top: 6px; padding-left: 1.25rem;">
                <?php foreach ($errors as $err): ?>
                    <li><?= Sanitizer::clean((string)$err) ?></li>
                <?php endforeach; ?>
            </ul>
        </div>
    <?php endif; ?>

    <form method="POST" action="<?= Sanitizer::clean($actionUrl) ?>">
        <?= CSRF::field() ?>

        <div class="form-group">
            <label for="postTitle">Judul Artikel</label>
            <input
                type="text"
                id="postTitle"
                name="title"
                class="form-control"
                value="<?= Sanitizer::clean($val('title')) ?>"
                maxlength="255"
                placeholder="Masukkan judul artikel..."
                required
            >
        </div>

        <div class="form-group">
            <label for="postSlug">Slug URL (Opsional)</label>
            <input
                type="text"
                id="postSlug"
                name="slug"
                class="form-control"
                value="<?= Sanitizer::clean($val('slug')) ?>"
                maxlength="255"
                placeholder="otomatis-dari-judul"
                data-slug-locked="<?= $isEdit || $val('slug') !== '' ? 'true' : 'false' ?>"
            >
            <span class="form-hint">Kosongkan untuk membuat slug otomatis dari judul. Jika slug sudah dipakai, sistem akan menambahkan akhiran angka unik.</span>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label for="category_id">Kategori</label>
                <select id="category_id" name="category_id" class="form-control">
                    <option value="">-- Tanpa Kategori --</option>
                    <?php foreach ($categories ?? [] as $cat): ?>
                        <?php $catId = (string)($cat['id'] ?? ''); ?>
                        <option value="<?= Sanitizer::clean($catId) ?>" <?= $selectedCategory === $catId ? 'selected' : '' ?>>
                            <?= Sanitizer::clean((string)($cat['name'] ?? '')) ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </div>

            <div class="form-group">
                <label for="status">Status Publikasi</label>
                <select id="status" name="status" class="form-control">
                    <option value="draft" <?= $selectedStatus === 'draft' ? 'selected' : '' ?>>Draf</option>
                    <option value="published" <?= $selectedStatus === 'published' ? 'selected' : '' ?>>Terbit</option>
                    <option value="archived" <?= $selectedStatus === 'archived' ? 'selected' : '' ?>>Diarsipkan</option>
                </select>
            </div>

            <div class="form-group">
                <label for="reading_time">Waktu Baca (Menit)</label>
                <input
                    type="number"
                    id="reading_time"
                    name="reading_time"
                    class="form-control"
                    min="1"
                    max="999"
                    value="<?= Sanitizer::clean($readingTimeVal) ?>"
                >
            </div>
        </div>

        <div class="form-group">
            <label for="excerpt">Ringkasan (Excerpt)</label>
            <textarea
                id="excerpt"
                name="excerpt"
                class="form-control"
                rows="3"
                placeholder="Ringkasan singkat artikel yang tampil di halaman beranda..."
            ><?= Sanitizer::clean($val('excerpt')) ?></textarea>
        </div>

        <div class="form-group">
            <label for="content">Konten Artikel (HTML Aman)</label>
            <textarea
                id="content"
                name="content"
                class="form-control form-control-code"
                rows="12"
                placeholder="<p>Tulis konten artikel Anda di sini...</p>"
                required
            ><?= Sanitizer::clean($val('content')) ?></textarea>
            <span class="form-hint">
                Tag HTML yang diizinkan: <code>&lt;p&gt;</code>, <code>&lt;h1&gt;-&lt;h6&gt;</code>, <code>&lt;ul&gt;</code>, <code>&lt;ol&gt;</code>, <code>&lt;li&gt;</code>, <code>&lt;strong&gt;</code>, <code>&lt;em&gt;</code>, <code>&lt;b&gt;</code>, <code>&lt;i&gt;</code>, <code>&lt;code&gt;</code>, <code>&lt;pre&gt;</code>, <code>&lt;blockquote&gt;</code>, <code>&lt;a&gt;</code>, <code>&lt;br&gt;</code>, <code>&lt;hr&gt;</code>, <code>&lt;img&gt;</code>. Tag berbahaya seperti <code>&lt;script&gt;</code> akan dibersihkan otomatis.
            </span>
        </div>

        <div class="form-actions">
            <button type="submit" class="btn btn-primary">
                <?= $isEdit ? 'Simpan Perubahan' : 'Simpan Artikel' ?>
            </button>
            <a href="/admin/posts" class="btn btn-secondary">Batal</a>
        </div>
    </form>
</section>
