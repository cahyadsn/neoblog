<?php
require_once __DIR__ . '/../../src/Utils/CSRF.php';

/** @var TestRunner $runner */

$runner->test('CSRF: Membuat token 64 karakter hex yang valid', function() use ($runner) {
    $token = CSRF::getToken();
    $runner->assertTrue(!empty($token), 'Token tidak boleh kosong');
    $runner->assertEqual(64, strlen($token), 'Panjang token harus 64 karakter hex');
});

$runner->test('CSRF: Memverifikasi validitas token yang sama', function() use ($runner) {
    $token = CSRF::getToken();
    $runner->assertTrue(CSRF::validate($token), 'Token sah harus tervalidasi');
    $runner->assertFalse(CSRF::validate('token_palsu_123'), 'Token salah harus ditolak');
    $runner->assertFalse(CSRF::validate(''), 'Token kosong harus ditolak');
});

$runner->test('CSRF: validateRequest mendukung POST, header X-CSRF-Token, dan menolak payload array', function() use ($runner) {
    $origPost = $_POST;
    $origServer = $_SERVER;
    try {
        $token = CSRF::getToken();

        // 1. Valid via $_POST['csrf_token']
        $_POST = ['csrf_token' => $token];
        unset($_SERVER['HTTP_X_CSRF_TOKEN']);
        $runner->assertTrue(CSRF::validateRequest(), 'Token via POST harus valid');

        // 2. Valid via $_SERVER['HTTP_X_CSRF_TOKEN']
        $_POST = [];
        $_SERVER['HTTP_X_CSRF_TOKEN'] = $token;
        $runner->assertTrue(CSRF::validateRequest(), 'Token via X-CSRF-Token header harus valid');

        // 3. Invalid atau hilang
        $_POST = [];
        unset($_SERVER['HTTP_X_CSRF_TOKEN']);
        $runner->assertFalse(CSRF::validateRequest(), 'Request tanpa token harus ditolak');

        // 4. Non-string array payload csrf_token[]=x tidak boleh memicu TypeError
        $_POST = ['csrf_token' => ['array_payload']];
        $runner->assertFalse(CSRF::validateRequest(), 'Payload array harus ditolak dengan aman');
    } finally {
        $_POST = $origPost;
        $_SERVER = $origServer;
    }
});
