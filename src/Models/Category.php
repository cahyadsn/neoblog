<?php
require_once __DIR__ . '/../../config/database.php';

/**
 * Model Category untuk daftar dan pencarian kategori artikel
 */
class Category {
    public static function getAll(): array {
        $pdo = Database::getConnection();
        $sql = "SELECT id, name, slug, description
                FROM categories
                ORDER BY name ASC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public static function findById(int $id): ?array {
        $pdo = Database::getConnection();
        $sql = "SELECT id, name, slug, description
                FROM categories
                WHERE id = :id
                LIMIT 1";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':id' => $id]);
        $result = $stmt->fetch();
        return $result ?: null;
    }
}
