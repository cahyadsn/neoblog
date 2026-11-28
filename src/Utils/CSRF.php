<?php
/**
 * CSRF Protection Token Manager
 */

class CSRF {
    private const SESSION_KEY = 'neoblog_csrf_token';

    /**
     * Dapatkan token aktif atau buat token baru
     */
    public static function getToken(): string {
        if (empty($_SESSION[self::SESSION_KEY])) {
            $_SESSION[self::SESSION_KEY] = bin2hex(random_bytes(32));
        }
        return $_SESSION[self::SESSION_KEY];
    }

    /**
     * Generate hidden input HTML tag
     */
    public static function field(): string {
        $token = self::getToken();
        return '<input type="hidden" name="csrf_token" value="' . htmlspecialchars($token, ENT_QUOTES, 'UTF-8') . '">';
    }

    /**
     * Validasi token dari request POST / header
     */
    public static function validate(?string $token): bool {
        if (empty($token) || empty($_SESSION[self::SESSION_KEY])) {
            return false;
        }
        return hash_equals($_SESSION[self::SESSION_KEY], $token);
    }

    /**
     * Validasi token CSRF langsung dari request POST atau header X-CSRF-Token
     */
    public static function validateRequest(): bool {
        $token = $_POST['csrf_token'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? null;
        if (!is_string($token)) {
            return false;
        }
        return self::validate($token);
    }
}
