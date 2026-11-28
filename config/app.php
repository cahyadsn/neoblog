<?php
/**
 * Konfigurasi Global Aplikasi NeoBlog
 */

// Laporkan semua error pada fase development
error_reporting(E_ALL);
ini_set('display_errors', '1');

// Set timezone default
date_default_timezone_set('Asia/Jakarta');

// Konstanta direktori
define('BASE_PATH', dirname(__DIR__));
define('APP_PATH', BASE_PATH . '/src');
define('VIEW_PATH', BASE_PATH . '/views');
define('PUBLIC_PATH', BASE_PATH . '/public');

// Mulai session jika belum aktif dengan cookie hardening
if (session_status() === PHP_SESSION_NONE && !headers_sent()) {
    if (PHP_SAPI !== 'cli') {
        ini_set('session.use_strict_mode', '1');
        $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443);
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'domain'   => '',
            'secure'   => $isHttps,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }
    session_start();
}
