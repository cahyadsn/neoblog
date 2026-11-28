<?php
require_once __DIR__ . '/../../src/Router.php';

/** @var TestRunner $runner */

$runner->test('Router: Menangkap dan memetakan parameter URL dinamis', function() use ($runner) {
    $router = new Router();
    $matchedSlug = null;

    $router->get('/post/{slug}', function($slug) use (&$matchedSlug) {
        $matchedSlug = $slug;
    });

    $router->dispatch('/post/belajar-php-native', 'GET');
    $runner->assertEqual('belajar-php-native', $matchedSlug, 'Slug URL dinamis harus cocok');
});

$runner->test('Router: Menolak method HTTP yang tidak sesuai', function() use ($runner) {
    $router = new Router();
    $called = false;

    $router->post('/api/test', function() use (&$called) {
        $called = true;
    });

    // Jalankan dengan method GET pada rute POST
    ob_start();
    $router->dispatch('/api/test', 'GET');
    ob_end_clean();

    $runner->assertFalse($called, 'Handler tidak boleh dipanggil jika method HTTP berbeda');
});

$runner->test('Router: Mengembalikan JSON 404 untuk rute API/AJAX dan menormalisasi trailing slash', function() use ($runner) {
    $origServer = $_SERVER;
    Response::resetState();
    try {
        $router = new Router();
        $hit = false;
        $router->get('/admin/posts/', function() use (&$hit) {
            $hit = true;
        });

        // Trailing slash pada definisi route dan request
        $router->dispatch('/admin/posts', 'GET');
        $runner->assertTrue($hit, 'Normalisasi trailing slash harus mencocokkan rute');

        // /api/missing -> JSON 404
        Response::resetState();
        ob_start();
        $router->dispatch('/api/missing', 'GET');
        $jsonOut = ob_get_clean();
        $decoded = json_decode($jsonOut, true);
        $runner->assertEqual(404, Response::getLastStatus());
        $runner->assertFalse($decoded['success'] ?? true, 'JSON 404 harus mengembalikan success=false');
        $runner->assertTrue(!empty($decoded['error']), 'JSON 404 harus menyertakan pesan error');

        // Accept: application/json -> JSON 404
        Response::resetState();
        $_SERVER['HTTP_ACCEPT'] = 'application/json';
        ob_start();
        $router->dispatch('/halaman-tidak-ada', 'GET');
        $acceptOut = ob_get_clean();
        $decodedAccept = json_decode($acceptOut, true);
        $runner->assertEqual(404, Response::getLastStatus());
        $runner->assertFalse($decodedAccept['success'] ?? true);
    } finally {
        Response::resetState();
        $_SERVER = $origServer;
    }
});
