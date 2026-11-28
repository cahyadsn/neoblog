<?php
require_once __DIR__ . '/Utils/Response.php';

/**
 * Vanilla PHP Request Router
 * Mendukung GET, POST dan placeholder URL dinamis seperti /post/{slug}
 */

class Router {
    private array $routes = [];

    public function get(string $path, callable|array $handler): void {
        $this->addRoute('GET', $path, $handler);
    }

    public function post(string $path, callable|array $handler): void {
        $this->addRoute('POST', $path, $handler);
    }

    private function addRoute(string $method, string $path, callable|array $handler): void {
        $normalizedPath = rtrim($path, '/') ?: '/';
        // Konversi path pola seperti /post/{slug} menjadi regex
        $pattern = preg_replace('/\{([a-zA-Z0-9_]+)\}/', '(?P<$1>[^/]+)', $normalizedPath);
        $pattern = "#^" . $pattern . "$#";

        $this->routes[] = [
            'method'  => strtoupper($method),
            'pattern' => $pattern,
            'handler' => $handler
        ];
    }

    public function dispatch(string $uri, string $requestMethod): void {
        $path = parse_url($uri, PHP_URL_PATH) ?: '/';
        $path = rtrim($path, '/') ?: '/';
        $requestMethod = strtoupper($requestMethod);

        foreach ($this->routes as $route) {
            if ($route['method'] !== $requestMethod) {
                continue;
            }

            if (preg_match($route['pattern'], $path, $matches)) {
                // Filter hanya named parameters
                $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);

                $handler = $route['handler'];
                if (is_array($handler)) {
                    [$class, $action] = $handler;
                    $controller = new $class();
                    call_user_func_array([$controller, $action], $params);
                    return;
                }

                if (is_callable($handler)) {
                    call_user_func_array($handler, $params);
                    return;
                }
            }
        }

        // 404 Not Found
        $isJson = $path === '/api'
            || str_starts_with($path, '/api/')
            || $path === '/admin/api'
            || str_starts_with($path, '/admin/api/')
            || Response::isJsonRequest();

        if ($isJson) {
            Response::json(['success' => false, 'error' => 'Endpoint tidak ditemukan.'], 404);
            return;
        }

        Response::setStatus(404);
        echo "<h1>404 Halaman Tidak Ditemukan</h1><p>Halaman yang Anda tuju tidak tersedia.</p><a href='/'>Kembali ke Beranda</a>";
    }
}
