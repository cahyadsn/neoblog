<?php
require_once __DIR__ . '/../Utils/Auth.php';
require_once __DIR__ . '/../Utils/CSRF.php';
require_once __DIR__ . '/../Utils/Response.php';
require_once __DIR__ . '/../Utils/Sanitizer.php';
require_once __DIR__ . '/../Models/Comment.php';

/**
 * AdminCommentController untuk moderasi, balasan admin, dan penghapusan komentar di Dashboard CMS
 */
class AdminCommentController {
    private const ALLOWED_FILTERS = ['all', 'pending', 'approved'];
    private const FLASH_SUCCESS_KEY = 'neoblog_flash_success';
    private const FLASH_ERROR_KEY = 'neoblog_flash_error';

    public function index(): void {
        $currentUser = Auth::requireAdminOrEditor();
        if (!$currentUser) {
            return;
        }

        $rawStatus = $this->getString('status', 'all');
        $currentStatus = in_array($rawStatus, self::ALLOWED_FILTERS, true) ? $rawStatus : 'all';

        $rawPostId = trim($this->getString('post_id', ''));
        $postId = null;
        if ($rawPostId !== '' && ctype_digit($rawPostId) && (int)$rawPostId > 0) {
            $postId = (int)$rawPostId;
        }

        $flashes = $this->consumeFlashes();
        $flashSuccess = $flashes['success'];
        $flashError = $flashes['error'];

        $counts = [
            'total'    => 0,
            'all'      => 0,
            'approved' => 0,
            'pending'  => 0,
        ];
        $comments = [];

        try {
            $counts = Comment::countByApprovalStatus();
            $comments = Comment::getAllForModeration(
                $currentStatus === 'all' ? null : $currentStatus,
                $postId
            );
        } catch (Throwable $e) {
            $flashError = 'Gagal memuat daftar komentar: ' . $e->getMessage();
        }

        Response::render('admin/comments/index', [
            'pageTitle'     => 'Moderasi Komentar - Dashboard CMS NeoBlog',
            'activeNav'     => 'comments',
            'currentUser'   => $currentUser,
            'comments'      => $comments,
            'counts'        => $counts,
            'currentStatus' => $currentStatus,
            'postId'        => $postId,
            'flashSuccess'  => $flashSuccess,
            'flashError'    => $flashError,
        ], 'layouts/admin');
    }

    public function approve(int|string $id): void {
        $currentUser = Auth::requireAdminOrEditor();
        if (!$currentUser) {
            return;
        }

        $isJson = Response::isJsonRequest();
        if (!CSRF::validateRequest()) {
            $this->respondCsrfFailure($isJson);
            return;
        }

        $commentId = $this->parseCommentId($id);
        if ($commentId === null) {
            $this->respondNotFound($isJson);
            return;
        }

        $counts = null;
        try {
            $existing = Comment::findById($commentId);
            if ($existing === null) {
                $this->respondNotFound($isJson);
                return;
            }
            Comment::setApproval($commentId, 1);
            if ($isJson) {
                $counts = Comment::countByApprovalStatus();
            }
        } catch (Throwable $e) {
            $msg = 'Gagal menyetujui komentar: ' . $e->getMessage();
            if ($isJson) {
                Response::json(['success' => false, 'error' => $msg], 500);
                return;
            }
            $_SESSION[self::FLASH_ERROR_KEY] = $msg;
            Response::redirect('/admin/comments', 302);
            return;
        }

        $message = 'Komentar berhasil disetujui.';
        if ($isJson) {
            Response::json([
                'success'      => true,
                'id'           => $commentId,
                'is_approved'  => 1,
                'status'       => 'approved',
                'status_label' => 'Disetujui',
                'message'      => $message,
                'counts'       => $counts,
                'redirect'     => '/admin/comments',
            ], 200);
            return;
        }

        $_SESSION[self::FLASH_SUCCESS_KEY] = $message;
        Response::redirect('/admin/comments', 302);
    }

    public function hide(int|string $id): void {
        $currentUser = Auth::requireAdminOrEditor();
        if (!$currentUser) {
            return;
        }

        $isJson = Response::isJsonRequest();
        if (!CSRF::validateRequest()) {
            $this->respondCsrfFailure($isJson);
            return;
        }

        $commentId = $this->parseCommentId($id);
        if ($commentId === null) {
            $this->respondNotFound($isJson);
            return;
        }

        $counts = null;
        try {
            $existing = Comment::findById($commentId);
            if ($existing === null) {
                $this->respondNotFound($isJson);
                return;
            }
            Comment::setApproval($commentId, 0);
            if ($isJson) {
                $counts = Comment::countByApprovalStatus();
            }
        } catch (Throwable $e) {
            $msg = 'Gagal menyembunyikan komentar: ' . $e->getMessage();
            if ($isJson) {
                Response::json(['success' => false, 'error' => $msg], 500);
                return;
            }
            $_SESSION[self::FLASH_ERROR_KEY] = $msg;
            Response::redirect('/admin/comments', 302);
            return;
        }

        $message = 'Komentar disembunyikan ke antrean moderasi.';
        if ($isJson) {
            Response::json([
                'success'      => true,
                'id'           => $commentId,
                'is_approved'  => 0,
                'status'       => 'pending',
                'status_label' => 'Menunggu',
                'message'      => $message,
                'counts'       => $counts,
                'redirect'     => '/admin/comments',
            ], 200);
            return;
        }

        $_SESSION[self::FLASH_SUCCESS_KEY] = $message;
        Response::redirect('/admin/comments', 302);
    }

    public function reply(int|string $id): void {
        $currentUser = Auth::requireAdminOrEditor();
        if (!$currentUser) {
            return;
        }

        $isJson = Response::isJsonRequest();
        if (!CSRF::validateRequest()) {
            $this->respondCsrfFailure($isJson);
            return;
        }

        $commentId = $this->parseCommentId($id);
        if ($commentId === null) {
            $this->respondNotFound($isJson);
            return;
        }

        $existing = null;
        $replyText = '';
        $authorName = '';
        $authorEmail = '';
        $postId = 0;
        $replyId = 0;
        $counts = null;

        try {
            $existing = Comment::findById($commentId);
            if ($existing === null) {
                $this->respondNotFound($isJson);
                return;
            }

            $replyText = trim($this->postString('comment_text', ''));
            if ($replyText === '') {
                $this->respondBadRequest('Teks balasan wajib diisi.', $isJson);
                return;
            }

            $textLen = function_exists('mb_strlen') ? mb_strlen($replyText, 'UTF-8') : strlen($replyText);
            if ($textLen > 5000) {
                $this->respondBadRequest('Teks balasan maksimal 5000 karakter.', $isJson);
                return;
            }

            $authorName = trim((string)($currentUser['full_name'] ?? ''));
            if ($authorName === '') {
                $authorName = trim((string)($currentUser['username'] ?? 'Admin'));
            }
            if ($authorName === '') {
                $authorName = 'Admin';
            }

            $authorEmail = trim((string)($currentUser['email'] ?? 'admin@neoblog.local'));
            if ($authorEmail === '') {
                $authorEmail = 'admin@neoblog.local';
            }

            $postId = (int)$existing['post_id'];

            $replyId = Comment::create([
                'post_id'        => $postId,
                'parent_id'      => $commentId,
                'author_name'    => $authorName,
                'author_email'   => $authorEmail,
                'comment_text'   => $replyText,
                'is_approved'    => 1,
                'is_bot_reply'   => 0,
                'is_admin_reply' => 1,
            ]);
            if ($isJson) {
                $counts = Comment::countByApprovalStatus();
            }
        } catch (Throwable $e) {
            $msg = 'Gagal mengirim balasan admin: ' . $e->getMessage();
            if ($isJson) {
                Response::json(['success' => false, 'error' => $msg], 500);
                return;
            }
            $_SESSION[self::FLASH_ERROR_KEY] = $msg;
            Response::redirect('/admin/comments', 302);
            return;
        }

        $message = 'Balasan admin berhasil dikirim.';
        if ($isJson) {
            Response::json([
                'success'   => true,
                'id'        => $replyId,
                'parent_id' => $commentId,
                'post_id'   => $postId,
                'message'   => $message,
                'counts'    => $counts,
                'redirect'  => '/admin/comments',
                'comment'   => [
                    'id'                 => $replyId,
                    'post_id'            => $postId,
                    'parent_id'          => $commentId,
                    'parent_author_name' => (string)($existing['author_name'] ?? ''),
                    'author_name'        => $authorName,
                    'author_email'       => $authorEmail,
                    'comment_text'       => $replyText,
                    'is_approved'        => 1,
                    'is_bot_reply'       => 0,
                    'is_admin_reply'     => 1,
                    'post_title'         => (string)($existing['post_title'] ?? ''),
                    'post_slug'          => (string)($existing['post_slug'] ?? ''),
                    'post_status'        => (string)($existing['post_status'] ?? 'published'),
                    'created_at'         => date('d M Y, H:i'),
                ],
            ], 201);
            return;
        }

        $_SESSION[self::FLASH_SUCCESS_KEY] = $message;
        Response::redirect('/admin/comments', 302);
    }

    public function delete(int|string $id): void {
        $currentUser = Auth::requireAdminOrEditor();
        if (!$currentUser) {
            return;
        }

        $isJson = Response::isJsonRequest();
        if (!CSRF::validateRequest()) {
            $this->respondCsrfFailure($isJson);
            return;
        }

        $commentId = $this->parseCommentId($id);
        if ($commentId === null) {
            $this->respondNotFound($isJson);
            return;
        }

        $counts = null;
        try {
            $existing = Comment::findById($commentId);
            if ($existing === null) {
                $this->respondNotFound($isJson);
                return;
            }
            Comment::delete($commentId);
            if ($isJson) {
                $counts = Comment::countByApprovalStatus();
            }
        } catch (Throwable $e) {
            $msg = 'Gagal menghapus komentar: ' . $e->getMessage();
            if ($isJson) {
                Response::json(['success' => false, 'error' => $msg], 500);
                return;
            }
            $_SESSION[self::FLASH_ERROR_KEY] = $msg;
            Response::redirect('/admin/comments', 302);
            return;
        }

        $message = 'Komentar berhasil dihapus.';
        if ($isJson) {
            Response::json([
                'success'  => true,
                'id'       => $commentId,
                'message'  => $message,
                'counts'   => $counts,
                'redirect' => '/admin/comments',
            ], 200);
            return;
        }

        $_SESSION[self::FLASH_SUCCESS_KEY] = $message;
        Response::redirect('/admin/comments', 302);
    }

    private function parseCommentId(int|string $id): ?int {
        if (is_int($id)) {
            return $id > 0 ? $id : null;
        }
        $trimmed = trim($id);
        if ($trimmed === '' || !ctype_digit($trimmed)) {
            return null;
        }
        $intId = (int)$trimmed;
        return $intId > 0 ? $intId : null;
    }

    private function postString(string $key, string $default = ''): string {
        return isset($_POST[$key]) && is_string($_POST[$key]) ? $_POST[$key] : $default;
    }

    private function getString(string $key, string $default = ''): string {
        return isset($_GET[$key]) && is_string($_GET[$key]) ? $_GET[$key] : $default;
    }

    private function consumeFlashes(): array {
        $success = isset($_SESSION[self::FLASH_SUCCESS_KEY]) && is_string($_SESSION[self::FLASH_SUCCESS_KEY])
            ? $_SESSION[self::FLASH_SUCCESS_KEY]
            : null;
        $error = isset($_SESSION[self::FLASH_ERROR_KEY]) && is_string($_SESSION[self::FLASH_ERROR_KEY])
            ? $_SESSION[self::FLASH_ERROR_KEY]
            : null;
        unset($_SESSION[self::FLASH_SUCCESS_KEY], $_SESSION[self::FLASH_ERROR_KEY]);

        return [
            'success' => $success,
            'error'   => $error,
        ];
    }

    private function respondCsrfFailure(bool $isJson): void {
        $msg = 'Validasi keamanan CSRF tidak valid. Silakan muat ulang halaman.';
        if ($isJson) {
            Response::json(['success' => false, 'error' => $msg], 403);
            return;
        }
        Response::setStatus(403);
        echo '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>403 Akses Ditolak - NeoBlog</title><link rel="stylesheet" href="/assets/css/style.css"></head><body><main class="main-content"><div class="container"><div class="admin-card"><h1>403 Akses Ditolak</h1><p>' . Sanitizer::clean($msg) . '</p><p style="margin-top:1rem;"><a href="/admin/comments" class="btn btn-primary">Kembali ke Moderasi Komentar</a></p></div></div></main></body></html>';
    }

    private function respondNotFound(bool $isJson): void {
        $msg = 'Komentar tidak ditemukan.';
        if ($isJson) {
            Response::json(['success' => false, 'error' => $msg], 404);
            return;
        }
        Response::setStatus(404);
        echo '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>404 Komentar Tidak Ditemukan - NeoBlog</title><link rel="stylesheet" href="/assets/css/style.css"></head><body><main class="main-content"><div class="container"><div class="admin-card"><h1>404 Komentar Tidak Ditemukan</h1><p>' . Sanitizer::clean($msg) . '</p><p style="margin-top:1rem;"><a href="/admin/comments" class="btn btn-primary">Kembali ke Moderasi Komentar</a></p></div></div></main></body></html>';
    }

    private function respondBadRequest(string $msg, bool $isJson): void {
        if ($isJson) {
            Response::json(['success' => false, 'error' => $msg], 400);
            return;
        }
        Response::setStatus(400);
        echo '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>400 Permintaan Tidak Valid - NeoBlog</title><link rel="stylesheet" href="/assets/css/style.css"></head><body><main class="main-content"><div class="container"><div class="admin-card"><h1>400 Permintaan Tidak Valid</h1><p>' . Sanitizer::clean($msg) . '</p><p style="margin-top:1rem;"><a href="/admin/comments" class="btn btn-primary">Kembali ke Moderasi Komentar</a></p></div></div></main></body></html>';
    }
}
