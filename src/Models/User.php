<?php
require_once __DIR__ . '/../../config/database.php';

/**
 * Model User untuk autentikasi dan manajemen pengguna
 */
class User {
    public static function findByIdentifier(string $identifier): ?array {
        $pdo = Database::getConnection();
        $sql = "SELECT id, username, email, password_hash, full_name, role, created_at
                FROM users
                WHERE username = :username OR email = :email
                LIMIT 1";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':username' => $identifier,
            ':email'    => $identifier,
        ]);
        $result = $stmt->fetch();
        return $result ?: null;
    }

    public static function findById(int $id): ?array {
        $pdo = Database::getConnection();
        $sql = "SELECT id, username, email, full_name, role, created_at
                FROM users
                WHERE id = :id
                LIMIT 1";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([':id' => $id]);
        $result = $stmt->fetch();
        return $result ?: null;
    }
}
