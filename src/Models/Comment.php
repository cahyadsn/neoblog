<?php
require_once __DIR__ . '/../../config/database.php';

/**
 * Model Comment untuk operasi data komentar artikel
 */
class Comment {
    public static function getByPostId(int $postId): array {
        $pdo = Database::getConnection();
        $sql = "SELECT id, post_id, parent_id, author_name, author_email, comment_text,
                       is_approved, is_bot_reply, is_admin_reply, created_at
                FROM comments
                WHERE post_id = :post_id AND is_approved = 1
                ORDER BY created_at ASC, id ASC";

        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(':post_id', $postId, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public static function create(array $data): int {
        $pdo = Database::getConnection();
        $sql = "INSERT INTO comments (post_id, parent_id, author_name, author_email, comment_text, is_approved, is_bot_reply, is_admin_reply)
                VALUES (:post_id, :parent_id, :author_name, :author_email, :comment_text, :is_approved, :is_bot_reply, :is_admin_reply)";

        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(':post_id', (int)$data['post_id'], PDO::PARAM_INT);
        $parentId = (isset($data['parent_id']) && $data['parent_id'] !== '' && $data['parent_id'] !== null)
            ? (int)$data['parent_id']
            : null;
        if ($parentId === null) {
            $stmt->bindValue(':parent_id', null, PDO::PARAM_NULL);
        } else {
            $stmt->bindValue(':parent_id', $parentId, PDO::PARAM_INT);
        }
        $stmt->bindValue(':author_name', (string)$data['author_name'], PDO::PARAM_STR);
        $stmt->bindValue(':author_email', (string)$data['author_email'], PDO::PARAM_STR);
        $stmt->bindValue(':comment_text', (string)$data['comment_text'], PDO::PARAM_STR);
        $stmt->bindValue(':is_approved', (int)($data['is_approved'] ?? 1), PDO::PARAM_INT);
        $stmt->bindValue(':is_bot_reply', (int)($data['is_bot_reply'] ?? 0), PDO::PARAM_INT);
        $stmt->bindValue(':is_admin_reply', (int)($data['is_admin_reply'] ?? 0), PDO::PARAM_INT);
        $stmt->execute();
        return (int)$pdo->lastInsertId();
    }

    public static function getAllForModeration(?string $approvalFilter = null, ?int $postId = null, int $limit = 50, int $offset = 0): array {
        $pdo = Database::getConnection();

        $conditions = [];
        $intParams = [];

        if ($approvalFilter === 'pending') {
            $conditions[] = 'c.is_approved = :is_approved';
            $intParams[':is_approved'] = 0;
        } elseif ($approvalFilter === 'approved') {
            $conditions[] = 'c.is_approved = :is_approved';
            $intParams[':is_approved'] = 1;
        }

        if ($postId !== null && $postId > 0) {
            $conditions[] = 'c.post_id = :post_id';
            $intParams[':post_id'] = $postId;
        }

        $whereClause = '';
        if (!empty($conditions)) {
            $whereClause = 'WHERE ' . implode(' AND ', $conditions);
        }

        $sql = "SELECT c.id, c.post_id, c.parent_id, c.author_name, c.author_email,
                       c.comment_text, c.is_approved, c.is_bot_reply, c.is_admin_reply, c.created_at,
                       p.title AS post_title, p.slug AS post_slug, p.status AS post_status,
                       parent.author_name AS parent_author_name
                FROM comments c
                JOIN posts p ON c.post_id = p.id
                LEFT JOIN comments parent ON c.parent_id = parent.id
                {$whereClause}
                ORDER BY c.created_at DESC, c.id DESC
                LIMIT :limit OFFSET :offset";

        $stmt = $pdo->prepare($sql);
        foreach ($intParams as $key => $val) {
            $stmt->bindValue($key, $val, PDO::PARAM_INT);
        }
        $stmt->bindValue(':limit', max(1, $limit), PDO::PARAM_INT);
        $stmt->bindValue(':offset', max(0, $offset), PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public static function findById(int $id): ?array {
        $pdo = Database::getConnection();
        $sql = "SELECT c.id, c.post_id, c.parent_id, c.author_name, c.author_email,
                       c.comment_text, c.is_approved, c.is_bot_reply, c.is_admin_reply, c.created_at,
                       p.title AS post_title, p.slug AS post_slug, p.status AS post_status
                FROM comments c
                JOIN posts p ON c.post_id = p.id
                WHERE c.id = :id
                LIMIT 1";

        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        $stmt->execute();
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public static function setApproval(int $id, int $isApproved): bool {
        if ($isApproved !== 0 && $isApproved !== 1) {
            throw new InvalidArgumentException('Status persetujuan komentar tidak valid.');
        }

        $pdo = Database::getConnection();
        $sql = "UPDATE comments SET is_approved = :is_approved WHERE id = :id";
        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(':is_approved', $isApproved, PDO::PARAM_INT);
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        return $stmt->execute();
    }

    public static function delete(int $id): bool {
        $pdo = Database::getConnection();
        $sql = "DELETE FROM comments WHERE id = :id";
        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        return $stmt->execute();
    }

    public static function getUnrepliedUserComments(int $limit = 10): array {
        $pdo = Database::getConnection();
        // Cari komentar user (bukan bot, bukan balasan) yang belum memiliki reply sama sekali
        $sql = "SELECT c.*, p.title as post_title, p.slug as post_slug
                FROM comments c
                JOIN posts p ON c.post_id = p.id
                WHERE c.is_bot_reply = 0 
                  AND c.parent_id IS NULL
                  AND c.is_approved = 1
                  AND NOT EXISTS (
                      SELECT 1 FROM comments reply 
                      WHERE reply.parent_id = c.id
                  )
                ORDER BY c.created_at ASC
                LIMIT :limit";
        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public static function countByApprovalStatus(): array {
        $pdo = Database::getConnection();
        $sql = "SELECT is_approved, COUNT(*) AS cnt FROM comments GROUP BY is_approved";
        $stmt = $pdo->prepare($sql);
        $stmt->execute();
        $rows = $stmt->fetchAll();

        $counts = [
            'total'    => 0,
            'all'      => 0,
            'approved' => 0,
            'pending'  => 0,
        ];

        foreach ($rows as $row) {
            $isApproved = (int)($row['is_approved'] ?? 0);
            $cnt = (int)($row['cnt'] ?? 0);
            if ($isApproved === 1) {
                $counts['approved'] += $cnt;
            } else {
                $counts['pending'] += $cnt;
            }
            $counts['total'] += $cnt;
            $counts['all'] += $cnt;
        }

        return $counts;
    }

    public static function getRecentPending(int $limit = 5): array {
        $pdo = Database::getConnection();
        $sql = "SELECT c.*, p.title as post_title, p.slug as post_slug
                FROM comments c
                JOIN posts p ON c.post_id = p.id
                WHERE c.is_approved = 0
                ORDER BY c.created_at DESC
                LIMIT :limit";

        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }
}
