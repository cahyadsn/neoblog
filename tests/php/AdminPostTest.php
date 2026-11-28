<?php
require_once __DIR__ . '/../../config/app.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/helpers/FakePDO.php';
require_once __DIR__ . '/../../src/Router.php';
require_once __DIR__ . '/../../src/Models/Post.php';
require_once __DIR__ . '/../../src/Models/Category.php';
require_once __DIR__ . '/../../src/Utils/Auth.php';
require_once __DIR__ . '/../../src/Utils/CSRF.php';
require_once __DIR__ . '/../../src/Utils/Response.php';
require_once __DIR__ . '/../../src/Utils/Sanitizer.php';
require_once __DIR__ . '/../../src/Controllers/AuthController.php';
require_once __DIR__ . '/../../src/Controllers/AdminPostController.php';

/** @var TestRunner $runner */

$makePostStore = function (): array {
    $categories = [
        ['id' => 1, 'name' => 'Teknologi', 'slug' => 'teknologi', 'description' => 'Tech'],
        ['id' => 2, 'name' => 'Tutorial', 'slug' => 'tutorial', 'description' => 'Guide'],
    ];

    $posts = [
        [
            'id'            => 1,
            'author_id'     => 1,
            'author_name'   => 'Administrator NeoBlog',
            'category_id'   => 1,
            'category_name' => 'Teknologi',
            'category_slug' => 'teknologi',
            'title'         => 'Artikel Terbit Pertama',
            'slug'          => 'artikel-terbit-pertama',
            'excerpt'       => 'Ringkasan artikel pertama.',
            'content'       => '<p>Konten artikel terbit.</p>',
            'reading_time'  => 4,
            'status'        => 'published',
            'published_at'  => '2026-01-10 09:00:00',
            'created_at'    => '2026-01-10 08:00:00',
            'updated_at'    => '2026-01-10 09:00:00',
            'comment_count' => 2,
        ],
        [
            'id'            => 2,
            'author_id'     => 2,
            'author_name'   => 'Editor <XSS>',
            'category_id'   => 2,
            'category_name' => 'Tutorial',
            'category_slug' => 'tutorial',
            'title'         => 'Draf Uji <script>alert(1)</script>',
            'slug'          => 'draf-uji',
            'excerpt'       => 'Ringkasan draf uji.',
            'content'       => '<p>Isi draf awal.</p><textarea>tutup</textarea>',
            'reading_time'  => 3,
            'status'        => 'draft',
            'published_at'  => null,
            'created_at'    => '2026-01-11 10:00:00',
            'updated_at'    => '2026-01-11 11:00:00',
            'comment_count' => 0,
        ],
        [
            'id'            => 3,
            'author_id'     => 1,
            'author_name'   => 'Administrator NeoBlog',
            'category_id'   => null,
            'category_name' => null,
            'category_slug' => null,
            'title'         => 'Artikel Arsip Lama',
            'slug'          => 'artikel-arsip-lama',
            'excerpt'       => 'Ringkasan arsip 100% aman.',
            'content'       => '<p>Konten arsip lama.</p>',
            'reading_time'  => 2,
            'status'        => 'archived',
            'published_at'  => '2025-12-01 07:00:00',
            'created_at'    => '2025-12-01 06:00:00',
            'updated_at'    => '2025-12-02 07:00:00',
            'comment_count' => 1,
        ],
    ];

    $nextId = 4;
    $pdo = new FakePDO();
    $pdo->setResponder(function (string $sql, array $params) use (&$posts, &$categories, &$nextId) {
        $normalizedSql = preg_replace('/\s+/', ' ', trim($sql));

        if (str_contains($normalizedSql, 'FROM categories WHERE id = :id')) {
            $id = (int)($params[':id'] ?? 0);
            foreach ($categories as $cat) {
                if ((int)$cat['id'] === $id) {
                    return [$cat];
                }
            }
            return [];
        }

        if (str_contains($normalizedSql, 'FROM categories')) {
            return $categories;
        }

        if (str_contains($normalizedSql, 'SELECT status, COUNT(*) AS cnt FROM posts GROUP BY status')) {
            $grouped = [];
            foreach ($posts as $p) {
                $st = $p['status'];
                $grouped[$st] = ($grouped[$st] ?? 0) + 1;
            }
            $rows = [];
            foreach ($grouped as $st => $cnt) {
                $rows[] = ['status' => $st, 'cnt' => $cnt];
            }
            return $rows;
        }

        if (str_starts_with($normalizedSql, 'SELECT 1 FROM posts WHERE slug = :slug')) {
            $slug = (string)($params[':slug'] ?? '');
            $excludeId = isset($params[':exclude_id']) ? (int)$params[':exclude_id'] : null;
            foreach ($posts as $p) {
                if ($p['slug'] === $slug && ($excludeId === null || (int)$p['id'] !== $excludeId)) {
                    return [['1' => 1]];
                }
            }
            return [];
        }

        if (str_contains($normalizedSql, 'FROM posts p') && str_contains($normalizedSql, 'WHERE p.id = :id')) {
            $id = (int)($params[':id'] ?? 0);
            foreach ($posts as $p) {
                if ((int)$p['id'] === $id) {
                    return [$p];
                }
            }
            return [];
        }

        if (str_contains($normalizedSql, 'FROM posts p') && str_contains($normalizedSql, 'WHERE p.slug = :slug')) {
            $slug = (string)($params[':slug'] ?? '');
            foreach ($posts as $p) {
                if ($p['slug'] === $slug && $p['status'] === 'published') {
                    return [$p];
                }
            }
            return [];
        }

        if (str_contains($normalizedSql, 'FROM posts p')) {
            $filtered = array_values(array_filter($posts, function (array $p) use ($normalizedSql, $params): bool {
                if (str_contains($normalizedSql, "p.status = 'published'") && $p['status'] !== 'published') {
                    return false;
                }
                if (isset($params[':status']) && $p['status'] !== $params[':status']) {
                    return false;
                }
                if (isset($params[':search_title'])) {
                    $rawLike = (string)$params[':search_title'];
                    if (str_starts_with($rawLike, '%') && str_ends_with($rawLike, '%') && strlen($rawLike) >= 2) {
                        $rawLike = substr($rawLike, 1, -1);
                    }
                    $needle = str_replace(['\\%', '\\_', '\\\\'], ['%', '_', '\\'], $rawLike);
                    $haystack = $p['title'] . ' ' . $p['slug'] . ' ' . ($p['excerpt'] ?? '');
                    if (stripos($haystack, $needle) === false) {
                        return false;
                    }
                }
                return true;
            }));
            $offset = (int)($params[':offset'] ?? 0);
            $limit = (int)($params[':limit'] ?? count($filtered));
            return array_slice($filtered, $offset, $limit);
        }

        if (str_starts_with($normalizedSql, 'INSERT INTO posts')) {
            $id = $nextId++;
            $catId = $params[':category_id'] ?? null;
            $catName = null;
            $catSlug = null;
            foreach ($categories as $c) {
                if ($catId !== null && (int)$c['id'] === (int)$catId) {
                    $catName = $c['name'];
                    $catSlug = $c['slug'];
                    break;
                }
            }
            $posts[] = [
                'id'            => $id,
                'author_id'     => (int)($params[':author_id'] ?? 1),
                'author_name'   => 'Administrator NeoBlog',
                'category_id'   => $catId !== null ? (int)$catId : null,
                'category_name' => $catName,
                'category_slug' => $catSlug,
                'title'         => (string)$params[':title'],
                'slug'          => (string)$params[':slug'],
                'excerpt'       => (string)($params[':excerpt'] ?? ''),
                'content'       => (string)$params[':content'],
                'reading_time'  => (int)($params[':reading_time'] ?? 3),
                'status'        => (string)$params[':status'],
                'published_at'  => $params[':published_at'],
                'created_at'    => '2026-01-12 12:00:00',
                'updated_at'    => '2026-01-12 12:00:00',
                'comment_count' => 0,
            ];
            return ['rows' => [], 'rowCount' => 1, 'lastInsertId' => (string)$id];
        }

        if (str_starts_with($normalizedSql, 'UPDATE posts SET status = :status')) {
            $id = (int)($params[':id'] ?? 0);
            foreach ($posts as &$p) {
                if ((int)$p['id'] === $id) {
                    $p['status'] = (string)$params[':status'];
                    if (str_contains($normalizedSql, 'published_at = NOW()')) {
                        $p['published_at'] = '2026-01-15 10:00:00';
                    }
                    return ['rows' => [], 'rowCount' => 1];
                }
            }
            return ['rows' => [], 'rowCount' => 0];
        }

        if (str_starts_with($normalizedSql, 'UPDATE posts SET')) {
            $id = (int)($params[':id'] ?? 0);
            foreach ($posts as &$p) {
                if ((int)$p['id'] === $id) {
                    $p['category_id'] = $params[':category_id'] !== null ? (int)$params[':category_id'] : null;
                    $p['title'] = (string)$params[':title'];
                    $p['slug'] = (string)$params[':slug'];
                    $p['excerpt'] = (string)($params[':excerpt'] ?? '');
                    $p['content'] = (string)$params[':content'];
                    $p['reading_time'] = (int)$params[':reading_time'];
                    $p['status'] = (string)$params[':status'];
                    if (array_key_exists(':published_at', $params)) {
                        $p['published_at'] = $params[':published_at'];
                    } elseif (str_contains($normalizedSql, 'COALESCE(published_at, NOW())') && $p['published_at'] === null) {
                        $p['published_at'] = '2026-01-15 11:00:00';
                    }
                    return ['rows' => [], 'rowCount' => 1];
                }
            }
            return ['rows' => [], 'rowCount' => 0];
        }

        if (str_starts_with($normalizedSql, 'DELETE FROM posts WHERE id = :id')) {
            $id = (int)($params[':id'] ?? 0);
            foreach ($posts as $idx => $p) {
                if ((int)$p['id'] === $id) {
                    array_splice($posts, $idx, 1);
                    return ['rows' => [], 'rowCount' => 1];
                }
            }
            return ['rows' => [], 'rowCount' => 0];
        }

        return [];
    });

    return ['pdo' => $pdo, 'getPosts' => function () use (&$posts): array {
        return $posts;
    }];
};

$runner->test('Post model: getAllForAdmin memakai placeholder LIKE terpisah, escape wildcard, findById tanpa filter status, dan create null category_id', function () use ($runner, $makePostStore) {
    $store = $makePostStore();
    $pdo = $store['pdo'];
    Database::setCustomConnection($pdo);

    try {
        // 1. findById memuat draft dan archived tanpa filter status
        $draft = Post::findById(2);
        $archived = Post::findById(3);
        $runner->assertEqual('draft', $draft['status'] ?? null);
        $runner->assertEqual('archived', $archived['status'] ?? null);

        // 2. getAllForAdmin dengan search LIKE metacharacter '%' menggunakan 3 placeholder berbeda
        $found = Post::getAllForAdmin(null, '100%');
        $runner->assertEqual(1, count($found));
        $runner->assertEqual(3, $found[0]['id'] ?? null);

        $lastQuery = end($pdo->queries);
        $runner->assertTrue(str_contains($lastQuery['sql'], ':search_title'));
        $runner->assertTrue(str_contains($lastQuery['sql'], ':search_slug'));
        $runner->assertTrue(str_contains($lastQuery['sql'], ':search_excerpt'));
        $runner->assertEqual('%100\\%%', $lastQuery['params'][':search_title'] ?? null);

        // 3. create() mempertahankan category_id = null
        $newId = Post::create([
            'author_id'   => 1,
            'category_id' => null,
            'title'       => 'Tanpa Kategori',
            'slug'        => 'tanpa-kategori',
            'content'     => '<p>Isi</p>',
            'status'      => 'draft',
        ]);
        $created = Post::findById($newId);
        $runner->assertTrue(is_array($created) && array_key_exists('category_id', $created));
        $runner->assertEqual(null, $created['category_id'], 'category_id null harus dipertahankan');
        $runner->assertEqual(null, $created['published_at'], 'draft baru tidak boleh punya published_at');

        // 4. slugExists dengan excludeId
        $runner->assertTrue(Post::slugExists('draf-uji'));
        $runner->assertFalse(Post::slugExists('draf-uji', 2));

        // 5. getAllPublished memuat tie-breaker p.id DESC
        $published = Post::getAllPublished();
        $pubQuery = end($pdo->queries);
        $runner->assertTrue(str_contains($pubQuery['sql'], 'ORDER BY p.published_at DESC, p.id DESC'));
        $runner->assertEqual(1, count($published));

        // 6. updateStatus invalid melempar InvalidArgumentException
        $threw = false;
        try {
            Post::updateStatus(2, 'invalid_status');
        } catch (InvalidArgumentException $e) {
            $threw = true;
        }
        $runner->assertTrue($threw, 'Status tidak valid harus melempar InvalidArgumentException');
    } finally {
        Database::resetConnection();
    }
});

$runner->test('AdminPostController RBAC: tamu dan author ditolak di semua endpoint, admin dan editor diizinkan', function () use ($runner, $makePostStore) {
    $origServer = $_SERVER;
    $origGet = $_GET;
    $origPost = $_POST;
    $store = $makePostStore();
    $pdo = $store['pdo'];
    Database::setCustomConnection($pdo);
    $_SESSION = [];
    $_GET = [];
    $_POST = [];

    try {
        $controller = new AdminPostController();

        // 1. Tamu HTML -> 302 /admin/login pada GET & POST
        foreach ([
            fn() => $controller->index(),
            fn() => $controller->createForm(),
            fn() => $controller->store(),
            fn() => $controller->editForm(1),
            fn() => $controller->update(1),
            fn() => $controller->updateStatus(1),
            fn() => $controller->delete(1),
        ] as $call) {
            Response::resetState();
            unset($_SERVER['HTTP_ACCEPT'], $_SERVER['HTTP_X_REQUESTED_WITH']);
            ob_start();
            $call();
            ob_end_clean();
            $runner->assertEqual(302, Response::getLastStatus());
            $runner->assertEqual('/admin/login', Response::getLastRedirect());
        }

        // 2. Tamu JSON -> 401
        Response::resetState();
        $_SERVER['HTTP_ACCEPT'] = 'application/json';
        ob_start();
        $controller->index();
        $out = ob_get_clean();
        $runner->assertEqual(401, Response::getLastStatus());
        $runner->assertFalse((json_decode($out, true))['success'] ?? true);

        // 3. Author HTML & JSON -> 403
        Auth::loginUser(['id' => 3, 'username' => 'author', 'email' => 'author@neoblog.local', 'full_name' => 'Author', 'role' => 'author']);
        Response::resetState();
        unset($_SERVER['HTTP_ACCEPT']);
        ob_start();
        $controller->index();
        ob_end_clean();
        $runner->assertEqual(403, Response::getLastStatus());

        Response::resetState();
        $_SERVER['HTTP_X_REQUESTED_WITH'] = 'XMLHttpRequest';
        ob_start();
        $controller->store();
        ob_end_clean();
        $runner->assertEqual(403, Response::getLastStatus());

        // 4. Editor diizinkan GET index & createForm
        unset($_SERVER['HTTP_X_REQUESTED_WITH']);
        Auth::loginUser(['id' => 2, 'username' => 'editor', 'email' => 'editor@neoblog.local', 'full_name' => 'Editor', 'role' => 'editor']);
        Response::resetState();
        ob_start();
        $controller->index();
        $indexHtml = ob_get_clean();
        $runner->assertEqual(200, Response::getLastStatus());
        $runner->assertTrue(str_contains($indexHtml, 'Kelola Artikel'));

        Response::resetState();
        ob_start();
        $controller->createForm();
        $createHtml = ob_get_clean();
        $runner->assertEqual(200, Response::getLastStatus());
        $runner->assertTrue(str_contains($createHtml, 'Buat Artikel Baru'));
    } finally {
        Database::resetConnection();
        Response::resetState();
        $_SESSION = [];
        $_GET = $origGet;
        $_POST = $origPost;
        $_SERVER = $origServer;
    }
});

$runner->test('AdminPostController CSRF: seluruh mutasi POST menolak token kosong, salah, atau array dengan 403 tanpa menulis DB', function () use ($runner, $makePostStore) {
    $origServer = $_SERVER;
    $origPost = $_POST;
    $store = $makePostStore();
    $pdo = $store['pdo'];
    Database::setCustomConnection($pdo);
    $_SESSION = [];

    try {
        Auth::loginUser(['id' => 1, 'username' => 'admin', 'email' => 'admin@neoblog.local', 'full_name' => 'Admin', 'role' => 'admin']);
        CSRF::getToken();
        $controller = new AdminPostController();

        $mutations = [
            fn() => $controller->store(),
            fn() => $controller->update(1),
            fn() => $controller->updateStatus(1),
            fn() => $controller->delete(1),
        ];

        foreach ([null, 'token-palsu', ['array-token']] as $badToken) {
            foreach ($mutations as $call) {
                $beforeCount = count($pdo->queries);
                Response::resetState();
                $_POST = $badToken === null ? ['title' => 'X'] : ['csrf_token' => $badToken, 'title' => 'X'];
                ob_start();
                $call();
                ob_end_clean();
                $runner->assertEqual(403, Response::getLastStatus());
                $runner->assertEqual($beforeCount, count($pdo->queries), 'Mutasi ditolak CSRF tidak boleh mengeksekusi query DB');
            }
        }
    } finally {
        Database::resetConnection();
        Response::resetState();
        $_SESSION = [];
        $_POST = $origPost;
        $_SERVER = $origServer;
    }
});

$runner->test('AdminPostController index(): filter status, pencarian q, XSS escaping, dan konsumsi flash session', function () use ($runner, $makePostStore) {
    $origGet = $_GET;
    $store = $makePostStore();
    $pdo = $store['pdo'];
    Database::setCustomConnection($pdo);
    $_SESSION = [];

    try {
        Auth::loginUser(['id' => 1, 'username' => 'admin', 'email' => 'admin@neoblog.local', 'full_name' => 'Admin', 'role' => 'admin']);
        $_SESSION['neoblog_flash_success'] = 'Flash sukses <script>xss</script>';
        $controller = new AdminPostController();

        // Filter draft + flash consumed
        $_GET = ['status' => 'draft', 'q' => 'Draf'];
        Response::resetState();
        ob_start();
        $controller->index();
        $html = ob_get_clean();

        $runner->assertEqual(200, Response::getLastStatus());
        $runner->assertTrue(str_contains($html, 'Draf Uji &lt;script&gt;alert(1)&lt;/script&gt;'), 'Judul berbahaya harus di-escape');
        $runner->assertFalse(str_contains($html, '<script>alert(1)</script>'), 'Script mentah tidak boleh muncul');
        $runner->assertTrue(str_contains($html, 'Editor &lt;XSS&gt;'));
        $runner->assertTrue(str_contains($html, 'Flash sukses &lt;script&gt;xss&lt;/script&gt;'));
        $runner->assertFalse(isset($_SESSION['neoblog_flash_success']), 'Flash harus dikonsumsi sekali saja');

        // Status filter invalid jatuh kembali ke 'all'
        $_GET = ['status' => 'unknown_status'];
        Response::resetState();
        ob_start();
        $controller->index();
        $allHtml = ob_get_clean();
        $runner->assertEqual(200, Response::getLastStatus());
        $runner->assertTrue(str_contains($allHtml, 'Artikel Terbit Pertama'));
        $runner->assertTrue(str_contains($allHtml, 'Artikel Arsip Lama'));
    } finally {
        Database::resetConnection();
        Response::resetState();
        $_SESSION = [];
        $_GET = $origGet;
    }
});

$runner->test('AdminPostController store(): validasi, array POST guard, auto-slug & deduplikasi, dan Sanitizer::cleanHtml', function () use ($runner, $makePostStore) {
    $origServer = $_SERVER;
    $origPost = $_POST;
    $store = $makePostStore();
    $pdo = $store['pdo'];
    Database::setCustomConnection($pdo);
    $_SESSION = [];

    try {
        Auth::loginUser(['id' => 1, 'username' => 'admin', 'email' => 'admin@neoblog.local', 'full_name' => 'Admin', 'role' => 'admin']);
        $token = CSRF::getToken();
        $controller = new AdminPostController();

        // 1. Validasi gagal (judul kosong + konten hanya <script> + reading_time di luar batas) -> 400
        $_POST = [
            'csrf_token'   => $token,
            'title'        => '   ',
            'slug'         => 'slug-gagal',
            'category_id'  => '999',
            'reading_time' => '1500',
            'excerpt'      => 'Ringkasan lama',
            'content'      => '<script>alert(1)</script>',
            'status'       => 'draft',
        ];
        Response::resetState();
        ob_start();
        $controller->store();
        $errHtml = ob_get_clean();
        $runner->assertEqual(400, Response::getLastStatus());
        $runner->assertTrue(str_contains($errHtml, 'Ringkasan lama'), 'Old input harus dipertahankan saat gagal');

        // 2. Array POST payload tidak memicu PHP Warning
        $warnings = [];
        set_error_handler(function (int $severity, string $msg) use (&$warnings): bool {
            $warnings[] = $msg;
            return true;
        });
        try {
            $_POST = [
                'csrf_token' => $token,
                'title'      => ['array-title'],
                'content'    => ['array-content'],
            ];
            Response::resetState();
            ob_start();
            $controller->store();
            ob_end_clean();
            $runner->assertEqual(400, Response::getLastStatus());
            $runner->assertEqual([], $warnings, 'Array POST tidak boleh memicu PHP warning');
        } finally {
            restore_error_handler();
        }

        // 3. Auto-slug + deduplikasi ('Draf Uji' -> 'draf-uji-2') + cleanHtml() + draft published_at = null
        $_POST = [
            'csrf_token'   => $token,
            'title'        => 'Draf Uji',
            'slug'         => '',
            'category_id'  => '',
            'reading_time' => '',
            'excerpt'      => 'Ringkasan "uji" & aman',
            'content'      => '<p onclick="evil()">Halo <strong>Dunia</strong></p><script>steal()</script><a href="javascript:alert(1)">Klik</a>',
            'status'       => 'draft',
        ];
        Response::resetState();
        $controller->store();
        $runner->assertEqual(302, Response::getLastStatus());
        $runner->assertEqual('/admin/posts', Response::getLastRedirect());

        $posts = ($store['getPosts'])();
        $created = end($posts);
        $runner->assertEqual('draf-uji-2', $created['slug']);
        $runner->assertEqual(null, $created['category_id']);
        $runner->assertEqual(null, $created['published_at']);
        $runner->assertEqual('Ringkasan "uji" & aman', $created['excerpt'], 'Plain text tidak boleh double-encoded di DB');
        $runner->assertFalse(str_contains($created['content'], '<script>'));
        $runner->assertFalse(str_contains($created['content'], 'onclick'));
        $runner->assertFalse(str_contains($created['content'], 'javascript:'));
        $runner->assertTrue(str_contains($created['content'], '<strong>Dunia</strong>'));

        // 4. Create sebagai published via JSON -> 201 + non-null published_at
        $_SERVER['HTTP_ACCEPT'] = 'application/json';
        $_POST = [
            'csrf_token'   => $token,
            'title'        => 'Draf Uji',
            'category_id'  => '1',
            'reading_time' => '5',
            'content'      => '<p>Artikel langsung terbit.</p>',
            'status'       => 'published',
        ];
        Response::resetState();
        ob_start();
        $controller->store();
        $jsonOut = ob_get_clean();
        $decoded = json_decode($jsonOut, true);
        $runner->assertEqual(201, Response::getLastStatus());
        $runner->assertTrue($decoded['success'] ?? false);
        $runner->assertEqual('draf-uji-3', $decoded['slug'] ?? null);

        $postsAfter = ($store['getPosts'])();
        $createdPub = end($postsAfter);
        $runner->assertTrue(!empty($createdPub['published_at']), 'Artikel published harus memiliki published_at');
    } finally {
        Database::resetConnection();
        Response::resetState();
        $_SESSION = [];
        $_POST = $origPost;
        $_SERVER = $origServer;
    }
});

$runner->test('AdminPostController editForm() & update(): 404 ID invalid/hilang, escape textarea, dan slug self-preservation', function () use ($runner, $makePostStore) {
    $origServer = $_SERVER;
    $origPost = $_POST;
    $store = $makePostStore();
    $pdo = $store['pdo'];
    Database::setCustomConnection($pdo);
    $_SESSION = [];

    try {
        Auth::loginUser(['id' => 1, 'username' => 'admin', 'email' => 'admin@neoblog.local', 'full_name' => 'Admin', 'role' => 'admin']);
        $token = CSRF::getToken();
        $controller = new AdminPostController();

        // 1. Malformed & nonexistent IDs -> 404 (tanpa TypeError)
        foreach (['abc', '0', '-5', 9999] as $badId) {
            Response::resetState();
            ob_start();
            $controller->editForm($badId);
            ob_end_clean();
            $runner->assertEqual(404, Response::getLastStatus());
        }

        // 2. editForm untuk draft (id=2) merender textarea dengan HTML ter-escape
        Response::resetState();
        ob_start();
        $controller->editForm(2);
        $editHtml = ob_get_clean();
        $runner->assertEqual(200, Response::getLastStatus());
        $runner->assertTrue(str_contains($editHtml, '&lt;/textarea&gt;'), 'Tag </textarea> dalam konten harus di-escape agar tidak memecah form');

        // 3. update mempertahankan slug yang sama tanpa bentrok dengan diri sendiri & mempublikasikan draf
        $_POST = [
            'csrf_token'   => $token,
            'title'        => 'Draf Jadi Terbit',
            'slug'         => 'draf-uji',
            'category_id'  => '2',
            'reading_time' => '6',
            'excerpt'      => 'Sudah disunting.',
            'content'      => '<h2>Judul</h2><p>Konten diperbarui.</p><script>bad()</script>',
            'status'       => 'published',
        ];
        Response::resetState();
        $controller->update(2);
        $runner->assertEqual(302, Response::getLastStatus());
        $runner->assertEqual('/admin/posts', Response::getLastRedirect());

        $updated = Post::findById(2);
        $runner->assertEqual('draf-uji', $updated['slug'] ?? null, 'Slug milik record sendiri tidak boleh berubah menjadi -2');
        $runner->assertEqual('published', $updated['status'] ?? null);
        $runner->assertTrue(!empty($updated['published_at']), 'Transisi ke published saat update harus mengisi published_at');
        $runner->assertFalse(str_contains($updated['content'] ?? '', '<script>'));
    } finally {
        Database::resetConnection();
        Response::resetState();
        $_SESSION = [];
        $_POST = $origPost;
        $_SERVER = $origServer;
    }
});

$runner->test('AdminPostController updateStatus(), delete(), Router & konsistensi publik', function () use ($runner, $makePostStore) {
    $origServer = $_SERVER;
    $origPost = $_POST;
    $store = $makePostStore();
    $pdo = $store['pdo'];
    Database::setCustomConnection($pdo);
    $_SESSION = [];

    try {
        Auth::loginUser(['id' => 2, 'username' => 'editor', 'email' => 'editor@neoblog.local', 'full_name' => 'Editor', 'role' => 'editor']);
        $token = CSRF::getToken();
        $controller = new AdminPostController();

        // 1. Invalid status -> 400
        $_POST = ['csrf_token' => $token, 'status' => 'deleted_forever'];
        Response::resetState();
        ob_start();
        $controller->updateStatus(2);
        ob_end_clean();
        $runner->assertEqual(400, Response::getLastStatus());

        // 2. AJAX JSON updateStatus draft -> published (X-CSRF-Token header)
        $_POST = ['status' => 'published'];
        $_SERVER['HTTP_X_REQUESTED_WITH'] = 'XMLHttpRequest';
        $_SERVER['HTTP_X_CSRF_TOKEN'] = $token;
        Response::resetState();
        ob_start();
        $controller->updateStatus(2);
        $statusJson = ob_get_clean();
        $decoded = json_decode($statusJson, true);
        $runner->assertEqual(200, Response::getLastStatus());
        $runner->assertTrue($decoded['success'] ?? false);
        $runner->assertEqual('published', $decoded['status'] ?? null);
        $runner->assertTrue(Post::findBySlug('draf-uji') !== null, 'Artikel yang diterbitkan harus terlihat di query publik');

        // 3. Arsipkan lagi -> hilang dari query publik
        $_POST = ['status' => 'archived'];
        Response::resetState();
        ob_start();
        $controller->updateStatus(2);
        ob_end_clean();
        $runner->assertEqual(200, Response::getLastStatus());
        $runner->assertEqual(null, Post::findBySlug('draf-uji'), 'Artikel diarsipkan tidak boleh tampil di publik');

        // 4. Delete nonexistent -> 404, delete valid -> 200 JSON
        Response::resetState();
        ob_start();
        $controller->delete(9999);
        ob_end_clean();
        $runner->assertEqual(404, Response::getLastStatus());

        Response::resetState();
        ob_start();
        $controller->delete(2);
        $delJson = ob_get_clean();
        $runner->assertEqual(200, Response::getLastStatus());
        $runner->assertTrue((json_decode($delJson, true))['success'] ?? false);
        $runner->assertEqual(null, Post::findById(2));

        // 5. Router dispatch untuk /admin/posts/abc/edit menghasilkan 404 (bukan TypeError) dan POST /admin/posts/store bekerja
        unset($_SERVER['HTTP_X_REQUESTED_WITH'], $_SERVER['HTTP_X_CSRF_TOKEN']);
        $router = new Router();
        $router->get('/admin/posts/{id}/edit', [AdminPostController::class, 'editForm']);
        $router->post('/admin/posts/store', [AdminPostController::class, 'store']);

        Response::resetState();
        ob_start();
        $router->dispatch('/admin/posts/abc/edit', 'GET');
        ob_end_clean();
        $runner->assertEqual(404, Response::getLastStatus());

        $_POST = [
            'csrf_token' => $token,
            'title'      => 'Via Router Store',
            'content'    => '<p>Konten via router store.</p>',
            'status'     => 'draft',
        ];
        Response::resetState();
        $router->dispatch('/admin/posts/store', 'POST');
        $runner->assertEqual(302, Response::getLastStatus());
        $runner->assertTrue(Post::slugExists('via-router-store'));
    } finally {
        Database::resetConnection();
        Response::resetState();
        $_SESSION = [];
        $_POST = $origPost;
        $_SERVER = $origServer;
    }
});

$runner->test('Regresi Hardening M1: AuthController array POST & view publik null published_at tanpa warning', function () use ($runner) {
    $origPost = $_POST;
    $origServer = $_SERVER;
    $_SESSION = [];
    $captured = [];

    set_error_handler(function (int $severity, string $msg) use (&$captured): bool {
        $captured[] = $msg;
        return true;
    });

    try {
        // 1. AuthController::login() dengan identifier[] dan password[]
        $token = CSRF::getToken();
        $_POST = [
            'csrf_token' => $token,
            'identifier' => ['evil'],
            'password'   => ['secret'],
        ];
        Response::resetState();
        $auth = new AuthController();
        ob_start();
        $auth->login();
        ob_end_clean();
        $runner->assertEqual(400, Response::getLastStatus());

        // 2. Render views/posts/index.php dengan published_at = null
        $posts = [[
            'id'            => 10,
            'title'         => 'Artikel Tanpa Tanggal',
            'slug'          => 'artikel-tanpa-tanggal',
            'excerpt'       => 'Ringkasan',
            'category_name' => 'Umum',
            'author_name'   => 'Admin',
            'reading_time'  => 2,
            'comment_count' => 0,
            'published_at'  => null,
        ]];
        ob_start();
        require __DIR__ . '/../../views/posts/index.php';
        $indexOut = ob_get_clean();
        $runner->assertTrue(str_contains($indexOut, 'Artikel Tanpa Tanggal'));

        // 3. Render views/posts/detail.php dengan published_at = null & created_at = null
        $post = [
            'id'            => 10,
            'title'         => 'Detail Tanpa Tanggal',
            'category_name' => 'Umum',
            'author_name'   => 'Admin',
            'reading_time'  => 2,
            'published_at'  => null,
            'content'       => '<p>Isi</p>',
        ];
        $comments = [[
            'author_name'  => 'Budi',
            'comment_text' => 'Komentar',
            'is_bot_reply' => 0,
            'created_at'   => null,
        ]];
        ob_start();
        require __DIR__ . '/../../views/posts/detail.php';
        $detailOut = ob_get_clean();
        $runner->assertTrue(str_contains($detailOut, 'Belum dipublikasikan'));
        $runner->assertEqual([], $captured, 'Tidak boleh ada warning atau deprecation saat render view/login');
    } finally {
        restore_error_handler();
        Response::resetState();
        $_SESSION = [];
        $_POST = $origPost;
        $_SERVER = $origServer;
    }
});
