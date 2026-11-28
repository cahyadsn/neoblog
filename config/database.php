<?php
/**
 * Koneksi Database MySQL Singleton menggunakan PDO
 */

class Database {
    private static ?PDO $instance = null;

    private function __construct() {}
    private function __clone() {}

    public static function getConnection(): PDO {
        if (self::$instance === null) {
            $host = getenv('DB_HOST') ?: 'localhost';
            $port = getenv('DB_PORT') ?: '3306';
            $dbname = getenv('DB_NAME') ?: 'neoblog';
            $user = getenv('DB_USER') ?: 'root';
            $pass = getenv('DB_PASS') ?: '';

            $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4";
            
            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ];

            try {
                self::$instance = new PDO($dsn, $user, $pass, $options);
            } catch (PDOException $e) {
                // Di mode dev, kita tangani jika DB belum dibuat
                throw new PDOException("Database connection error: " . $e->getMessage(), (int)$e->getCode());
            }
        }
        return self::$instance;
    }

    /**
     * Helper untuk SQLite fallback saat pengujian lokal/CI jika MySQL belum berjalan
     */
    public static function setCustomConnection(PDO $pdo): void {
        self::$instance = $pdo;
    }

    /**
     * Reset singleton koneksi (berguna untuk isolasi unit test)
     */
    public static function resetConnection(): void {
        self::$instance = null;
    }
}
