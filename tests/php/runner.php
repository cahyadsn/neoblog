<?php
/**
 * Native PHP Micro Test Runner (Tanpa PHPUnit)
 */

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

class TestRunner {
    private int $passed = 0;
    private int $failed = 0;
    private array $errors = [];

    public function test(string $name, callable $fn): void {
        try {
            $fn();
            echo " [\033[32mPASS\033[0m] {$name}\n";
            $this->passed++;
        } catch (Throwable $e) {
            echo " [\033[31mFAIL\033[0m] {$name}\n";
            echo "        Alasan: " . $e->getMessage() . " (di " . basename($e->getFile()) . ":" . $e->getLine() . ")\n";
            $this->failed++;
            $this->errors[] = ['name' => $name, 'error' => $e->getMessage()];
        }
    }

    public function assertEqual($expected, $actual, string $message = ''): void {
        if ($expected !== $actual) {
            $msg = $message ?: "Expected " . var_export($expected, true) . ", but got " . var_export($actual, true);
            throw new Exception($msg);
        }
    }

    public function assertTrue($condition, string $message = ''): void {
        if (!$condition) {
            throw new Exception($message ?: "Expected true, but got false");
        }
    }

    public function assertFalse($condition, string $message = ''): void {
        if ($condition) {
            throw new Exception($message ?: "Expected false, but got true");
        }
    }

    public function summary(): void {
        $total = $this->passed + $this->failed;
        echo "\n============================================\n";
        echo " Hasil Pengujian Unit Test PHP Native\n";
        echo "============================================\n";
        echo " Total Test : {$total}\n";
        echo " Berhasil   : \033[32m{$this->passed}\033[0m\n";
        echo " Gagal      : " . ($this->failed > 0 ? "\033[31m{$this->failed}\033[0m" : "0") . "\n";
        echo "============================================\n";

        if ($this->failed > 0) {
            exit(1);
        }
    }
}

// Inisialisasi runner global
$runner = new TestRunner();

// Load semua test files
require_once __DIR__ . '/SanitizerTest.php';
require_once __DIR__ . '/CSRFTest.php';
require_once __DIR__ . '/RouterTest.php';
require_once __DIR__ . '/AuthTest.php';
require_once __DIR__ . '/AdminPostTest.php';
require_once __DIR__ . '/AdminCommentTest.php';

$runner->summary();
