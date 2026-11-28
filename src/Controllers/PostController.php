<?php
require_once __DIR__ . '/../Models/Post.php';
require_once __DIR__ . '/../Models/Comment.php';
require_once __DIR__ . '/../Utils/Sanitizer.php';
require_once __DIR__ . '/../Utils/CSRF.php';
require_once __DIR__ . '/../Utils/Response.php';

/**
 * PostController untuk menampilkan daftar artikel dan halaman baca
 */
class PostController {
    public function index(): void {
        $dbError = null;
        try {
            $posts = Post::getAllPublished();
        } catch (Throwable $e) {
            $posts = [];
            $dbError = $e->getMessage();
        }

        Response::render('posts/index', [
            'posts'     => $posts,
            'dbError'   => $dbError,
            'pageTitle' => 'Beranda - NeoBlog',
        ], 'layouts/main');
    }

    public function detail(string $slug): void {
        $slug = Sanitizer::clean($slug);
        
        try {
            $post = Post::findBySlug($slug);
            if (!$post) {
                Response::setStatus(404);
                echo "<h1>Artikel Tidak Ditemukan</h1><p>Maaf, artikel dengan tautan tersebut tidak tersedia.</p><a href='/'>Kembali</a>";
                return;
            }
            $comments = Comment::getByPostId((int)$post['id']);
        } catch (Throwable $e) {
            Response::setStatus(500);
            echo "<h1>Terjadi Gangguan Server</h1><p>" . htmlspecialchars($e->getMessage()) . "</p>";
            return;
        }

        Response::render('posts/detail', [
            'post'      => $post,
            'comments'  => $comments,
            'pageTitle' => $post['title'] . ' - NeoBlog',
        ], 'layouts/main');
    }

    /**
     * API Pencarian Artikel Asinkron
     * GET /api/search?q={query}&limit=10
     */
    public function apiSearch(): void {
        $rawQuery = $_GET['q'] ?? '';
        $query = Sanitizer::clean(is_string($rawQuery) ? $rawQuery : '');
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 8;

        if ($query === '') {
            Response::json([
                'success' => true,
                'query'   => '',
                'total'   => 0,
                'data'    => [],
            ]);
            return;
        }

        try {
            $results = Post::search($query, $limit);
            Response::json([
                'success' => true,
                'query'   => $query,
                'total'   => count($results),
                'data'    => $results,
            ]);
        } catch (Throwable $e) {
            Response::json([
                'success' => false,
                'error'   => 'Gagal memproses pencarian: ' . $e->getMessage(),
                'data'    => [],
            ], 500);
        }
    }
}
