<?php
require_once __DIR__ . '/../Models/User.php';
require_once __DIR__ . '/Response.php';
require_once __DIR__ . '/Sanitizer.php';

/**
 * Autentikasi Sesi & Role-Based Access Control (RBAC)
 */
class Auth {
    private const SESSION_KEY = 'neoblog_user';

    public static function attempt(string $identifier, string $password, bool $persistSession = true): ?array {
        $identifier = trim($identifier);
        if ($identifier === '' || $password === '') {
            return null;
        }

        $user = User::findByIdentifier($identifier);
        if (!$user || !password_verify($password, (string)$user['password_hash'])) {
            return null;
        }

        $safeUser = [
            'id'        => (int)$user['id'],
            'username'  => (string)$user['username'],
            'email'     => (string)$user['email'],
            'full_name' => (string)$user['full_name'],
            'role'      => (string)$user['role'],
        ];

        if ($persistSession) {
            self::loginUser($safeUser);
        }

        return $safeUser;
    }

    public static function loginUser(array $user): void {
        if (session_status() === PHP_SESSION_ACTIVE && !headers_sent()) {
            session_regenerate_id(true);
        }

        $_SESSION[self::SESSION_KEY] = [
            'id'        => (int)($user['id'] ?? 0),
            'username'  => (string)($user['username'] ?? ''),
            'email'     => (string)($user['email'] ?? ''),
            'full_name' => (string)($user['full_name'] ?? ''),
            'role'      => (string)($user['role'] ?? 'author'),
        ];
    }

    public static function logout(): void {
        unset($_SESSION[self::SESSION_KEY]);
        if (session_status() === PHP_SESSION_ACTIVE && !headers_sent()) {
            session_regenerate_id(true);
        }
    }

    public static function user(): ?array {
        if (!isset($_SESSION[self::SESSION_KEY]) || !is_array($_SESSION[self::SESSION_KEY])) {
            return null;
        }
        $user = $_SESSION[self::SESSION_KEY];
        if (!isset($user['id'], $user['role'])) {
            return null;
        }
        return $user;
    }

    public static function check(): bool {
        return self::user() !== null;
    }

    public static function hasRole(string|array $roles, ?array $user = null): bool {
        $target = $user ?? self::user();
        if ($target === null) {
            return false;
        }
        $allowed = is_array($roles) ? $roles : [$roles];
        return in_array($target['role'] ?? '', $allowed, true);
    }

    public static function requireAdminOrEditor(bool $isApi = false): ?array {
        $wantsJson = $isApi || Response::isJsonRequest();

        if (!self::check()) {
            if ($wantsJson) {
                Response::json(['success' => false, 'error' => 'Autentikasi diperlukan.'], 401);
            } else {
                Response::redirect('/admin/login', 302);
            }
            return null;
        }

        $user = self::user();
        if (!self::hasRole(['admin', 'editor'], $user)) {
            if ($wantsJson) {
                Response::json(['success' => false, 'error' => 'Akses ditolak. Anda tidak memiliki izin untuk halaman ini.'], 403);
            } else {
                Response::setStatus(403);
                echo '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>403 Akses Ditolak - NeoBlog</title><link rel="stylesheet" href="/assets/css/style.css"></head><body><main class="main-content"><div class="container"><div class="admin-card"><h1>403 Akses Ditolak</h1><p>Akun Anda (' . Sanitizer::clean((string)($user['role'] ?? '')) . ') tidak memiliki izin untuk mengakses Dashboard CMS.</p><p style="margin-top:1rem;"><a href="/" class="btn btn-primary">Kembali ke Beranda</a></p></div></div></main></body></html>';
            }
            return null;
        }

        return $user;
    }
}
