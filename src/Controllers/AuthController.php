<?php
require_once __DIR__ . '/../Utils/Auth.php';
require_once __DIR__ . '/../Utils/CSRF.php';
require_once __DIR__ . '/../Utils/Response.php';
require_once __DIR__ . '/../Utils/Sanitizer.php';

/**
 * AuthController untuk login/logout sesi admin & editor
 */
class AuthController {
    public function showLogin(): void {
        if (Auth::check() && Auth::hasRole(['admin', 'editor'])) {
            Response::redirect('/admin', 302);
            return;
        }

        Response::render('auth/login', [
            'pageTitle'     => 'Masuk CMS - NeoBlog',
            'error'         => null,
            'notice'        => null,
            'oldIdentifier' => '',
        ], 'layouts/main');
    }

    public function login(): void {
        $isJson = Response::isJsonRequest();

        if (!CSRF::validateRequest()) {
            $msg = 'Validasi keamanan CSRF tidak valid. Silakan muat ulang halaman.';
            if ($isJson) {
                Response::json(['success' => false, 'error' => $msg], 403);
                return;
            }
            Response::render('auth/login', [
                'pageTitle'     => 'Masuk CMS - NeoBlog',
                'error'         => $msg,
                'notice'        => null,
                'oldIdentifier' => is_string($_POST['identifier'] ?? null) ? trim($_POST['identifier']) : '',
            ], 'layouts/main', 403);
            return;
        }

        $identifier = is_string($_POST['identifier'] ?? null) ? trim($_POST['identifier']) : '';
        $password = is_string($_POST['password'] ?? null) ? $_POST['password'] : '';

        if ($identifier === '' || $password === '') {
            $msg = 'Username atau email dan kata sandi wajib diisi.';
            if ($isJson) {
                Response::json(['success' => false, 'error' => $msg], 400);
                return;
            }
            Response::render('auth/login', [
                'pageTitle'     => 'Masuk CMS - NeoBlog',
                'error'         => $msg,
                'notice'        => null,
                'oldIdentifier' => $identifier,
            ], 'layouts/main', 400);
            return;
        }

        try {
            $user = Auth::attempt($identifier, $password, false);
        } catch (Throwable $e) {
            $msg = 'Terjadi gangguan server saat memverifikasi akun.';
            if ($isJson) {
                Response::json(['success' => false, 'error' => $msg], 500);
                return;
            }
            Response::render('auth/login', [
                'pageTitle'     => 'Masuk CMS - NeoBlog',
                'error'         => $msg,
                'notice'        => null,
                'oldIdentifier' => $identifier,
            ], 'layouts/main', 500);
            return;
        }

        if (!$user) {
            $msg = 'Username, email, atau kata sandi tidak valid.';
            if ($isJson) {
                Response::json(['success' => false, 'error' => $msg], 401);
                return;
            }
            Response::render('auth/login', [
                'pageTitle'     => 'Masuk CMS - NeoBlog',
                'error'         => $msg,
                'notice'        => null,
                'oldIdentifier' => $identifier,
            ], 'layouts/main', 401);
            return;
        }

        if (!Auth::hasRole(['admin', 'editor'], $user)) {
            $msg = 'Akses ditolak. Hanya admin atau editor yang diizinkan mengakses Dashboard CMS.';
            if ($isJson) {
                Response::json(['success' => false, 'error' => $msg], 403);
                return;
            }
            Response::render('auth/login', [
                'pageTitle'     => 'Masuk CMS - NeoBlog',
                'error'         => $msg,
                'notice'        => null,
                'oldIdentifier' => $identifier,
            ], 'layouts/main', 403);
            return;
        }

        Auth::loginUser($user);

        if ($isJson) {
            Response::json([
                'success'  => true,
                'redirect' => '/admin',
                'user'     => $user,
            ], 200);
            return;
        }

        Response::redirect('/admin', 302);
    }

    public function logout(): void {
        $isJson = Response::isJsonRequest();

        if (!CSRF::validateRequest()) {
            $msg = 'Validasi keamanan CSRF tidak valid.';
            if ($isJson) {
                Response::json(['success' => false, 'error' => $msg], 403);
                return;
            }
            Response::setStatus(403);
            echo '<h1>403 Akses Ditolak</h1><p>' . Sanitizer::clean($msg) . '</p>';
            return;
        }

        Auth::logout();

        if ($isJson) {
            Response::json([
                'success'  => true,
                'redirect' => '/admin/login',
            ], 200);
            return;
        }

        Response::redirect('/admin/login', 302);
    }
}
