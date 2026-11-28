<?php
require_once __DIR__ . '/../../config/database.php';

/**
 * Model Post untuk operasi data artikel blog
 */
class Post {
    public static function getAllPublished(int $limit = 20): array {
        $pdo = Database::getConnection();
        $sql = "SELECT p.*, u.full_name as author_name, c.name as category_name, c.slug as category_slug,
                       (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id AND cm.is_approved = 1) as comment_count
                FROM posts p
                JOIN users u ON p.author_id = u.id
                LEFT JOIN categories c ON p.category_id = c.id
                WHERE p.status = 'published'
                ORDER BY p.published_at DESC, p.id DESC
                LIMIT :limit";
        
        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public static function findBySlug(string $slug): ?array {
        $pdo = Database::getConnection();
        $sql = "SELECT p.*, u.full_name as author_name, c.name as category_name
                FROM posts p
                JOIN users u ON p.author_id = u.id
                LEFT JOIN categories c ON p.category_id = c.id
                WHERE p.slug = :slug AND p.status = 'published'
                LIMIT 1";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':slug' => $slug]);
        $result = $stmt->fetch();
        return $result ?: null;
    }

    public static function create(array $data): int {
        $pdo = Database::getConnection();
        $status = $data['status'] ?? 'published';
        $publishedAt = array_key_exists('published_at', $data)
            ? $data['published_at']
            : ($status === 'published' ? date('Y-m-d H:i:s') : null);

        $sql = "INSERT INTO posts (author_id, category_id, title, slug, excerpt, content, reading_time, status, published_at)
                VALUES (:author_id, :category_id, :title, :slug, :excerpt, :content, :reading_time, :status, :published_at)";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':author_id'    => $data['author_id'] ?? 1,
            ':category_id'  => array_key_exists('category_id', $data) ? $data['category_id'] : 1,
            ':title'        => $data['title'],
            ':slug'         => $data['slug'],
            ':excerpt'      => $data['excerpt'] ?? '',
            ':content'      => $data['content'],
            ':reading_time' => $data['reading_time'] ?? 3,
            ':status'       => $status,
            ':published_at' => $publishedAt
        ]);
        return (int)$pdo->lastInsertId();
    }

    public static function countByStatus(): array {
        $pdo = Database::getConnection();
        $sql = "SELECT status, COUNT(*) AS cnt FROM posts GROUP BY status";
        $stmt = $pdo->prepare($sql);
        $stmt->execute();
        $rows = $stmt->fetchAll();

        $counts = [
            'total'     => 0,
            'all'       => 0,
            'published' => 0,
            'draft'     => 0,
            'archived'  => 0,
        ];

        foreach ($rows as $row) {
            $status = (string)($row['status'] ?? '');
            $cnt = (int)($row['cnt'] ?? 0);
            if (array_key_exists($status, $counts)) {
                $counts[$status] = $cnt;
            }
            $counts['total'] += $cnt;
            $counts['all'] += $cnt;
        }

        return $counts;
    }

    public static function getRecentForAdmin(int $limit = 5, ?string $status = null): array {
        $pdo = Database::getConnection();
        $sql = "SELECT p.*, u.full_name as author_name, c.name as category_name
                FROM posts p
                JOIN users u ON p.author_id = u.id
                LEFT JOIN categories c ON p.category_id = c.id";

        if ($status !== null && $status !== '' && $status !== 'all') {
            $sql .= " WHERE p.status = :status";
        }

        $sql .= " ORDER BY p.updated_at DESC, p.created_at DESC LIMIT :limit";

        $stmt = $pdo->prepare($sql);
        if ($status !== null && $status !== '' && $status !== 'all') {
            $stmt->bindValue(':status', $status, PDO::PARAM_STR);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public static function getAllForAdmin(?string $status = null, ?string $search = null, int $limit = 50, int $offset = 0): array {
        $pdo = Database::getConnection();
        $sql = "SELECT p.*, u.full_name as author_name, c.name as category_name, c.slug as category_slug,
                       (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) as comment_count
                FROM posts p
                JOIN users u ON p.author_id = u.id
                LEFT JOIN categories c ON p.category_id = c.id";

        $where = [];
        $params = [];

        if ($status !== null && in_array($status, ['draft', 'published', 'archived'], true)) {
            $where[] = 'p.status = :status';
            $params[':status'] = $status;
        }

        if ($search !== null && trim($search) !== '') {
            $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], trim($search));
            $like = '%' . $escaped . '%';
            $where[] = '(p.title LIKE :search_title OR p.slug LIKE :search_slug OR p.excerpt LIKE :search_excerpt)';
            $params[':search_title'] = $like;
            $params[':search_slug'] = $like;
            $params[':search_excerpt'] = $like;
        }

        if (!empty($where)) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }

        $sql .= ' ORDER BY p.updated_at DESC, p.created_at DESC, p.id DESC LIMIT :limit OFFSET :offset';

        $stmt = $pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, PDO::PARAM_STR);
        }
        $stmt->bindValue(':limit', max(1, $limit), PDO::PARAM_INT);
        $stmt->bindValue(':offset', max(0, $offset), PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public static function findById(int $id): ?array {
        $pdo = Database::getConnection();
        $sql = "SELECT p.*, u.full_name as author_name, c.name as category_name, c.slug as category_slug
                FROM posts p
                JOIN users u ON p.author_id = u.id
                LEFT JOIN categories c ON p.category_id = c.id
                WHERE p.id = :id
                LIMIT 1";

        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        $stmt->execute();
        $result = $stmt->fetch();
        return $result ?: null;
    }

    public static function slugExists(string $slug, ?int $excludeId = null): bool {
        $pdo = Database::getConnection();
        if ($excludeId !== null) {
            $sql = "SELECT 1 FROM posts WHERE slug = :slug AND id != :exclude_id LIMIT 1";
            $stmt = $pdo->prepare($sql);
            $stmt->bindValue(':slug', $slug, PDO::PARAM_STR);
            $stmt->bindValue(':exclude_id', $excludeId, PDO::PARAM_INT);
        } else {
            $sql = "SELECT 1 FROM posts WHERE slug = :slug LIMIT 1";
            $stmt = $pdo->prepare($sql);
            $stmt->bindValue(':slug', $slug, PDO::PARAM_STR);
        }
        $stmt->execute();
        return $stmt->fetch() !== false;
    }

    public static function update(int $id, array $data): bool {
        $pdo = Database::getConnection();
        $status = $data['status'] ?? 'draft';
        if (!in_array($status, ['draft', 'published', 'archived'], true)) {
            throw new InvalidArgumentException('Status artikel tidak valid.');
        }

        $hasExplicitPublishedAt = array_key_exists('published_at', $data);
        $publishedAtClause = '';
        if ($hasExplicitPublishedAt) {
            $publishedAtClause = ', published_at = :published_at';
        } elseif ($status === 'published') {
            $publishedAtClause = ', published_at = COALESCE(published_at, NOW())';
        }

        $sql = "UPDATE posts
                SET category_id = :category_id,
                    title = :title,
                    slug = :slug,
                    excerpt = :excerpt,
                    content = :content,
                    reading_time = :reading_time,
                    status = :status{$publishedAtClause}
                WHERE id = :id";

        $stmt = $pdo->prepare($sql);
        $params = [
            ':category_id'  => array_key_exists('category_id', $data) ? $data['category_id'] : null,
            ':title'        => $data['title'],
            ':slug'         => $data['slug'],
            ':excerpt'      => $data['excerpt'] ?? '',
            ':content'      => $data['content'],
            ':reading_time' => (int)($data['reading_time'] ?? 3),
            ':status'       => $status,
            ':id'           => $id,
        ];
        if ($hasExplicitPublishedAt) {
            $params[':published_at'] = $data['published_at'];
        }

        return (bool)$stmt->execute($params);
    }

    public static function updateStatus(int $id, string $status): bool {
        if (!in_array($status, ['draft', 'published', 'archived'], true)) {
            throw new InvalidArgumentException('Status artikel tidak valid.');
        }

        $pdo = Database::getConnection();
        if ($status === 'published') {
            $sql = "UPDATE posts SET status = :status, published_at = NOW() WHERE id = :id";
        } else {
            $sql = "UPDATE posts SET status = :status WHERE id = :id";
        }

        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(':status', $status, PDO::PARAM_STR);
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        return (bool)$stmt->execute();
    }

    public static function delete(int $id): bool {
        $pdo = Database::getConnection();
        $sql = "DELETE FROM posts WHERE id = :id";
        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        return (bool)$stmt->execute();
    }
}
