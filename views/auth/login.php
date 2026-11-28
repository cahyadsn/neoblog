<section class="auth-section">
    <div class="login-card">
        <div class="login-header">
            <h1>Masuk CMS NeoBlog</h1>
            <p>Silakan masuk menggunakan akun admin atau editor untuk mengelola artikel dan komentar.</p>
        </div>

        <?php if (!empty($error)): ?>
            <div class="alert alert-danger" role="alert">
                <?= Sanitizer::clean((string)$error) ?>
            </div>
        <?php endif; ?>

        <?php if (!empty($notice)): ?>
            <div class="alert alert-success" role="status">
                <?= Sanitizer::clean((string)$notice) ?>
            </div>
        <?php endif; ?>

        <form method="POST" action="/admin/login" class="login-form">
            <?= CSRF::field() ?>

            <div class="form-group">
                <label for="identifier">Username atau Email</label>
                <input
                    type="text"
                    id="identifier"
                    name="identifier"
                    class="form-control"
                    placeholder="admin atau admin@neoblog.local"
                    value="<?= Sanitizer::clean((string)($oldIdentifier ?? '')) ?>"
                    autocomplete="username"
                    required
                    autofocus
                >
            </div>

            <div class="form-group">
                <label for="password">Kata Sandi</label>
                <input
                    type="password"
                    id="password"
                    name="password"
                    class="form-control"
                    placeholder="Masukkan kata sandi"
                    autocomplete="current-password"
                    required
                >
            </div>

            <button type="submit" class="btn btn-primary btn-block">Masuk ke Dashboard</button>
        </form>

        <p class="login-footer">
            <a href="/">&larr; Kembali ke Beranda</a>
        </p>
    </div>
</section>
