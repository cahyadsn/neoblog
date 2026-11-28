<?php
require_once __DIR__ . '/../Utils/Auth.php';
require_once __DIR__ . '/../Utils/Response.php';
require_once __DIR__ . '/../Utils/CSRF.php';
require_once __DIR__ . '/../Utils/Sanitizer.php';
require_once __DIR__ . '/../Models/Post.php';
require_once __DIR__ . '/../Models/Comment.php';

/**
 * AdminController untuk halaman Dashboard CMS utama
 */
class AdminController {
    public function dashboard(): void {
        $currentUser = Auth::requireAdminOrEditor();
        if (!$currentUser) {
            return;
        }

        $postStats = [
            'total'     => 0,
            'all'       => 0,
            'published' => 0,
            'draft'     => 0,
            'archived'  => 0,
        ];
        $commentStats = [
            'total'    => 0,
            'all'      => 0,
            'approved' => 0,
            'pending'  => 0,
        ];
        $recentDrafts = [];
        $pendingComments = [];
        $flashError = null;

        try {
            $postStats = Post::countByStatus();
            $commentStats = Comment::countByApprovalStatus();
            $recentDrafts = Post::getRecentForAdmin(5, 'draft');
            $pendingComments = Comment::getRecentPending(5);
        } catch (Throwable $e) {
            $flashError = 'Gagal memuat ringkasan data dashboard: ' . $e->getMessage();
        }

        Response::render('admin/dashboard', [
            'pageTitle'       => 'Dashboard CMS - NeoBlog',
            'activeNav'       => 'dashboard',
            'currentUser'     => $currentUser,
            'postStats'       => $postStats,
            'commentStats'    => $commentStats,
            'recentDrafts'    => $recentDrafts,
            'pendingComments' => $pendingComments,
            'flashError'      => $flashError,
        ], 'layouts/admin');
    }
}
