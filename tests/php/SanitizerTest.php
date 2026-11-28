<?php
require_once __DIR__ . '/../../src/Utils/Sanitizer.php';

/** @var TestRunner $runner */

$runner->test('Sanitizer: Menghapus tag script berbahaya (XSS Prevention)', function() use ($runner) {
    $dirty = "<script>alert('xss')</script>";
    $clean = Sanitizer::clean($dirty);
    $runner->assertEqual("&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;", $clean);
});

$runner->test('Sanitizer: Validasi dan sanitasi email', function() use ($runner) {
    $validEmail = "  user@example.com  ";
    $runner->assertEqual("user@example.com", Sanitizer::cleanEmail($validEmail));

    $invalidEmail = "not-an-email";
    $runner->assertEqual("", Sanitizer::cleanEmail($invalidEmail));
});

$runner->test('Sanitizer: Pembuatan slug dari judul teks', function() use ($runner) {
    $title = "Belajar PHP Native & MySQL 2026!";
    $slug = Sanitizer::slugify($title);
    $runner->assertEqual("belajar-php-native-mysql-2026", $slug);
});

$runner->test('Sanitizer: cleanHtml mengizinkan markup artikel, menjaga UTF-8, dan membuang XSS/tag berbahaya', function() use ($runner) {
    $runner->assertEqual('', Sanitizer::cleanHtml(null));
    $runner->assertEqual('', Sanitizer::cleanHtml('   '));

    $dirty = '<div class="wrap"><h2>Judul Café 🚀</h2><p onclick="alert(1)" style="color:red">Halo <strong>Dunia</strong> — <script>alert("xss")</script><iframe src="https://evil.test"></iframe><style>body{display:none}</style><svg onload="alert(1)"><circle/></svg></p><a href="java&#x09;script:alert(1)" target="_blank" onmouseover="evil()">Link Berbahaya</a> <a href="https://example.com" target="_blank">Link Aman</a><img src="data:text/html,<script>alert(1)</script>" onerror="alert(1)" alt="gambar"></div>';
    $clean = Sanitizer::cleanHtml($dirty);

    $runner->assertTrue(str_contains($clean, '<h2>Judul Café 🚀</h2>'), 'UTF-8 dan heading aman harus terjaga');
    $runner->assertTrue(str_contains($clean, '<p>Halo <strong>Dunia</strong>'), 'Atribut onclick/style harus dihapus dari tag aman');
    $runner->assertFalse(str_contains($clean, '<script'), 'Tag script harus dibuang');
    $runner->assertFalse(str_contains($clean, '<iframe'), 'Tag iframe harus dibuang');
    $runner->assertFalse(str_contains($clean, '<style'), 'Tag style harus dibuang');
    $runner->assertFalse(str_contains($clean, '<svg'), 'Tag svg harus dibuang');
    $runner->assertFalse(str_contains($clean, 'onclick'), 'Event handler on* harus dibuang');
    $runner->assertFalse(str_contains($clean, 'onerror'), 'Event handler onerror harus dibuang');
    $runner->assertFalse(str_contains(strtolower($clean), 'javascript:'), 'Skema javascript: harus dinetralkan');
    $runner->assertFalse(str_contains(strtolower($clean), 'data:text/html'), 'Skema data: harus dinetralkan');
    $runner->assertTrue(str_contains($clean, 'href="https://example.com"'), 'Link https aman harus dipertahankan');
    $runner->assertTrue(str_contains($clean, 'rel="noopener noreferrer"'), 'target=_blank wajib mendapat rel noopener noreferrer');
    $runner->assertFalse(str_contains($clean, '<div'), 'Tag div yang tidak di-allowlist harus di-unwrap');
    $runner->assertFalse(str_contains($clean, '<html>') || str_contains($clean, '<body>'), 'Wrapper html/body tidak boleh ikut tercetak');
});
