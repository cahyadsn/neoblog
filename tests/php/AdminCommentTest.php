<?php
require_once __DIR__ . '/../../config/app.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/helpers/FakePDO.php';
require_once __DIR__ . '/../../src/Router.php';
require_once __DIR__ . '/../../src/Models/Post.php';
require_once __DIR__ . '/../../src/Models/Comment.php';
require_once __DIR__ . '/../../src/Utils/Auth.php';
require_once __DIR__ . '/../../src/Utils/CSRF.php';
require_once __DIR__ . '/../../src/Utils/Response.php';
require_once __DIR__ . '/../../src/Utils/Sanitizer.php';
require_once __DIR__ . '/../../src/Controllers/CommentController.php';
require_once __DIR__ . '/../../src/Controllers/AdminCommentController.php';

/** @var TestRunner $runner */

$makeCommentStore = function (): array {
    $posts = [
        1 => [
            'id'            => 1,
            'author_id'     => 1,
            'author_name'   => 'Administrator NeoBlog',
            'category_id'   => 1,
            'category_name' => 'Teknologi',
            'category_slug' => 'teknologi',
            'title'         => 'Artikel Terbit <Aman>',
            'slug'          => 'artikel-terbit-aman',
            'excerpt'       => 'Ringkasan.',
            'content'       => '<p>Isi artikel.</p>',
            'reading_time'  => 3,
            'status'        => 'published',
            'published_at'  => '2026-01-10 09:00:00',
            'created_at'    => '2026-01-10 08:00:00',
            'updated_at'    => '2026-01-10 09:00:00',
        ],
        2 => [
            'id'            => 2,
            'author_id'     => 2,
            'author_name'   => 'Editor NeoBlog',
            'category_id'   => 1,
            'category_name' => 'Teknologi',
            'category_slug' => 'teknologi',
            'title'         => 'Artikel Draf',
            'slug'          => 'artikel-draf',
            'excerpt'       => 'Draf.',
            'content'       => '<p>Draf.</p>',
            'reading_time'  => 2,
            'status'        => 'draft',
            'published_at'  => null,
            'created_at'    => '2026-01-11 08:00:00',
            'updated_at'    => '2026-01-11 08:00:00',
        ],
        3 => [
            'id'            => 3,
            'author_id'     => 1,
            'author_name'   => 'Administrator NeoBlog',
            'category_id'   => 1,
            'category_name' => 'Teknologi',
            'category_slug' => 'teknologi',
            'title'         => 'Artikel Arsip',
            'slug'          => 'artikel-arsip',
            'excerpt'       => 'Arsip.',
            'content'       => '<p>Arsip.</p>',
            'reading_time'  => 2,
            'status'        => 'archived',
            'published_at'  => '2025-12-01 08:00:00',
            'created_at'    => '2025-12-01 08:00:00',
            'updated_at'    => '2025-12-01 08:00:00',
        ],
    ];

    $comments = [
        [
            'id'             => 1,
            'post_id'        => 1,
            'parent_id'      => null,
            'author_name'    => 'Andi Pembaca',
            'author_email'   => 'andi@example.com',
            'comment_text'   => 'Komentar awal yang sangat membantu!',
            'is_approved'    => 1,
            'is_bot_reply'   => 0,
            'is_admin_reply' => 0,
            'created_at'     => '2026-01-10 10:00:00',
        ],
        [
            'id'             => 2,
            'post_id'        => 1,
            'parent_id'      => 1,
            'author_name'    => 'NeoBlog Assistant',
            'author_email'   => 'assistant@neoblog.local',
            'comment_text'   => 'Terima kasih Andi!',
            'is_approved'    => 1,
            'is_bot_reply'   => 1,
            'is_admin_reply' => 0,
            'created_at'     => '2026-01-10 10:05:00',
        ],
        [
            'id'             => 3,
            'post_id'        => 1,
            'parent_id'      => null,
            'author_name'    => 'Budi <script>alert(1)</script>',
            'author_email'   => 'budi@example.com',
            'comment_text'   => 'Promo <img src=x onerror=alert(1)> & slot gacor',
            'is_approved'    => 0,
            'is_bot_reply'   => 0,
            'is_admin_reply' => 0,
            'created_at'     => '2026-01-10 11:00:00',
        ],
        [
            'id'             => 4,
            'post_id'        => 2,
            'parent_id'      => null,
            'author_name'    => 'Citra',
            'author_email'   => 'citra@example.com',
            'comment_text'   => 'Komentar pending di artikel lain.',
            'is_approved'    => 0,
            'is_bot_reply'   => 0,
            'is_admin_reply' => 0,
            'created_at'     => '2026-01-11 09:00:00',
        ],
    ];

    $nextId = 5;
    $pdo = new FakePDO();
    $pdo->setResponder(function (string $sql, array $params) use (&$posts, &$comments, &$nextId) {
        $normalizedSql = preg_replace('/\s+/', ' ', trim($sql));

        // Post::findById
        if (str_contains($normalizedSql, 'FROM posts p') && str_contains($normalizedSql, 'WHERE p.id = :id')) {
            $id = (int)($params[':id'] ?? 0);
            return isset($posts[$id]) ? [$posts[$id]] : [];
        }

        // Comment::countByApprovalStatus
        if (str_contains($normalizedSql, 'SELECT is_approved, COUNT(*) AS cnt FROM comments GROUP BY is_approved')) {
            $grouped = [];
            foreach ($comments as $c) {
                $flag = (int)$c['is_approved'];
                $grouped[$flag] = ($grouped[$flag] ?? 0) + 1;
            }
            $rows = [];
            foreach ($grouped as $flag => $cnt) {
                $rows[] = ['is_approved' => $flag, 'cnt' => $cnt];
            }
            return $rows;
        }

        // Comment::getByPostId
        if (str_contains($normalizedSql, 'FROM comments WHERE post_id = :post_id AND is_approved = 1')) {
            $postId = (int)($params[':post_id'] ?? 0);
            $matched = array_values(array_filter($comments, fn($c) => (int)$c['post_id'] === $postId && (int)$c['is_approved'] === 1));
            usort($matched, function ($a, $b) {
                $cmp = strcmp((string)$a['created_at'], (string)$b['created_at']);
                return $cmp !== 0 ? $cmp : ((int)$a['id'] <=> (int)$b['id']);
            });
            return $matched;
        }

        // Comment::getAllForModeration
        if (str_contains($normalizedSql, 'FROM comments c JOIN posts p ON c.post_id = p.id LEFT JOIN comments parent ON c.parent_id = parent.id')) {
            $filterApproved = array_key_exists(':is_approved', $params) ? (int)$params[':is_approved'] : null;
            $filterPostId = array_key_exists(':post_id', $params) ? (int)$params[':post_id'] : null;
            $limit = isset($params[':limit']) ? (int)$params[':limit'] : 50;
            $offset = isset($params[':offset']) ? (int)$params[':offset'] : 0;

            $byId = [];
            foreach ($comments as $c) {
                $byId[(int)$c['id']] = $c;
            }

            $rows = [];
            foreach ($comments as $c) {
                if ($filterApproved !== null && (int)$c['is_approved'] !== $filterApproved) {
                    continue;
                }
                if ($filterPostId !== null && (int)$c['post_id'] !== $filterPostId) {
                    continue;
                }
                $p = $posts[(int)$c['post_id']] ?? ['title' => 'Artikel', 'slug' => 'artikel', 'status' => 'published'];
                $parentAuthor = null;
                if (!empty($c['parent_id']) && isset($byId[(int)$c['parent_id']])) {
                    $parentAuthor = $byId[(int)$c['parent_id']]['author_name'];
                }
                $rows[] = array_merge($c, [
                    'post_title'         => $p['title'],
                    'post_slug'          => $p['slug'],
                    'post_status'        => $p['status'],
                    'parent_author_name' => $parentAuthor,
                ]);
            }

            usort($rows, function ($a, $b) {
                $cmp = strcmp((string)$b['created_at'], (string)$a['created_at']);
                return $cmp !== 0 ? $cmp : ((int)$b['id'] <=> (int)$a['id']);
            });

            return array_slice($rows, $offset, $limit);
        }

        // Comment::findById
        if (str_contains($normalizedSql, 'FROM comments c JOIN posts p ON c.post_id = p.id WHERE c.id = :id')) {
            $id = (int)($params[':id'] ?? 0);
            foreach ($comments as $c) {
                if ((int)$c['id'] === $id) {
                    $p = $posts[(int)$c['post_id']] ?? ['title' => 'Artikel', 'slug' => 'artikel', 'status' => 'published'];
                    return [array_merge($c, [
                        'post_title'  => $p['title'],
                        'post_slug'   => $p['slug'],
                        'post_status' => $p['status'],
                    ])];
                }
            }
            return [];
        }

        // Comment::getRecentPending
        if (str_contains($normalizedSql, 'FROM comments c JOIN posts p ON c.post_id = p.id WHERE c.is_approved = 0')) {
            $limit = isset($params[':limit']) ? (int)$params[':limit'] : 5;
            $rows = [];
            foreach ($comments as $c) {
                if ((int)$c['is_approved'] === 0) {
                    $p = $posts[(int)$c['post_id']] ?? ['title' => 'Artikel', 'slug' => 'artikel'];
                    $rows[] = array_merge($c, ['post_title' => $p['title'], 'post_slug' => $p['slug']]);
                }
            }
            usort($rows, fn($a, $b) => strcmp((string)$b['created_at'], (string)$a['created_at']));
            return array_slice($rows, 0, $limit);
        }

        // Comment::getUnrepliedUserComments
        if (str_contains($normalizedSql, 'WHERE c.is_bot_reply = 0 AND c.parent_id IS NULL AND c.is_approved = 1')) {
            $limit = isset($params[':limit']) ? (int)$params[':limit'] : 10;
            $repliedParents = [];
            foreach ($comments as $c) {
                if (!empty($c['parent_id'])) {
                    $repliedParents[(int)$c['parent_id']] = true;
                }
            }
            $rows = [];
            foreach ($comments as $c) {
                if ((int)$c['is_bot_reply'] === 0 && $c['parent_id'] === null && (int)$c['is_approved'] === 1 && !isset($repliedParents[(int)$c['id']])) {
                    $p = $posts[(int)$c['post_id']] ?? ['title' => 'Artikel', 'slug' => 'artikel'];
                    $rows[] = array_merge($c, ['post_title' => $p['title'], 'post_slug' => $p['slug']]);
                }
            }
            return array_slice($rows, 0, $limit);
        }

        // Comment::create
        if (str_starts_with($normalizedSql, 'INSERT INTO comments')) {
            $id = $nextId++;
            $comments[] = [
                'id'             => $id,
                'post_id'        => (int)$params[':post_id'],
                'parent_id'      => $params[':parent_id'] !== null ? (int)$params[':parent_id'] : null,
                'author_name'    => (string)$params[':author_name'],
                'author_email'   => (string)$params[':author_email'],
                'comment_text'   => (string)$params[':comment_text'],
                'is_approved'    => (int)$params[':is_approved'],
                'is_bot_reply'   => (int)$params[':is_bot_reply'],
                'is_admin_reply' => (int)($params[':is_admin_reply'] ?? 0),
                'created_at'     => '2026-01-12 12:00:00',
            ];
            return ['rows' => [], 'rowCount' => 1, 'lastInsertId' => (string)$id];
        }

        // Comment::setApproval
        if (str_starts_with($normalizedSql, 'UPDATE comments SET is_approved = :is_approved WHERE id = :id')) {
            $id = (int)($params[':id'] ?? 0);
            $isApproved = (int)($params[':is_approved'] ?? 0);
            $updated = 0;
            foreach ($comments as &$c) {
                if ((int)$c['id'] === $id) {
                    $c['is_approved'] = $isApproved;
                    $updated = 1;
                    break;
                }
            }
            unset($c);
            return ['rows' => [], 'rowCount' => $updated];
        }

        // Comment::delete with simulated ON DELETE CASCADE
        if (str_starts_with($normalizedSql, 'DELETE FROM comments WHERE id = :id')) {
            $id = (int)($params[':id'] ?? 0);
            $toDelete = [$id => true];
            $changed = true;
            while ($changed) {
                $changed = false;
                foreach ($comments as $c) {
                    $cid = (int)$c['id'];
                    $pid = $c['parent_id'] !== null ? (int)$c['parent_id'] : null;
                    if ($pid !== null && isset($toDelete[$pid]) && !isset($toDelete[$cid])) {
                        $toDelete[$cid] = true;
                        $changed = true;
                    }
                }
            }
            $before = count($comments);
            $comments = array_values(array_filter($comments, fn($c) => !isset($toDelete[(int)$c['id']])));
            return ['rows' => [], 'rowCount' => $before - count($comments)];
        }

        return [];
    });

    return [
        'pdo'      => $pdo,
        'comments' => &$comments,
        'posts'    => &$posts,
    ];
};

// =========================================================================
// 1. Model Comment: getByPostId, create, getAllForModeration, findById, setApproval, delete
// =========================================================================
$runner->test('Comment model mendukung moderasi, is_admin_reply, filter status, dan cascade delete', function () use ($runner, $makeCommentStore) {
    $store = $makeCommentStore();
    Database::setCustomConnection($store['pdo']);

    try {
        // getByPostId hanya mengambil approved dan menyertakan is_admin_reply + parent_id
        $publicPost1 = Comment::getByPostId(1);
        $runner->assertEqual(2, count($publicPost1));
        $runner->assertTrue(array_key_exists('is_admin_reply', $publicPost1[0]));
        $runner->assertEqual(null, $publicPost1[0]['parent_id']);
        $runner->assertEqual(1, (int)$publicPost1[1]['parent_id']);

        // create backward compatible (tanpa is_admin_reply) + eksplisit is_admin_reply=1
        $botId = Comment::create([
            'post_id'      => 1,
            'parent_id'    => 1,
            'author_name'  => 'Bot Helper',
            'author_email' => 'bot@neoblog.local',
            'comment_text' => 'Balasan bot.',
            'is_approved'  => 1,
            'is_bot_reply' => 1,
        ]);
        $botRow = Comment::findById($botId);
        $runner->assertEqual(0, (int)$botRow['is_admin_reply']);

        $adminReplyId = Comment::create([
            'post_id'        => 1,
            'parent_id'      => 1,
            'author_name'    => 'Admin CMS',
            'author_email'   => 'admin@neoblog.local',
            'comment_text'   => 'Balasan resmi admin.',
            'is_approved'    => 1,
            'is_bot_reply'   => 0,
            'is_admin_reply' => 1,
        ]);
        $adminRow = Comment::findById($adminReplyId);
        $runner->assertEqual(1, (int)$adminRow['is_admin_reply']);

        // getAllForModeration filter all / pending / approved / postId
        $all = Comment::getAllForModeration(null);
        $runner->assertEqual(6, count($all));
        $runner->assertEqual('Andi Pembaca', $all[0]['parent_author_name']); // newest first (adminReplyId parent=1)

        $pending = Comment::getAllForModeration('pending');
        $runner->assertEqual(2, count($pending));

        $approved = Comment::getAllForModeration('approved', 1);
        $runner->assertEqual(4, count($approved));

        // setApproval valid & invalid
        $runner->assertTrue(Comment::setApproval(3, 1));
        $runner->assertEqual(1, (int)Comment::findById(3)['is_approved']);
        $runner->assertTrue(Comment::setApproval(3, 0));
        $runner->assertEqual(0, (int)Comment::findById(3)['is_approved']);

        $threwInvalid = false;
        try {
            Comment::setApproval(3, 2);
        } catch (InvalidArgumentException $e) {
            $threwInvalid = true;
        }
        $runner->assertTrue($threwInvalid, 'setApproval harus melempar InvalidArgumentException untuk nilai selain 0/1');

        // countByApprovalStatus & getRecentPending tetap berfungsi
        $counts = Comment::countByApprovalStatus();
        $runner->assertEqual(6, $counts['total']);
        $runner->assertEqual(4, $counts['approved']);
        $runner->assertEqual(2, $counts['pending']);
        $runner->assertEqual(2, count(Comment::getRecentPending(5)));

        // delete cascade: menghapus id=1 harus ikut menghapus anak-anaknya (id=2, $botId, $adminReplyId)
        $runner->assertTrue(Comment::delete(1));
        $runner->assertEqual(null, Comment::findById(1));
        $runner->assertEqual(null, Comment::findById(2));
        $runner->assertEqual(null, Comment::findById($adminReplyId));
        $runner->assertEqual(2, count(Comment::getAllForModeration(null)));

        // Pastikan tidak ada duplicate named placeholders dan LIMIT/OFFSET bertipe int
        foreach ($store['pdo']->queries as $q) {
            if (str_contains($q['sql'], 'LIMIT :limit OFFSET :offset')) {
                $runner->assertTrue(is_int($q['params'][':limit']), 'LIMIT harus di-bind sebagai INT');
                $runner->assertTrue(is_int($q['params'][':offset']), 'OFFSET harus di-bind sebagai INT');
            }
        }
    } finally {
        Database::resetConnection();
    }
});

// =========================================================================
// 2. CommentController::store() hardening (CSRF, published check, raw plain text, pending gate)
// =========================================================================
$runner->test('CommentController::store() memvalidasi CSRF, status published, parent_id, dan menghindari double-encoding', function () use ($runner, $makeCommentStore) {
    $origPost = $_POST;
    $origServer = $_SERVER;
    $store = $makeCommentStore();
    Database::setCustomConnection($store['pdo']);

    $capturedWarnings = [];
    set_error_handler(function (int $severity, string $msg) use (&$capturedWarnings): bool {
        $capturedWarnings[] = $msg;
        return true;
    });

    try {
        $_SESSION = [];
        $token = CSRF::getToken();
        $ctrl = new CommentController();

        // 2a. CSRF tidak valid -> 403
        $_POST = ['csrf_token' => 'salah', 'post_id' => '1'];
        Response::resetState();
        ob_start();
        $ctrl->store();
        $out = json_decode(ob_get_clean(), true);
        $runner->assertEqual(403, Response::getLastStatus());
        $runner->assertFalse($out['success']);

        // 2b. Array payload -> 400 tanpa PHP warning
        $_POST = [
            'csrf_token'   => $token,
            'post_id'      => ['1'],
            'author_name'  => ['Evil'],
            'author_email' => ['evil@example.com'],
            'comment_text' => ['Test'],
        ];
        Response::resetState();
        ob_start();
        $ctrl->store();
        $out = json_decode(ob_get_clean(), true);
        $runner->assertEqual(400, Response::getLastStatus());
        $runner->assertFalse($out['success']);
        $runner->assertEqual([], $capturedWarnings);

        // 2c. Post tidak ditemukan -> 404
        $_POST = [
            'csrf_token'   => $token,
            'post_id'      => '999',
            'author_name'  => 'Dina',
            'author_email' => 'dina@example.com',
            'comment_text' => 'Halo!',
        ];
        Response::resetState();
        ob_start();
        $ctrl->store();
        $out = json_decode(ob_get_clean(), true);
        $runner->assertEqual(404, Response::getLastStatus());
        $runner->assertFalse($out['success']);

        // 2d. Post draft / archived -> 422
        $_POST['post_id'] = '2';
        Response::resetState();
        ob_start();
        $ctrl->store();
        $out = json_decode(ob_get_clean(), true);
        $runner->assertEqual(422, Response::getLastStatus());
        $runner->assertFalse($out['success']);

        // 2e. Parent comment pending / beda post -> 422
        $_POST['post_id'] = '1';
        $_POST['parent_id'] = '3'; // id 3 is pending
        Response::resetState();
        ob_start();
        $ctrl->store();
        $out = json_decode(ob_get_clean(), true);
        $runner->assertEqual(422, Response::getLastStatus());

        // 2f. Komentar valid dengan karakter spesial disimpan mentah (tidak double-encoded) via X-CSRF-Token
        $_POST = [
            'post_id'      => '1',
            'parent_id'    => '1',
            'author_name'  => "  Sari & Co <Team>  ",
            'author_email' => 'sari@example.com',
            'comment_text' => "Baris 1: 1 < 2 & 'quote'\nBaris 2: \"ok\"",
        ];
        $_SERVER['HTTP_X_CSRF_TOKEN'] = $token;
        Response::resetState();
        ob_start();
        $ctrl->store();
        $out = json_decode(ob_get_clean(), true);
        $runner->assertEqual(201, Response::getLastStatus());
        $runner->assertTrue($out['success']);
        $runner->assertEqual(1, $out['is_approved']);
        $runner->assertEqual('approved', $out['status']);
        $runner->assertEqual('Sari & Co <Team>', $out['comment']['author_name']);
        $runner->assertEqual("Baris 1: 1 < 2 & 'quote'\nBaris 2: \"ok\"", $out['comment']['comment_text']);
        $saved = Comment::findById((int)$out['comment']['id']);
        $runner->assertEqual('Sari & Co <Team>', $saved['author_name']);
        $runner->assertEqual("Baris 1: 1 < 2 & 'quote'\nBaris 2: \"ok\"", $saved['comment_text']);

        // 2g. Komentar spam -> is_approved = 0, status = pending
        $_POST = [
            'csrf_token'   => $token,
            'post_id'      => '1',
            'author_name'  => 'Spammer',
            'author_email' => 'spam@example.com',
            'comment_text' => 'Daftar slot gacor sekarang!',
        ];
        unset($_SERVER['HTTP_X_CSRF_TOKEN']);
        Response::resetState();
        ob_start();
        $ctrl->store();
        $out = json_decode(ob_get_clean(), true);
        $runner->assertEqual(201, Response::getLastStatus());
        $runner->assertTrue($out['success']);
        $runner->assertEqual(0, $out['is_approved']);
        $runner->assertEqual('pending', $out['status']);
    } finally {
        restore_error_handler();
        Database::resetConnection();
        Response::resetState();
        $_SESSION = [];
        $_POST = $origPost;
        $_SERVER = $origServer;
    }
});

// =========================================================================
// 3. RBAC & CSRF pada AdminCommentController
// =========================================================================
$runner->test('AdminCommentController menolak guest (302/401) dan author (403) serta mewajibkan CSRF pada semua mutasi', function () use ($runner, $makeCommentStore) {
    $origPost = $_POST;
    $origGet = $_GET;
    $origServer = $_SERVER;
    $store = $makeCommentStore();
    Database::setCustomConnection($store['pdo']);

    try {
        $ctrl = new AdminCommentController();

        // Guest HTML -> 302 /admin/login
        $_SESSION = [];
        $_SERVER = [];
        Response::resetState();
        ob_start();
        $ctrl->index();
        ob_end_clean();
        $runner->assertEqual(302, Response::getLastStatus());
        $runner->assertEqual('/admin/login', Response::getLastRedirect());

        // Guest JSON pada mutasi -> 401
        $_SERVER['HTTP_ACCEPT'] = 'application/json';
        foreach (['approve', 'hide', 'reply', 'delete'] as $method) {
            Response::resetState();
            ob_start();
            $ctrl->$method('1');
            $out = json_decode(ob_get_clean(), true);
            $runner->assertEqual(401, Response::getLastStatus(), "Guest JSON {$method} harus 401");
            $runner->assertFalse($out['success']);
        }

        // Author HTML -> 403
        $_SESSION = ['neoblog_user' => ['id' => 3, 'username' => 'author', 'role' => 'author']];
        $_SERVER = [];
        Response::resetState();
        ob_start();
        $ctrl->index();
        ob_end_clean();
        $runner->assertEqual(403, Response::getLastStatus());

        // Author JSON -> 403
        $_SERVER['HTTP_X_REQUESTED_WITH'] = 'XMLHttpRequest';
        Response::resetState();
        ob_start();
        $ctrl->approve('3');
        $out = json_decode(ob_get_clean(), true);
        $runner->assertEqual(403, Response::getLastStatus());
        $runner->assertFalse($out['success']);

        // Admin dengan token CSRF salah / array / kosong -> 403 tanpa menyentuh DB
        $_SESSION = ['neoblog_user' => ['id' => 1, 'username' => 'admin', 'email' => 'admin@neoblog.local', 'full_name' => 'Admin', 'role' => 'admin']];
        CSRF::getToken();
        $queriesBefore = count($store['pdo']->queries);

        foreach ([null, 'wrong', ['array-token']] as $badToken) {
            $_POST = $badToken === null ? [] : ['csrf_token' => $badToken];
            $_SERVER = ['HTTP_ACCEPT' => 'application/json'];
            foreach (['approve', 'hide', 'reply', 'delete'] as $method) {
                Response::resetState();
                ob_start();
                $ctrl->$method('1');
                $out = json_decode(ob_get_clean(), true);
                $runner->assertEqual(403, Response::getLastStatus(), "Bad CSRF pada {$method} harus 403");
                $runner->assertFalse($out['success']);
            }
        }
        $runner->assertEqual($queriesBefore, count($store['pdo']->queries), 'CSRF gagal tidak boleh mengeksekusi query DB');
    } finally {
        Database::resetConnection();
        Response::resetState();
        $_SESSION = [];
        $_POST = $origPost;
        $_GET = $origGet;
        $_SERVER = $origServer;
    }
});

// =========================================================================
// 4. Moderasi Komentar (index filter, approve, hide, reply, delete, 404, XSS escaping) & Router
// =========================================================================
$runner->test('AdminCommentController menangani filter status, approve, hide, reply admin, delete cascade, dan Router dispatch', function () use ($runner, $makeCommentStore) {
    $origPost = $_POST;
    $origGet = $_GET;
    $origServer = $_SERVER;
    $store = $makeCommentStore();
    Database::setCustomConnection($store['pdo']);

    try {
        $_SESSION = [
            'neoblog_user' => [
                'id'        => 2,
                'username'  => 'editor',
                'email'     => 'editor@neoblog.local',
                'full_name' => 'Editor Utama',
                'role'      => 'editor',
            ],
        ];
        $token = CSRF::getToken();

        $router = new Router();
        $router->get('/admin/comments', [AdminCommentController::class, 'index']);
        $router->post('/admin/comments/{id}/approve', [AdminCommentController::class, 'approve']);
        $router->post('/admin/comments/{id}/hide', [AdminCommentController::class, 'hide']);
        $router->post('/admin/comments/{id}/reply', [AdminCommentController::class, 'reply']);
        $router->post('/admin/comments/{id}/delete', [AdminCommentController::class, 'delete']);

        // 4a. GET /admin/comments?status=pending merender komentar pending & melakukan XSS escaping
        $_GET = ['status' => 'pending'];
        $_SERVER = [];
        Response::resetState();
        ob_start();
        $router->dispatch('/admin/comments?status=pending', 'GET');
        $html = ob_get_clean();
        $runner->assertEqual(200, Response::getLastStatus());
        $runner->assertTrue(str_contains($html, 'Moderasi Komentar'));
        $runner->assertTrue(str_contains($html, '&lt;script&gt;alert(1)&lt;/script&gt;'));
        $runner->assertFalse(str_contains($html, '<img src=x onerror=alert(1)>'));
        $runner->assertFalse(str_contains($html, 'Andi Pembaca'), 'Filter pending tidak boleh menampilkan komentar approved');

        // 4b. Status filter tidak valid fallback ke 'all'
        $_GET = ['status' => 'unknown'];
        Response::resetState();
        ob_start();
        $router->dispatch('/admin/comments?status=unknown', 'GET');
        $htmlAll = ob_get_clean();
        $runner->assertTrue(str_contains($htmlAll, 'Andi Pembaca'));
        $runner->assertTrue(str_contains($htmlAll, 'Citra'));

        // 4c. ID malformed / tidak ditemukan -> 404
        $_POST = ['csrf_token' => $token];
        $_SERVER = ['HTTP_ACCEPT' => 'application/json'];
        Response::resetState();
        ob_start();
        $router->dispatch('/admin/comments/9999/approve', 'POST');
        $notFoundOut = json_decode(ob_get_clean(), true);
        $runner->assertEqual(404, Response::getLastStatus());
        $runner->assertFalse($notFoundOut['success']);

        $_SERVER = [];
        Response::resetState();
        ob_start();
        $router->dispatch('/admin/comments/abc/hide', 'POST');
        ob_end_clean();
        $runner->assertEqual(404, Response::getLastStatus());

        // 4d. Approve komentar #3 via HTML POST -> redirect + flash + masuk getByPostId(1)
        $_POST = ['csrf_token' => $token];
        $_SERVER = [];
        Response::resetState();
        ob_start();
        $router->dispatch('/admin/comments/3/approve', 'POST');
        ob_end_clean();
        $runner->assertEqual(302, Response::getLastStatus());
        $runner->assertEqual('/admin/comments', Response::getLastRedirect());
        $runner->assertEqual(1, (int)Comment::findById(3)['is_approved']);
        $approvedPost1Ids = array_map(fn($c) => (int)$c['id'], Comment::getByPostId(1));
        $runner->assertTrue(in_array(3, $approvedPost1Ids, true));

        // Flash dikonsumsi sekali pada GET /admin/comments
        $_GET = [];
        Response::resetState();
        ob_start();
        $router->dispatch('/admin/comments', 'GET');
        $afterApproveHtml = ob_get_clean();
        $runner->assertTrue(str_contains($afterApproveHtml, 'Komentar berhasil disetujui.'));

        // 4e. Hide komentar #3 via AJAX JSON (X-CSRF-Token) -> 200 & hilang dari getByPostId(1)
        $_POST = [];
        $_SERVER = ['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_X_CSRF_TOKEN' => $token];
        Response::resetState();
        ob_start();
        $router->dispatch('/admin/comments/3/hide', 'POST');
        $hideOut = json_decode(ob_get_clean(), true);
        $runner->assertEqual(200, Response::getLastStatus());
        $runner->assertTrue($hideOut['success']);
        $runner->assertEqual(0, $hideOut['is_approved']);
        $runner->assertEqual('pending', $hideOut['status']);
        $runner->assertEqual(['total' => 4, 'all' => 4, 'approved' => 2, 'pending' => 2], $hideOut['counts']);
        $runner->assertEqual(0, (int)Comment::findById(3)['is_approved']);

        // 4f. Reply admin kosong / array -> 400
        $_POST = ['csrf_token' => $token, 'comment_text' => '   '];
        $_SERVER = ['HTTP_ACCEPT' => 'application/json'];
        Response::resetState();
        ob_start();
        $router->dispatch('/admin/comments/1/reply', 'POST');
        $badReply = json_decode(ob_get_clean(), true);
        $runner->assertEqual(400, Response::getLastStatus());
        $runner->assertFalse($badReply['success']);

        // 4g. Reply admin valid -> 201, is_admin_reply=1, is_bot_reply=0, is_approved=1, author dari session
        $_POST = ['csrf_token' => $token, 'comment_text' => "Halo Andi,\nTerima kasih masukannya & <tetap> semangat!"];
        $_SERVER = ['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest'];
        Response::resetState();
        ob_start();
        $router->dispatch('/admin/comments/1/reply', 'POST');
        $replyOut = json_decode(ob_get_clean(), true);
        $runner->assertEqual(201, Response::getLastStatus());
        $runner->assertTrue($replyOut['success']);
        $runner->assertEqual(1, (int)$replyOut['parent_id']);
        $runner->assertEqual(1, (int)$replyOut['comment']['is_admin_reply']);
        $runner->assertEqual(0, (int)$replyOut['comment']['is_bot_reply']);
        $runner->assertEqual('Editor Utama', $replyOut['comment']['author_name']);
        $runner->assertEqual(['total' => 5, 'all' => 5, 'approved' => 3, 'pending' => 2], $replyOut['counts']);
        $savedReply = Comment::findById((int)$replyOut['id']);
        $runner->assertEqual(1, (int)$savedReply['is_admin_reply']);
        $runner->assertEqual("Halo Andi,\nTerima kasih masukannya & <tetap> semangat!", $savedReply['comment_text']);

        // 4h. Delete komentar #1 via AJAX JSON -> 200 & cascade menghapus balasan id=2 dan reply admin baru + sync counts
        $_POST = ['csrf_token' => $token];
        $_SERVER = ['HTTP_ACCEPT' => 'application/json'];
        Response::resetState();
        ob_start();
        $router->dispatch('/admin/comments/1/delete', 'POST');
        $delOut = json_decode(ob_get_clean(), true);
        $runner->assertEqual(200, Response::getLastStatus());
        $runner->assertTrue($delOut['success']);
        $runner->assertEqual(['total' => 2, 'all' => 2, 'approved' => 0, 'pending' => 2], $delOut['counts']);
        $runner->assertEqual(null, Comment::findById(1));
        $runner->assertEqual(null, Comment::findById(2));
        $runner->assertEqual(null, Comment::findById((int)$replyOut['id']));

        // 4i. Approve komentar #3 via AJAX JSON -> 200 + counts diperbarui
        $_POST = ['csrf_token' => $token];
        $_SERVER = ['HTTP_ACCEPT' => 'application/json'];
        Response::resetState();
        ob_start();
        $router->dispatch('/admin/comments/3/approve', 'POST');
        $approveOut = json_decode(ob_get_clean(), true);
        $runner->assertEqual(200, Response::getLastStatus());
        $runner->assertTrue($approveOut['success']);
        $runner->assertEqual(['total' => 2, 'all' => 2, 'approved' => 1, 'pending' => 1], $approveOut['counts']);

        // 4j. DB error saat Comment::findById harus mengembalikan 500 JSON bersih (bukan uncaught PDOException)
        $failingPdo = new FakePDO();
        $failingPdo->setResponder(function () {
            throw new PDOException('Simulated connection drop');
        });
        Database::setCustomConnection($failingPdo);
        foreach (['approve', 'hide', 'reply', 'delete'] as $method) {
            $_POST = ['csrf_token' => $token, 'comment_text' => 'Balasan'];
            $_SERVER = ['HTTP_ACCEPT' => 'application/json'];
            Response::resetState();
            ob_start();
            $router->dispatch("/admin/comments/3/{$method}", 'POST');
            $errOut = json_decode(ob_get_clean(), true);
            $runner->assertEqual(500, Response::getLastStatus(), "DB error pada {$method} harus mengembalikan HTTP 500");
            $runner->assertFalse($errOut['success']);
        }
    } finally {
        Database::resetConnection();
        Response::resetState();
        $_SESSION = [];
        $_POST = $origPost;
        $_GET = $origGet;
        $_SERVER = $origServer;
    }
});

// =========================================================================
// 5. Public Threading View (views/posts/detail.php): hierarki, orphan, badge Admin/Assistant, single-escape
// =========================================================================
$runner->test('views/posts/detail.php merender thread bertingkat, orphan reply, badge Admin vs Assistant, dan single-escape', function () use ($runner) {
    $_SESSION = [];
    $post = [
        'id'            => 1,
        'title'         => 'Artikel Threading',
        'category_name' => 'Teknologi',
        'author_name'   => 'Admin',
        'reading_time'  => 3,
        'published_at'  => '2026-01-10 09:00:00',
        'content'       => '<p>Isi artikel.</p>',
    ];
    $comments = [
        [
            'id'             => 10,
            'post_id'        => 1,
            'parent_id'      => null,
            'author_name'    => 'Induk Pertama',
            'comment_text'   => "Halo <dunia> & 'teman'\nBaris kedua",
            'is_bot_reply'   => 0,
            'is_admin_reply' => 0,
            'created_at'     => '2026-01-10 10:00:00',
        ],
        [
            'id'             => 11,
            'post_id'        => 1,
            'parent_id'      => 10,
            'author_name'    => 'Editor Utama',
            'comment_text'   => 'Balasan resmi admin',
            'is_bot_reply'   => 0,
            'is_admin_reply' => 1,
            'created_at'     => '2026-01-10 10:05:00',
        ],
        [
            'id'             => 12,
            'post_id'        => 1,
            'parent_id'      => 10,
            'author_name'    => 'NeoBlog Assistant',
            'comment_text'   => 'Balasan bot assistant',
            'is_bot_reply'   => 1,
            'is_admin_reply' => 0,
            'created_at'     => '2026-01-10 10:06:00',
        ],
        [
            'id'             => 13,
            'post_id'        => 1,
            'parent_id'      => 999, // Parent disembunyikan -> orphan approved reply tetap tampil
            'author_name'    => 'Orphan Approved',
            'comment_text'   => 'Tetap tampil di root',
            'is_bot_reply'   => 0,
            'is_admin_reply' => 0,
            'created_at'     => '2026-01-10 10:07:00',
        ],
    ];

    $capturedWarnings = [];
    set_error_handler(function (int $severity, string $msg) use (&$capturedWarnings): bool {
        $capturedWarnings[] = $msg;
        return true;
    });

    try {
        ob_start();
        require __DIR__ . '/../../views/posts/detail.php';
        $html = ob_get_clean();

        $runner->assertEqual([], $capturedWarnings);
        $runner->assertTrue(str_contains($html, 'id="commentParentId"'));
        $runner->assertTrue(str_contains($html, 'Diskusi Komunitas (<span id="commentsCount">4</span>)'));
        $runner->assertTrue(str_contains($html, 'comment-item comment-reply admin-reply'));
        $runner->assertTrue(str_contains($html, '<span class="badge badge-admin">Admin</span>'));
        $runner->assertTrue(str_contains($html, '<span class="badge">Assistant</span>'));
        $runner->assertTrue(str_contains($html, 'Orphan Approved'));
        $runner->assertTrue(str_contains($html, 'Halo &lt;dunia&gt; &amp; &#039;teman&#039;<br />'));
        $runner->assertFalse(str_contains($html, '&amp;lt;dunia&amp;gt;'), 'Tidak boleh terjadi double-encoding');

        // Mutual 2-node parent cycle (id=60 <-> id=61) harus tetap ter-render tepat sekali per node tanpa hilang
        $comments = [
            [
                'id'             => 60,
                'post_id'        => 1,
                'parent_id'      => 61,
                'author_name'    => 'Cycle Node A',
                'comment_text'   => 'Komentar siklus A',
                'is_bot_reply'   => 0,
                'is_admin_reply' => 0,
                'created_at'     => '2026-01-10 11:00:00',
            ],
            [
                'id'             => 61,
                'post_id'        => 1,
                'parent_id'      => 60,
                'author_name'    => 'Cycle Node B',
                'comment_text'   => 'Komentar siklus B',
                'is_bot_reply'   => 0,
                'is_admin_reply' => 0,
                'created_at'     => '2026-01-10 11:01:00',
            ],
        ];

        ob_start();
        require __DIR__ . '/../../views/posts/detail.php';
        $cycleHtml = ob_get_clean();

        $runner->assertEqual([], $capturedWarnings);
        $runner->assertTrue(str_contains($cycleHtml, 'Diskusi Komunitas (<span id="commentsCount">2</span>)'));
        $runner->assertEqual(1, substr_count($cycleHtml, 'id="comment-60"'), 'Cycle Node A harus dirender tepat sekali');
        $runner->assertEqual(1, substr_count($cycleHtml, 'id="comment-61"'), 'Cycle Node B harus dirender tepat sekali');
        $runner->assertTrue(str_contains($cycleHtml, 'Cycle Node A'));
        $runner->assertTrue(str_contains($cycleHtml, 'Cycle Node B'));
    } finally {
        restore_error_handler();
        $_SESSION = [];
    }
});
