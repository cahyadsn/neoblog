<?php
require_once __DIR__ . '/../Utils/Auth.php';
require_once __DIR__ . '/../Utils/CSRF.php';
require_once __DIR__ . '/../Utils/Response.php';
require_once __DIR__ . '/../Utils/Sanitizer.php';
require_once __DIR__ . '/../Models/Post.php';
require_once __DIR__ . '/../Models/Category.php';

/**
 * AdminPostController untuk pengelolaan artikel & draf di Dashboard CMS
 */
class AdminPostController {
    private const ALLOWED_STATUSES = ['draft', 'published', 'archived'];
    private const FLASH_SUCCESS_KEY = 'neoblog_flash_success';
    private const FLASH_ERROR_KEY = 'neoblog_flash_error';

    public function index(): void {
        $currentUser = Auth::requireAdminOrEditor();
        if (!$currentUser) {
            return;
        }

        $rawStatus = $this->getString('status', 'all');
        $currentStatus = in_array($rawStatus, self::ALLOWED_STATUSES, true) ? $rawStatus : 'all';
        $searchQuery = trim($this->getString('q', ''));

        $flashes = $this->consumeFlashes();
        $flashSuccess = $flashes['success'];
        $flashError = $flashes['error'];

        $counts = [
            'total'     => 0,
            'all'       => 0,
            'published' => 0,
            'draft'     => 0,
            'archived'  => 0,
        ];
        $posts = [];

        try {
            $counts = Post::countByStatus();
            $posts = Post::getAllForAdmin(
                $currentStatus === 'all' ? null : $currentStatus,
                $searchQuery !== '' ? $searchQuery : null
            );
        } catch (Throwable $e) {
            $flashError = 'Gagal memuat daftar artikel: ' . $e->getMessage();
        }

        Response::render('admin/posts/index', [
            'pageTitle'     => 'Kelola Artikel - Dashboard CMS NeoBlog',
            'activeNav'     => 'posts',
            'currentUser'   => $currentUser,
            'posts'         => $posts,
            'counts'        => $counts,
            'currentStatus' => $currentStatus,
            'searchQuery'   => $searchQuery,
            'flashSuccess'  => $flashSuccess,
            'flashError'    => $flashError,
        ], 'layouts/admin');
    }

    public function createForm(): void {
        $currentUser = Auth::requireAdminOrEditor();
        if (!$currentUser) {
            return;
        }

        $flashes = $this->consumeFlashes();
        $categories = $this->loadCategoriesSafe();

        Response::render('admin/posts/form', [
            'pageTitle'    => 'Buat Artikel Baru - Dashboard CMS NeoBlog',
            'activeNav'    => 'posts',
            'currentUser'  => $currentUser,
            'mode'         => 'create',
            'post'         => [
                'status'       => 'draft',
                'reading_time' => 3,
            ],
            'categories'   => $categories,
            'errors'       => [],
            'old'          => [],
            'flashSuccess' => $flashes['success'],
            'flashError'   => $flashes['error'],
        ], 'layouts/admin');
    }

    public function store(): void {
        $currentUser = Auth::requireAdminOrEditor();
        if (!$currentUser) {
            return;
        }

        $isJson = Response::isJsonRequest();
        if (!CSRF::validateRequest()) {
            $this->respondCsrfFailure($isJson);
            return;
        }

        $validation = $this->validateAndBuildPayload('draft', null);
        if (!empty($validation['errors'])) {
            $this->respondValidationError('create', [], $validation['errors'], $validation['old'], $currentUser, $isJson);
            return;
        }

        $data = $validation['data'];
        $data['author_id'] = (int)$currentUser['id'];
        $data['published_at'] = $data['status'] === 'published' ? date('Y-m-d H:i:s') : null;

        try {
            $newId = Post::create($data);
        } catch (Throwable $e) {
            $errors = ['Gagal menyimpan artikel ke database: ' . $e->getMessage()];
            $this->respondValidationError('create', [], $errors, $validation['old'], $currentUser, $isJson, 500);
            return;
        }

        $message = 'Artikel baru berhasil disimpan.';
        if ($isJson) {
            Response::json([
                'success'  => true,
                'id'       => $newId,
                'slug'     => $data['slug'],
                'status'   => $data['status'],
                'message'  => $message,
                'redirect' => '/admin/posts',
            ], 201);
            return;
        }

        $_SESSION[self::FLASH_SUCCESS_KEY] = $message;
        Response::redirect('/admin/posts', 302);
    }

    public function editForm(int|string $id): void {
        $currentUser = Auth::requireAdminOrEditor();
        if (!$currentUser) {
            return;
        }

        $postId = $this->parsePostId($id);
        if ($postId === null) {
            $this->respondNotFound(Response::isJsonRequest());
            return;
        }

        $post = Post::findById($postId);
        if ($post === null) {
            $this->respondNotFound(Response::isJsonRequest());
            return;
        }

        $flashes = $this->consumeFlashes();
        $categories = $this->loadCategoriesSafe();

        Response::render('admin/posts/form', [
            'pageTitle'    => 'Sunting Artikel - Dashboard CMS NeoBlog',
            'activeNav'    => 'posts',
            'currentUser'  => $currentUser,
            'mode'         => 'edit',
            'post'         => $post,
            'categories'   => $categories,
            'errors'       => [],
            'old'          => [],
            'flashSuccess' => $flashes['success'],
            'flashError'   => $flashes['error'],
        ], 'layouts/admin');
    }

    public function update(int|string $id): void {
        $currentUser = Auth::requireAdminOrEditor();
        if (!$currentUser) {
            return;
        }

        $isJson = Response::isJsonRequest();
        if (!CSRF::validateRequest()) {
            $this->respondCsrfFailure($isJson);
            return;
        }

        $postId = $this->parsePostId($id);
        if ($postId === null) {
            $this->respondNotFound($isJson);
            return;
        }

        $existing = Post::findById($postId);
        if ($existing === null) {
            $this->respondNotFound($isJson);
            return;
        }

        $defaultStatus = (string)($existing['status'] ?? 'draft');
        $validation = $this->validateAndBuildPayload($defaultStatus, $postId);
        if (!empty($validation['errors'])) {
            $this->respondValidationError('edit', $existing, $validation['errors'], $validation['old'], $currentUser, $isJson);
            return;
        }

        $data = $validation['data'];

        try {
            Post::update($postId, $data);
        } catch (Throwable $e) {
            $errors = ['Gagal memperbarui artikel: ' . $e->getMessage()];
            $this->respondValidationError('edit', $existing, $errors, $validation['old'], $currentUser, $isJson, 500);
            return;
        }

        $message = 'Perubahan artikel berhasil disimpan.';
        if ($isJson) {
            Response::json([
                'success'  => true,
                'id'       => $postId,
                'slug'     => $data['slug'],
                'status'   => $data['status'],
                'message'  => $message,
                'redirect' => '/admin/posts',
            ], 200);
            return;
        }

        $_SESSION[self::FLASH_SUCCESS_KEY] = $message;
        Response::redirect('/admin/posts', 302);
    }

    public function updateStatus(int|string $id): void {
        $currentUser = Auth::requireAdminOrEditor();
        if (!$currentUser) {
            return;
        }

        $isJson = Response::isJsonRequest();
        if (!CSRF::validateRequest()) {
            $this->respondCsrfFailure($isJson);
            return;
        }

        $postId = $this->parsePostId($id);
        if ($postId === null) {
            $this->respondNotFound($isJson);
            return;
        }

        $existing = Post::findById($postId);
        if ($existing === null) {
            $this->respondNotFound($isJson);
            return;
        }

        $status = trim($this->postString('status', ''));
        if (!in_array($status, self::ALLOWED_STATUSES, true)) {
            $msg = 'Status artikel tidak valid. Pilih draft, published, atau archived.';
            if ($isJson) {
                Response::json(['success' => false, 'error' => $msg], 400);
                return;
            }
            Response::setStatus(400);
            echo '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>400 Permintaan Tidak Valid - NeoBlog</title><link rel="stylesheet" href="/assets/css/style.css"></head><body><main class="main-content"><div class="container"><div class="admin-card"><h1>400 Permintaan Tidak Valid</h1><p>' . Sanitizer::clean($msg) . '</p><p style="margin-top:1rem;"><a href="/admin/posts" class="btn btn-primary">Kembali ke Daftar Artikel</a></p></div></div></main></body></html>';
            return;
        }

        try {
            Post::updateStatus($postId, $status);
        } catch (Throwable $e) {
            $msg = 'Gagal mengubah status artikel: ' . $e->getMessage();
            if ($isJson) {
                Response::json(['success' => false, 'error' => $msg], 500);
                return;
            }
            $_SESSION[self::FLASH_ERROR_KEY] = $msg;
            Response::redirect('/admin/posts', 302);
            return;
        }

        $labels = [
            'published' => 'Terbit',
            'draft'     => 'Draf',
            'archived'  => 'Diarsipkan',
        ];
        $message = 'Status artikel berhasil diubah menjadi ' . ($labels[$status] ?? $status) . '.';

        if ($isJson) {
            Response::json([
                'success'      => true,
                'id'           => $postId,
                'status'       => $status,
                'status_label' => $labels[$status] ?? $status,
                'message'      => $message,
                'redirect'     => '/admin/posts',
            ], 200);
            return;
        }

        $_SESSION[self::FLASH_SUCCESS_KEY] = $message;
        Response::redirect('/admin/posts', 302);
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

        $postId = $this->parsePostId($id);
        if ($postId === null) {
            $this->respondNotFound($isJson);
            return;
        }

        $existing = Post::findById($postId);
        if ($existing === null) {
            $this->respondNotFound($isJson);
            return;
        }

        try {
            Post::delete($postId);
        } catch (Throwable $e) {
            $msg = 'Gagal menghapus artikel: ' . $e->getMessage();
            if ($isJson) {
                Response::json(['success' => false, 'error' => $msg], 500);
                return;
            }
            $_SESSION[self::FLASH_ERROR_KEY] = $msg;
            Response::redirect('/admin/posts', 302);
            return;
        }

        $message = 'Artikel berhasil dihapus.';
        if ($isJson) {
            Response::json([
                'success'  => true,
                'id'       => $postId,
                'message'  => $message,
                'redirect' => '/admin/posts',
            ], 200);
            return;
        }

        $_SESSION[self::FLASH_SUCCESS_KEY] = $message;
        Response::redirect('/admin/posts', 302);
    }

    private function validateAndBuildPayload(string $defaultStatus, ?int $excludeId): array {
        $title = trim($this->postString('title', ''));
        $rawSlug = trim($this->postString('slug', ''));
        $rawCategoryId = trim($this->postString('category_id', ''));
        $status = array_key_exists('status', $_POST)
            ? trim($this->postString('status', ''))
            : $defaultStatus;
        $rawReadingTime = trim($this->postString('reading_time', ''));
        $excerpt = trim($this->postString('excerpt', ''));
        $rawContent = $this->postString('content', '');
        $cleanContent = Sanitizer::cleanHtml($rawContent);

        $errors = [];

        $titleLen = function_exists('mb_strlen') ? mb_strlen($title, 'UTF-8') : strlen($title);
        if ($title === '') {
            $errors[] = 'Judul artikel wajib diisi.';
        } elseif ($titleLen > 255) {
            $errors[] = 'Judul artikel maksimal 255 karakter.';
        }

        if ($cleanContent === '') {
            $errors[] = 'Konten artikel wajib diisi dan harus memuat konten yang aman/valid.';
        }

        if (!in_array($status, self::ALLOWED_STATUSES, true)) {
            $errors[] = 'Status artikel harus berupa draft, published, atau archived.';
        }

        $categoryId = null;
        if ($rawCategoryId !== '') {
            $validatedCategoryId = filter_var($rawCategoryId, FILTER_VALIDATE_INT);
            if ($validatedCategoryId === false || (int)$validatedCategoryId <= 0) {
                $errors[] = 'Kategori yang dipilih tidak valid.';
            } else {
                $cat = Category::findById((int)$validatedCategoryId);
                if ($cat === null) {
                    $errors[] = 'Kategori yang dipilih tidak ditemukan.';
                } else {
                    $categoryId = (int)$validatedCategoryId;
                }
            }
        }

        $readingTime = 3;
        if ($rawReadingTime === '') {
            $wordCount = str_word_count(strip_tags($cleanContent));
            $readingTime = max(1, min(999, (int)ceil($wordCount / 200)));
        } else {
            $validatedRt = filter_var($rawReadingTime, FILTER_VALIDATE_INT);
            if ($validatedRt === false || (int)$validatedRt < 1 || (int)$validatedRt > 999) {
                $errors[] = 'Waktu baca harus berupa angka antara 1 hingga 999 menit.';
            } else {
                $readingTime = (int)$validatedRt;
            }
        }

        $old = [
            'title'        => $title,
            'slug'         => $rawSlug,
            'category_id'  => $rawCategoryId,
            'status'       => $status,
            'reading_time' => $rawReadingTime !== '' ? $rawReadingTime : (string)$readingTime,
            'excerpt'      => $excerpt,
            'content'      => $rawContent,
        ];

        $slug = '';
        if (empty($errors)) {
            $slug = $this->generateUniqueSlug($rawSlug, $title, $excludeId);
        }

        return [
            'errors' => $errors,
            'old'    => $old,
            'data'   => [
                'category_id'  => $categoryId,
                'title'        => $title,
                'slug'         => $slug,
                'excerpt'      => $excerpt,
                'content'      => $cleanContent,
                'reading_time' => $readingTime,
                'status'       => $status,
            ],
        ];
    }

    private function generateUniqueSlug(string $rawSlug, string $title, ?int $excludeId): string {
        $source = $rawSlug !== '' ? $rawSlug : $title;
        $base = Sanitizer::slugify($source);
        $base = rtrim(substr($base, 0, 240), '-');
        if ($base === '') {
            $base = 'n-a';
        }

        $candidate = $base;
        $counter = 2;
        while (Post::slugExists($candidate, $excludeId)) {
            $candidate = $base . '-' . $counter;
            $counter++;
        }

        return $candidate;
    }

    private function parsePostId(int|string $id): ?int {
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

    private function loadCategoriesSafe(): array {
        try {
            return Category::getAll();
        } catch (Throwable $e) {
            return [];
        }
    }

    private function respondCsrfFailure(bool $isJson): void {
        $msg = 'Validasi keamanan CSRF tidak valid. Silakan muat ulang halaman.';
        if ($isJson) {
            Response::json(['success' => false, 'error' => $msg], 403);
            return;
        }
        Response::setStatus(403);
        echo '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>403 Akses Ditolak - NeoBlog</title><link rel="stylesheet" href="/assets/css/style.css"></head><body><main class="main-content"><div class="container"><div class="admin-card"><h1>403 Akses Ditolak</h1><p>' . Sanitizer::clean($msg) . '</p><p style="margin-top:1rem;"><a href="/admin/posts" class="btn btn-primary">Kembali ke Daftar Artikel</a></p></div></div></main></body></html>';
    }

    private function respondNotFound(bool $isJson): void {
        $msg = 'Artikel tidak ditemukan.';
        if ($isJson) {
            Response::json(['success' => false, 'error' => $msg], 404);
            return;
        }
        Response::setStatus(404);
        echo '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>404 Artikel Tidak Ditemukan - NeoBlog</title><link rel="stylesheet" href="/assets/css/style.css"></head><body><main class="main-content"><div class="container"><div class="admin-card"><h1>404 Artikel Tidak Ditemukan</h1><p>' . Sanitizer::clean($msg) . '</p><p style="margin-top:1rem;"><a href="/admin/posts" class="btn btn-primary">Kembali ke Daftar Artikel</a></p></div></div></main></body></html>';
    }

    private function respondValidationError(
        string $mode,
        array $post,
        array $errors,
        array $old,
        array $currentUser,
        bool $isJson,
        int $statusCode = 400
    ): void {
        if ($isJson) {
            Response::json([
                'success' => false,
                'error'   => $errors[0] ?? 'Data artikel tidak valid.',
                'errors'  => $errors,
            ], $statusCode);
            return;
        }

        Response::render('admin/posts/form', [
            'pageTitle'    => ($mode === 'edit' ? 'Sunting Artikel' : 'Buat Artikel Baru') . ' - Dashboard CMS NeoBlog',
            'activeNav'    => 'posts',
            'currentUser'  => $currentUser,
            'mode'         => $mode,
            'post'         => $post,
            'categories'   => $this->loadCategoriesSafe(),
            'errors'       => $errors,
            'old'          => $old,
            'flashSuccess' => null,
            'flashError'   => null,
        ], 'layouts/admin', $statusCode);
    }
}
