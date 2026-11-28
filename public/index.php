<?php
/**
 * NeoBlog Front Controller & Dispatcher
 */

require_once __DIR__ . '/../config/app.php';
require_once __DIR__ . '/../src/Router.php';
require_once __DIR__ . '/../src/Controllers/PostController.php';
require_once __DIR__ . '/../src/Controllers/CommentController.php';
require_once __DIR__ . '/../src/Controllers/AuthController.php';
require_once __DIR__ . '/../src/Controllers/AdminController.php';
require_once __DIR__ . '/../src/Controllers/AdminPostController.php';
require_once __DIR__ . '/../src/Controllers/AdminCommentController.php';

// Inisialisasi router
$router = new Router();

// Rute Halaman Publik
$router->get('/', [PostController::class, 'index']);
$router->get('/post/{slug}', [PostController::class, 'detail']);
$router->get('/api/search', [PostController::class, 'apiSearch']);

// Rute API Komentar Publik
$router->post('/api/comments', [CommentController::class, 'store']);

// Rute Autentikasi CMS Admin
$router->get('/admin/login', [AuthController::class, 'showLogin']);
$router->post('/admin/login', [AuthController::class, 'login']);
$router->get('/login', [AuthController::class, 'showLogin']);
$router->post('/login', [AuthController::class, 'login']);
$router->post('/admin/logout', [AuthController::class, 'logout']);
$router->post('/logout', [AuthController::class, 'logout']);

// Rute Dashboard CMS Admin
$router->get('/admin', [AdminController::class, 'dashboard']);

// Rute Pengelolaan Artikel & Draf Admin
$router->get('/admin/posts', [AdminPostController::class, 'index']);
$router->get('/admin/posts/create', [AdminPostController::class, 'createForm']);
$router->post('/admin/posts', [AdminPostController::class, 'store']);
$router->post('/admin/posts/store', [AdminPostController::class, 'store']);
$router->get('/admin/posts/{id}/edit', [AdminPostController::class, 'editForm']);
$router->post('/admin/posts/{id}/update', [AdminPostController::class, 'update']);
$router->post('/admin/posts/{id}/status', [AdminPostController::class, 'updateStatus']);
$router->post('/admin/posts/{id}/delete', [AdminPostController::class, 'delete']);

// Rute Moderasi Komentar Admin
$router->get('/admin/comments', [AdminCommentController::class, 'index']);
$router->post('/admin/comments/{id}/approve', [AdminCommentController::class, 'approve']);
$router->post('/admin/comments/{id}/hide', [AdminCommentController::class, 'hide']);
$router->post('/admin/comments/{id}/reply', [AdminCommentController::class, 'reply']);
$router->post('/admin/comments/{id}/delete', [AdminCommentController::class, 'delete']);

// Dispatch request saat ini
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$requestMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$router->dispatch($requestUri, $requestMethod);
