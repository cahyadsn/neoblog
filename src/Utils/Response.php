<?php
/**
 * HTTP Response Helper dengan dukungan HTML, JSON, Redirect, dan testability CLI
 */

class Response {
    private static ?int $lastStatus = null;
    private static ?string $lastRedirect = null;

    public static function resetState(): void {
        self::$lastStatus = null;
        self::$lastRedirect = null;
    }

    public static function getLastStatus(): ?int {
        return self::$lastStatus;
    }

    public static function getLastRedirect(): ?string {
        return self::$lastRedirect;
    }

    public static function isJsonRequest(): bool {
        $xRequestedWith = strtolower((string)($_SERVER['HTTP_X_REQUESTED_WITH'] ?? ''));
        $accept = strtolower((string)($_SERVER['HTTP_ACCEPT'] ?? ''));
        return $xRequestedWith === 'xmlhttprequest' || str_contains($accept, 'application/json');
    }

    public static function setStatus(int $status): void {
        self::$lastStatus = $status;
        if (!headers_sent()) {
            http_response_code($status);
        }
    }

    public static function json(array $data, int $status = 200): void {
        self::setStatus($status);
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
    }

    public static function redirect(string $url, int $status = 302): void {
        self::setStatus($status);
        self::$lastRedirect = $url;
        if (!headers_sent()) {
            header('Location: ' . $url);
        }
    }

    public static function render(string $view, array $data = [], string $layout = 'layouts/main', int $statusCode = 200): void {
        self::setStatus($statusCode);
        $viewBasePath = defined('VIEW_PATH') ? VIEW_PATH : dirname(__DIR__, 2) . '/views';
        extract($data, EXTR_SKIP);
        $contentView = $viewBasePath . '/' . ltrim($view, '/') . '.php';
        if ($layout !== '') {
            require $viewBasePath . '/' . ltrim($layout, '/') . '.php';
        } else {
            require $contentView;
        }
    }
}
