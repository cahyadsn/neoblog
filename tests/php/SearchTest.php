<?php
require_once __DIR__ . '/../../config/app.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/helpers/FakePDO.php';
require_once __DIR__ . '/../../src/Router.php';
require_once __DIR__ . '/../../src/Models/Post.php';
require_once __DIR__ . '/../../src/Controllers/PostController.php';

/** @var TestRunner $runner */

$setupSearchEnvironment = function(): void {
    $categories = [
        ['id' => 1, 'name' => 'Teknologi', 'slug' => 'teknologi'],
        ['id' => 2, 'name' => 'Tutorial', 'slug' => 'tutorial'],
    ];

    $posts = [
        [
            'id'           => 1,
            'category_id'  => 1,
            'category_name'=> 'Teknologi',
            'category_slug'=> 'teknologi',
            'title'        => 'Membangun Arsitektur Multi-Agent di Antigravity',
            'slug'         => 'arsitektur-multi-agent',
            'excerpt'      => 'Panduan merancang arsitektur otonom multi-agent modern.',
            'content'      => '<p>Dalam artikel ini kita mempelajari sistem multi-agent berbasis arsitektur terdistribusi.</p>',
            'status'       => 'published',
            'published_at' => '2026-11-20 10:00:00',
        ],
        [
            'id'           => 2,
            'category_id'  => 2,
            'category_name'=> 'Tutorial',
            'category_slug'=> 'tutorial',
            'title'        => 'Tutorial Native PHP 8.3 Tanpa Framework',
            'slug'         => 'tutorial-native-php-8-3',
            'excerpt'      => 'Belajar PHP native zero-dependency berkinerja tinggi.',
            'content'      => '<p>PHP native memberikan kebebasan desain tanpa ketergantungan library luar.</p>',
            'status'       => 'published',
            'published_at' => '2026-11-21 11:00:00',
        ],
        [
            'id'           => 3,
            'category_id'  => 1,
            'category_name'=> 'Teknologi',
            'category_slug'=> 'teknologi',
            'title'        => 'Draf Rahasia Arsitektur AI',
            'slug'         => 'draf-rahasia-arsitektur-ai',
            'excerpt'      => 'Artikel draf tidak boleh muncul dalam pencarian publik.',
            'content'      => '<p>Arsitektur rahasia internal draft status.</p>',
            'status'       => 'draft',
            'published_at' => null,
        ],
    ];

    $fake = new FakePDO();
    $fake->setResponder(function (string $sql, array $params) use (&$posts, &$categories): array {
        // Mock query pencarian (baik FULLTEXT maupun LIKE fallback)
        if (stripos($sql, 'MATCH(p.title, p.content)') !== false || stripos($sql, 'p.title LIKE') !== false) {
            $queryTerm = '';
            if (isset($params[':query'])) {
                $queryTerm = $params[':query'];
            } elseif (isset($params[':likeTitle'])) {
                $queryTerm = trim($params[':likeTitle'], '%');
            }

            $matched = [];
            foreach ($posts as $p) {
                // Hanya artikel published yang boleh dicari
                if ($p['status'] !== 'published') {
                    continue;
                }

                $haystack = ($p['title'] ?? '') . ' ' . ($p['content'] ?? '');
                if ($queryTerm !== '' && stripos($haystack, $queryTerm) !== false) {
                    $matched[] = [
                        'id'           => $p['id'],
                        'title'        => $p['title'],
                        'slug'         => $p['slug'],
                        'excerpt'      => $p['excerpt'],
                        'content'      => $p['content'],
                        'published_at' => $p['published_at'],
                        'category_name'=> $p['category_name'],
                        'category_slug'=> $p['category_slug'],
                        'relevance'    => 1.5,
                    ];
                }
            }

            return ['rows' => $matched, 'rowCount' => count($matched)];
        }

        return ['rows' => [], 'rowCount' => 0];
    });

    Database::setCustomConnection($fake);
};

$runner->test('Post::search mengembalikan hasil artikel relevan berstatus published', function () use ($setupSearchEnvironment, $runner) {
    $setupSearchEnvironment();

    $results = Post::search('arsitektur', 10);
    $runner->assertTrue(is_array($results), 'Hasil search harus berupa array');
    $runner->assertEqual(1, count($results), 'Harus menemukan tepat 1 artikel published dengan kata "arsitektur"');
    $runner->assertEqual('Membangun Arsitektur Multi-Agent di Antigravity', $results[0]['title']);
    $runner->assertEqual('arsitektur-multi-agent', $results[0]['slug']);
    $runner->assertTrue(str_contains(strtolower($results[0]['snippet']), 'arsitektur'), 'Snippet harus mengandung kata kunci');
});

$runner->test('Post::search menolak menampilkan artikel berstatus draft', function () use ($setupSearchEnvironment, $runner) {
    $setupSearchEnvironment();

    $results = Post::search('Rahasia', 10);
    $runner->assertEqual(0, count($results), 'Artikel draf tidak boleh muncul dalam hasil pencarian');
});

$runner->test('Post::search dengan query kosong atau spasi mengembalikan array kosong', function () use ($setupSearchEnvironment, $runner) {
    $setupSearchEnvironment();

    $runner->assertEqual([], Post::search('   '), 'Query spasi harus return []');
    $runner->assertEqual([], Post::search(''), 'Query kosong harus return []');
});

$runner->test('PostController::apiSearch merespons JSON terstruktur dan status 200', function () use ($setupSearchEnvironment, $runner) {
    $setupSearchEnvironment();

    $_GET['q'] = 'PHP';
    ob_start();
    $controller = new PostController();
    $controller->apiSearch();
    $output = ob_get_clean();

    $data = json_decode($output, true);
    $runner->assertTrue(is_array($data), 'Response harus berupa JSON valid');
    $runner->assertTrue($data['success'] ?? false, 'success flag harus bernilai true');
    $runner->assertEqual('PHP', $data['query'] ?? null);
    $runner->assertEqual(1, $data['total'] ?? null);
    $runner->assertEqual('tutorial-native-php-8-3', $data['data'][0]['slug'] ?? null);
});

$runner->test('Router mendaftarkan GET /api/search dengan benar', function () use ($setupSearchEnvironment, $runner) {
    $setupSearchEnvironment();

    $router = new Router();
    $router->get('/api/search', [PostController::class, 'apiSearch']);

    $_GET['q'] = 'arsitektur';
    ob_start();
    $router->dispatch('/api/search', 'GET');
    $output = ob_get_clean();

    $data = json_decode($output, true);
    $runner->assertTrue($data['success'] ?? false, 'Dispatch rute /api/search harus sukses');
    $runner->assertEqual(1, $data['total'] ?? 0);
});
