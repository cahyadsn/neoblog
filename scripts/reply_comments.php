<?php
/**
 * Script Otomatisasi Comment Responder & Moderator Agent
 * Memeriksa komentar pengunjung yang belum dijawab dan memberikan balasan kontekstual
 * Dijalankan via scheduler: php scripts/reply_comments.php
 */

require_once __DIR__ . '/../config/app.php';
require_once __DIR__ . '/../src/Models/Comment.php';
require_once __DIR__ . '/../src/Utils/Sanitizer.php';

echo "=== [Comment Responder Agent] Memulai Pemindaian Komentar Masuk ===\n";

try {
    $unrepliedComments = Comment::getUnrepliedUserComments(10);
    $total = count($unrepliedComments);

    echo "Menemukan {$total} komentar yang memerlukan respons.\n\n";

    foreach ($unrepliedComments as $c) {
        $author = Sanitizer::clean($c['author_name']);
        $text = $c['comment_text'];
        $postId = (int)$c['post_id'];
        $commentId = (int)$c['id'];
        $postTitle = $c['post_title'];

        echo "-> Menjawab komentar dari '{$author}' pada artikel '{$postTitle}'...\n";

        // Mesin penentu respons cerdas kontekstual
        $replyText = generateSmartReply($author, $text, $postTitle);

        Comment::create([
            'post_id'      => $postId,
            'parent_id'    => $commentId,
            'author_name'  => 'NeoBlog Assistant',
            'author_email' => 'assistant@neoblog.local',
            'comment_text' => $replyText,
            'is_approved'  => 1,
            'is_bot_reply' => 1
        ]);

        echo "   [\033[32mTERJAWAB\033[0m] Respons otomatis berhasil dikirimkan.\n";
    }

    echo "\n=== Selesai memproses semua komentar antrean ===\n";

} catch (Throwable $e) {
    echo "[\033[31mERROR\033[0m] Gagal memproses komentar: " . $e->getMessage() . "\n";
}

/**
 * Logika perumusan balasan cerdas
 */
function generateSmartReply(string $name, string $text, string $title): string {
    $lower = strtolower($text);

    if (str_contains($lower, 'terima kasih') || str_contains($lower, 'makasih') || str_contains($lower, 'thanks')) {
        return "Halo {$name}, sama-sama! Senang sekali artikel '{$title}' dapat bermanfaat untuk Anda. Jangan ragu untuk berbagi pengalaman Anda di kolom komentar!";
    }

    if (str_contains($lower, 'tanya') || str_contains($lower, 'bagaimana') || str_contains($lower, '?')) {
        return "Halo {$name}, pertanyaan yang sangat bagus! Untuk topik '{$title}', pertimbangan utama adalah menjaga implementasi tetap sederhana dan aman sebelum melakukan optimasi lebih lanjut. Tim kami akan terus memperbarui materi ini secara berkala.";
    }

    if (str_contains($lower, 'keren') || str_contains($lower, 'mantap') || str_contains($lower, 'bagus')) {
        return "Terima kasih atas semangat dan dukungannya, {$name}! Nantikan artikel teknis berkualitas lainnya setiap hari di NeoBlog.";
    }

    // Default polite response
    return "Halo {$name}, terima kasih banyak telah menyempatkan waktu untuk membaca artikel '{$title}' dan meninggalkan tanggapan. Semoga wawasan ini membantu proyek pengembangan Anda!";
}
