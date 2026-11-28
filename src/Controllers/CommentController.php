<?php
require_once __DIR__ . '/../Models/Comment.php';
require_once __DIR__ . '/../Models/Post.php';
require_once __DIR__ . '/../Utils/Sanitizer.php';
require_once __DIR__ . '/../Utils/CSRF.php';
require_once __DIR__ . '/../Utils/Response.php';

/**
 * CommentController untuk menerima dan memproses komentar via POST / AJAX
 */
class CommentController {
    public function store(): void {
        if (!CSRF::validateRequest()) {
            Response::json([
                'success' => false,
                'error'   => 'Validasi keamanan CSRF tidak valid. Silakan refresh halaman.',
            ], 403);
            return;
        }

        $rawPostId = $_POST['post_id'] ?? null;
        $postId = null;
        if (is_int($rawPostId) || is_string($rawPostId)) {
            $validatedPostId = filter_var($rawPostId, FILTER_VALIDATE_INT);
            if ($validatedPostId !== false && (int)$validatedPostId > 0) {
                $postId = (int)$validatedPostId;
            }
        }

        $authorName = isset($_POST['author_name']) && is_string($_POST['author_name'])
            ? trim($_POST['author_name'])
            : '';
        $rawEmail = isset($_POST['author_email']) && is_string($_POST['author_email'])
            ? $_POST['author_email']
            : '';
        $authorEmail = Sanitizer::cleanEmail($rawEmail);
        $commentText = isset($_POST['comment_text']) && is_string($_POST['comment_text'])
            ? trim($_POST['comment_text'])
            : '';

        $parentId = null;
        if (isset($_POST['parent_id']) && $_POST['parent_id'] !== '') {
            $rawParentId = $_POST['parent_id'];
            if (!is_int($rawParentId) && !is_string($rawParentId)) {
                Response::json([
                    'success' => false,
                    'error'   => 'ID komentar induk tidak valid.',
                ], 400);
                return;
            }
            $validatedParentId = filter_var($rawParentId, FILTER_VALIDATE_INT);
            if ($validatedParentId === false || (int)$validatedParentId <= 0) {
                Response::json([
                    'success' => false,
                    'error'   => 'ID komentar induk tidak valid.',
                ], 400);
                return;
            }
            $parentId = (int)$validatedParentId;
        }

        if ($postId === null || $authorName === '' || $authorEmail === '' || $commentText === '') {
            Response::json([
                'success' => false,
                'error'   => 'Harap lengkapi semua kolom dengan data yang valid.',
            ], 400);
            return;
        }

        $nameLen = function_exists('mb_strlen') ? mb_strlen($authorName, 'UTF-8') : strlen($authorName);
        $emailLen = function_exists('mb_strlen') ? mb_strlen($authorEmail, 'UTF-8') : strlen($authorEmail);
        $textLen = function_exists('mb_strlen') ? mb_strlen($commentText, 'UTF-8') : strlen($commentText);

        if ($nameLen > 100 || $emailLen > 100 || $textLen > 5000) {
            Response::json([
                'success' => false,
                'error'   => 'Panjang nama, email, atau teks komentar melebihi batas yang diizinkan.',
            ], 400);
            return;
        }

        try {
            $post = Post::findById($postId);
            if ($post === null) {
                Response::json([
                    'success' => false,
                    'error'   => 'Artikel tidak ditemukan.',
                ], 404);
                return;
            }

            if (($post['status'] ?? '') !== 'published') {
                Response::json([
                    'success' => false,
                    'error'   => 'Komentar hanya dapat dikirim pada artikel yang sudah terbit.',
                ], 422);
                return;
            }

            if ($parentId !== null) {
                $parent = Comment::findById($parentId);
                if ($parent === null || (int)$parent['post_id'] !== $postId || (int)$parent['is_approved'] !== 1) {
                    Response::json([
                        'success' => false,
                        'error'   => 'Komentar induk yang dibalas tidak ditemukan atau belum disetujui.',
                    ], 422);
                    return;
                }
            }

            // Filter kata spam sederhana
            $spamKeywords = ['casino', 'slot gacor', 'judi online', 'viagra', 'crypto bounty'];
            $isSpam = false;
            foreach ($spamKeywords as $word) {
                if (stripos($commentText, $word) !== false) {
                    $isSpam = true;
                    break;
                }
            }

            $isApproved = $isSpam ? 0 : 1;
            $status = $isApproved === 1 ? 'approved' : 'pending';
            $message = $isApproved === 1
                ? 'Komentar berhasil dikirim!'
                : 'Komentar Anda telah diterima dan menunggu persetujuan moderasi.';

            $commentId = Comment::create([
                'post_id'        => $postId,
                'parent_id'      => $parentId,
                'author_name'    => $authorName,
                'author_email'   => $authorEmail,
                'comment_text'   => $commentText,
                'is_approved'    => $isApproved,
                'is_bot_reply'   => 0,
                'is_admin_reply' => 0,
            ]);

            Response::json([
                'success'     => true,
                'is_approved' => $isApproved,
                'status'      => $status,
                'message'     => $message,
                'comment'     => [
                    'id'             => $commentId,
                    'post_id'        => $postId,
                    'parent_id'      => $parentId,
                    'author_name'    => $authorName,
                    'comment_text'   => $commentText,
                    'is_approved'    => $isApproved,
                    'is_bot_reply'   => 0,
                    'is_admin_reply' => 0,
                    'created_at'     => date('d M Y, H:i'),
                ],
            ], 201);
        } catch (Throwable $e) {
            Response::json([
                'success' => false,
                'error'   => 'Gagal menyimpan komentar: ' . $e->getMessage(),
            ], 500);
        }
    }
}
