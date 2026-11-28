<?php
/**
 * Script Otomatisasi Content Creator / Writer Agent
 * Dapat dijalankan setiap hari via scheduler: php scripts/daily_content.php [optional_topic]
 */

require_once __DIR__ . '/../config/app.php';
require_once __DIR__ . '/../src/Models/Post.php';
require_once __DIR__ . '/../src/Utils/Sanitizer.php';

echo "=== [Content Creator Agent] Memulai Sesi Penulisan Harian ===\n";

// Koleksi topik dan draft otomatis jika dijalankan tanpa parameter
$contentPool = [
    [
        'category_id' => 1,
        'title' => 'Strategi State Management Bersih pada JavaScript Modern',
        'reading_time' => 4,
        'excerpt' => 'Menjelajahi cara mengelola status aplikasi web secara reaktif tanpa perlu bergantung pada framework rumit.',
        'content' => '<p>Banyak developer pemula beranggapan bahwa state management hanya bisa dilakukan dengan Redux atau Vuex. Padahal, JavaScript Native memiliki EventTarget dan Proxy yang sangat andal.</p><h3>Kekuatan JavaScript Proxy</h3><p>Dengan <code>Proxy</code>, kita dapat mengintersep operasi get dan set pada objek JavaScript untuk memicu update DOM secara otomatis tanpa kompromi performa.</p><p>Pendekatan ini menjaga bundle size aplikasi tetap di bawah 5KB sambil tetap mempertahankan reaktivitas tinggi.</p>'
    ],
    [
        'category_id' => 2,
        'title' => 'Arsitektur Multi-Agent untuk Mengotomatiskan Siklus Software',
        'reading_time' => 5,
        'excerpt' => 'Membongkar cara membagi peran agen AI agar tidak tumpang tindih dan memberikan akurasi kode optimal.',
        'content' => '<p>Saat mendelegasikan tugas ke AI tunggal, sering terjadi halusinasi karena beban konteks yang terlalu besar. Solusinya adalah arsitektur <strong>Multi-Agent</strong>.</p><p>Dengan membagi agen ke dalam fungsi khusus—seperti desainer sistem, arsitek basis data, pengembang logika, dan verifikator pengujian—setiap agen fokus pada bidangnya dengan batasan kontrak antarmuka yang presisi.</p>'
    ],
    [
        'category_id' => 3,
        'title' => 'Praktik Terbaik Desain Basis Data MySQL untuk Skala Tinggi',
        'reading_time' => 6,
        'excerpt' => 'Panduan pengindeksan, normalisasi 3NF, dan strategi partisi data untuk aplikasi web yang terus berkembang.',
        'content' => '<p>Kunci performa aplikasi web sering kali bukan pada bahasa pemrograman, melainkan seberapa efisien query basis data dirancang.</p><h3>Aturan Emas Pengindeksan:</h3><ul><li>Hanya indeks kolom yang sering muncul di klausul WHERE dan JOIN.</li><li>Gunakan tipe data sekecil mungkin yang masih mencukupi kebutuhan (misal TINYINT untuk status).</li><li>Hindari SELECT * di query produksi guna menghemat alokasi memori buffer pool.</li></ul>'
    ]
];

// Periksa apakah ada argumen judul kustom dari CLI
$customTopic = $argv[1] ?? null;

if ($customTopic) {
    $article = [
        'category_id' => 1,
        'title' => $customTopic,
        'reading_time' => 5,
        'excerpt' => 'Artikel terkini mengenai ' . Sanitizer::clean($customTopic),
        'content' => '<p>Artikel mendalam yang membahas secara komprehensif tentang <strong>' . htmlspecialchars($customTopic) . '</strong>.</p><p>Ditulis secara otomatis oleh NeoBlog Content Creator Agent.</p>'
    ];
} else {
    // Ambil topik secara rotasi berdasarkan hari
    $dayOfYear = (int)date('z');
    $article = $contentPool[$dayOfYear % count($contentPool)];
}

$slug = Sanitizer::slugify($article['title']) . '-' . date('Ymd');

try {
    $newId = Post::create([
        'author_id'    => 1, // Admin / Bot Author
        'category_id'  => $article['category_id'],
        'title'        => $article['title'],
        'slug'         => $slug,
        'excerpt'      => $article['excerpt'],
        'content'      => $article['content'],
        'reading_time' => $article['reading_time'],
        'status'       => 'published'
    ]);

    echo "[\033[32mBERHASIL\033[0m] Artikel baru berhasil dipublikasikan!\n";
    echo "  - ID       : {$newId}\n";
    echo "  - Judul    : {$article['title']}\n";
    echo "  - Tautan   : /post/{$slug}\n";
} catch (PDOException $e) {
    if (str_contains($e->getMessage(), 'Duplicate entry')) {
        echo "[\033[33mINFO\033[0m] Artikel dengan topik ini sudah pernah diposting hari ini. Melewati proses.\n";
    } else {
        echo "[\033[31mERROR\033[0m] Terjadi kesalahan database: " . $e->getMessage() . "\n";
    }
} catch (Throwable $e) {
    echo "[\033[31mERROR\033[0m] Gagal mempublikasikan: " . $e->getMessage() . "\n";
}
