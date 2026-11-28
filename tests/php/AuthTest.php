<?php
require_once __DIR__ . '/../../config/app.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/helpers/FakePDO.php';
require_once __DIR__ . '/../../src/Models/User.php';
require_once __DIR__ . '/../../src/Utils/Auth.php';
require_once __DIR__ . '/../../src/Utils/CSRF.php';
require_once __DIR__ . '/../../src/Utils/Response.php';
require_once __DIR__ . '/../../src/Controllers/AuthController.php';
require_once __DIR__ . '/../../src/Controllers/AdminController.php';

/** @var TestRunner $runner */

$makeUserFakePdo = function (): FakePDO {
    $users = [
        [
            'id'            => 1,
            'username'      => 'admin',
            'email'         => 'admin@neoblog.local',
            'password_hash' => password_hash('admin123', PASSWORD_BCRYPT),
            'full_name'     => 'Administrator NeoBlog',
            'role'          => 'admin',
            'created_at'    => '2026-01-01 00:00:00',
        ],
        [
            'id'            => 2,
            'username'      => 'editor',
            'email'         => 'editor@neoblog.local',
            'password_hash' => password_hash('editor123', PASSWORD_BCRYPT),
            'full_name'     => 'Editor NeoBlog',
            'role'          => 'editor',
            'created_at'    => '2026-01-01 00:00:00',
        ],
        [
            'id'            => 3,
            'username'      => 'author',
            'email'         => 'author@neoblog.local',
            'password_hash' => password_hash('author123', PASSWORD_BCRYPT),
            'full_name'     => 'Author NeoBlog',
            'role'          => 'author',
            'created_at'    => '2026-01-01 00:00:00',
        ],
    ];

    $pdo = new FakePDO();
    $pdo->setResponder(function (string $sql, array $params) use ($users) {
        if (str_contains($sql, 'FROM users')) {
            $u = $params[':username'] ?? null;
            $e = $params[':email'] ?? null;
            $id = $params[':id'] ?? null;
            foreach ($users as $row) {
                if (($u !== null && $row['username'] === $u) || ($e !== null && $row['email'] === $e) || ($id !== null && (int)$row['id'] === (int)$id)) {
                    return [$row];
                }
            }
            return [];
        }
        return [];
    });
    return $pdo;
};

$runner->test('User: findByIdentifier memakai placeholder :username & :email terpisah dan menemukan akun', function () use ($runner, $makeUserFakePdo) {
    $pdo = $makeUserFakePdo();
    Database::setCustomConnection($pdo);
    try {
        $byUsername = User::findByIdentifier('admin');
        $byEmail = User::findByIdentifier('editor@neoblog.local');
        $missing = User::findByIdentifier('tidakada');

        $runner->assertEqual('admin', $byUsername['username'] ?? null);
        $runner->assertEqual('editor', $byEmail['username'] ?? null);
        $runner->assertEqual(null, $missing);
        $runner->assertTrue(str_contains($pdo->queries[0]['sql'], ':username') && str_contains($pdo->queries[0]['sql'], ':email'), 'Query harus memakai placeholder terpisah');
        $runner->assertEqual('admin', $pdo->queries[0]['params'][':username'] ?? null);
        $runner->assertEqual('admin', $pdo->queries[0]['params'][':email'] ?? null);
    } finally {
        Database::resetConnection();
    }
});

$runner->test('Auth: attempt, loginUser, hasRole, dan logout mengelola sesi tanpa membocorkan hash', function () use ($runner, $makeUserFakePdo) {
    $pdo = $makeUserFakePdo();
    Database::setCustomConnection($pdo);
    $_SESSION = [];
    try {
        // persistSession = false tidak menulis session
        $user = Auth::attempt('admin', 'admin123', false);
        $runner->assertTrue(is_array($user), 'Admin valid harus berhasil attempt');
        $runner->assertFalse(array_key_exists('password_hash', $user), 'password_hash tidak boleh ada di objek user');
        $runner->assertFalse(Auth::check(), 'persistSession=false tidak boleh menyimpan sesi');

        // persistSession = true menyimpan sesi
        $editor = Auth::attempt('editor@neoblog.local', 'editor123', true);
        $runner->assertTrue(is_array($editor));
        $runner->assertTrue(Auth::check());
        $runner->assertEqual('editor', Auth::user()['role'] ?? null);
        $runner->assertTrue(Auth::hasRole(['admin', 'editor']));
        $runner->assertFalse(Auth::hasRole('admin'));

        // Password salah
        $runner->assertEqual(null, Auth::attempt('admin', 'salah', false));

        // Logout membersihkan sesi
        Auth::logout();
        $runner->assertFalse(Auth::check());
        $runner->assertEqual(null, Auth::user());
    } finally {
        Database::resetConnection();
        $_SESSION = [];
    }
});

$runner->test('Auth: requireAdminOrEditor menolak tamu dan author sesuai format HTML/JSON', function () use ($runner) {
    $origServer = $_SERVER;
    $_SESSION = [];
    Response::resetState();
    try {
        // 1. Tamu HTML -> 302 /admin/login
        unset($_SERVER['HTTP_ACCEPT'], $_SERVER['HTTP_X_REQUESTED_WITH']);
        $res = Auth::requireAdminOrEditor(false);
        $runner->assertEqual(null, $res);
        $runner->assertEqual(302, Response::getLastStatus());
        $runner->assertEqual('/admin/login', Response::getLastRedirect());

        // 2. Tamu API/AJAX -> 401 JSON
        Response::resetState();
        $_SERVER['HTTP_ACCEPT'] = 'application/json';
        ob_start();
        $resJson = Auth::requireAdminOrEditor(false);
        $out = ob_get_clean();
        $decoded = json_decode($out, true);
        $runner->assertEqual(null, $resJson);
        $runner->assertEqual(401, Response::getLastStatus());
        $runner->assertFalse($decoded['success'] ?? true);

        // 3. Author HTML -> 403
        Response::resetState();
        unset($_SERVER['HTTP_ACCEPT']);
        Auth::loginUser(['id' => 3, 'username' => 'author', 'email' => 'author@neoblog.local', 'full_name' => 'Author', 'role' => 'author']);
        ob_start();
        $resAuthor = Auth::requireAdminOrEditor(false);
        $outAuthor = ob_get_clean();
        $runner->assertEqual(null, $resAuthor);
        $runner->assertEqual(403, Response::getLastStatus());
        $runner->assertTrue(str_contains($outAuthor, '403'), 'Halaman 403 HTML harus dirender');

        // 4. Author JSON -> 403 JSON
        Response::resetState();
        $_SERVER['HTTP_X_REQUESTED_WITH'] = 'XMLHttpRequest';
        ob_start();
        $resAuthorJson = Auth::requireAdminOrEditor(false);
        $outAuthorJson = ob_get_clean();
        $decodedAuthor = json_decode($outAuthorJson, true);
        $runner->assertEqual(null, $resAuthorJson);
        $runner->assertEqual(403, Response::getLastStatus());
        $runner->assertFalse($decodedAuthor['success'] ?? true);

        // 5. Editor diizinkan
        Response::resetState();
        Auth::loginUser(['id' => 2, 'username' => 'editor', 'email' => 'editor@neoblog.local', 'full_name' => 'Editor', 'role' => 'editor']);
        $allowed = Auth::requireAdminOrEditor(false);
        $runner->assertEqual('editor', $allowed['role'] ?? null);
    } finally {
        Response::resetState();
        $_SESSION = [];
        $_SERVER = $origServer;
    }
});

$runner->test('AuthController: validasi CSRF, penolakan author 403 tanpa sesi, login admin/editor, dan logout', function () use ($runner, $makeUserFakePdo) {
    $origServer = $_SERVER;
    $origPost = $_POST;
    $pdo = $makeUserFakePdo();
    Database::setCustomConnection($pdo);
    $_SESSION = [];
    $_POST = [];
    Response::resetState();

    try {
        $controller = new AuthController();

        // 1. CSRF gagal -> 403
        $_POST = ['identifier' => 'admin', 'password' => 'admin123', 'csrf_token' => 'palsu'];
        ob_start();
        $controller->login();
        ob_end_clean();
        $runner->assertEqual(403, Response::getLastStatus());
        $runner->assertFalse(Auth::check());

        // 2. Kredensial salah -> 401
        Response::resetState();
        $token = CSRF::getToken();
        $_POST = ['identifier' => 'admin', 'password' => 'salah', 'csrf_token' => $token];
        ob_start();
        $controller->login();
        ob_end_clean();
        $runner->assertEqual(401, Response::getLastStatus());
        $runner->assertFalse(Auth::check());

        // 3. Role author -> 403 dan sesi TIDAK tersimpan
        Response::resetState();
        $_POST = ['identifier' => 'author', 'password' => 'author123', 'csrf_token' => $token];
        ob_start();
        $controller->login();
        ob_end_clean();
        $runner->assertEqual(403, Response::getLastStatus());
        $runner->assertFalse(Auth::check(), 'Author tidak boleh mendapat sesi login admin');

        // 4. Role admin valid -> 302 /admin dan sesi tersimpan
        Response::resetState();
        $_POST = ['identifier' => 'admin', 'password' => 'admin123', 'csrf_token' => $token];
        $controller->login();
        $runner->assertEqual(302, Response::getLastStatus());
        $runner->assertEqual('/admin', Response::getLastRedirect());
        $runner->assertTrue(Auth::check());
        $runner->assertEqual('admin', Auth::user()['role'] ?? null);

        // 5. Logout CSRF gagal -> 403 & sesi tetap ada
        Response::resetState();
        $_POST = ['csrf_token' => 'salah'];
        ob_start();
        $controller->logout();
        ob_end_clean();
        $runner->assertEqual(403, Response::getLastStatus());
        $runner->assertTrue(Auth::check());

        // 6. Logout valid -> 302 /admin/login & sesi terhapus
        Response::resetState();
        $_POST = ['csrf_token' => $token];
        $controller->logout();
        $runner->assertEqual(302, Response::getLastStatus());
        $runner->assertEqual('/admin/login', Response::getLastRedirect());
        $runner->assertFalse(Auth::check());
    } finally {
        Database::resetConnection();
        Response::resetState();
        $_SESSION = [];
        $_POST = $origPost;
        $_SERVER = $origServer;
    }
});

$runner->test('AdminController: dashboard terlindungi RBAC dan merender ringkasan draf & komentar', function () use ($runner) {
    $origServer = $_SERVER;
    $_SESSION = [];
    Response::resetState();

    $pdo = new FakePDO();
    $pdo->setResponder(function (string $sql, array $params) {
        if (str_contains($sql, 'FROM posts GROUP BY status')) {
            return [
                ['status' => 'published', 'cnt' => 2],
                ['status' => 'draft', 'cnt' => 1],
                ['status' => 'archived', 'cnt' => 1],
            ];
        }
        if (str_contains($sql, 'FROM comments GROUP BY is_approved')) {
            return [
                ['is_approved' => 1, 'cnt' => 2],
                ['is_approved' => 0, 'cnt' => 3],
            ];
        }
        if (str_contains($sql, 'FROM posts p')) {
            return [
                [
                    'id'            => 3,
                    'title'         => 'Draf Uji <XSS>',
                    'category_name' => 'Tutorial',
                    'author_name'   => 'Editor NeoBlog',
                    'status'        => 'draft',
                ],
            ];
        }
        if (str_contains($sql, 'FROM comments c')) {
            return [
                [
                    'id'           => 5,
                    'author_name'  => 'Pengunjung',
                    'comment_text' => 'Menunggu persetujuan moderasi',
                    'post_title'   => 'Artikel Pertama',
                ],
            ];
        }
        return [];
    });
    Database::setCustomConnection($pdo);

    try {
        $controller = new AdminController();

        // Tamu -> 302 /admin/login
        $controller->dashboard();
        $runner->assertEqual(302, Response::getLastStatus());
        $runner->assertEqual('/admin/login', Response::getLastRedirect());

        // Editor login -> 200 dashboard ter-render & XSS ter-escape
        Response::resetState();
        Auth::loginUser(['id' => 2, 'username' => 'editor', 'email' => 'editor@neoblog.local', 'full_name' => 'Editor NeoBlog', 'role' => 'editor']);
        ob_start();
        $controller->dashboard();
        $html = ob_get_clean();

        $runner->assertEqual(200, Response::getLastStatus());
        $runner->assertTrue(str_contains($html, 'Dashboard CMS'));
        $runner->assertTrue(str_contains($html, 'Draf Uji &lt;XSS&gt;'), 'Judul draf harus di-escape dengan Sanitizer::clean');
        $runner->assertFalse(str_contains($html, 'Draf Uji <XSS>'), 'Tag mentah tidak boleh muncul di HTML');
        $runner->assertTrue(str_contains($html, 'Menunggu persetujuan moderasi'));
        $runner->assertTrue(str_contains($html, 'action="/admin/logout"'));
    } finally {
        Database::resetConnection();
        Response::resetState();
        $_SESSION = [];
        $_SERVER = $origServer;
    }
});
