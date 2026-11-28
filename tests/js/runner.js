/**
 * Native JavaScript Unit Test Runner (Tanpa Framework)
 * Mengetes fungsi utilitas client-side dari public/assets/js/utils.js menggunakan Node.js
 */

const {
    escapeHtml,
    nl2brSafe,
    formatCommentText,
    validateEmail,
    slugifyTitle
} = require('../../public/assets/js/utils.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(` [\x1b[32mPASS\x1b[0m] ${name}`);
        passed++;
    } catch (e) {
        console.log(` [\x1b[31mFAIL\x1b[0m] ${name}`);
        console.log(`        Alasan: ${e.message}`);
        failed++;
    }
}

function assertEqual(expected, actual, msg) {
    if (expected !== actual) {
        throw new Error(msg || `Expected "${expected}", but got "${actual}"`);
    }
}

function assertTrue(cond, msg) {
    if (!cond) throw new Error(msg || 'Expected true, got false');
}

// Test cases
test('JS Utils: escapeHtml mencegah XSS karakter spesial', () => {
    const input = `<img src="x" onerror="alert('hacked')">`;
    const clean = escapeHtml(input);
    assertEqual('&lt;img src=&quot;x&quot; onerror=&quot;alert(&#039;hacked&#039;)&quot;&gt;', clean);
});

test('JS Utils: escapeHtml menangani null, undefined, dan angka 0', () => {
    assertEqual('', escapeHtml(null));
    assertEqual('', escapeHtml(undefined));
    assertEqual('0', escapeHtml(0));
    assertEqual('A &amp; B', escapeHtml('A & B'));
});

test('JS Utils: nl2brSafe mengescape HTML dan mengubah newline menjadi <br>', () => {
    const input = "Baris <1>\nBaris 2\r\nBaris '3'";
    const out = nl2brSafe(input);
    assertEqual('Baris &lt;1&gt;<br>Baris 2<br>Baris &#039;3&#039;', out);
    assertEqual(out, formatCommentText(input));
});

test('JS Utils: validateEmail mengenali email yang sah', () => {
    assertTrue(validateEmail('user@domain.com'), 'Email standar harus valid');
    assertTrue(validateEmail('john.doe+tag@sub.domain.co.id'), 'Email kompleks harus valid');
    assertTrue(validateEmail('  admin@neoblog.local  '), 'Email dengan spasi di tepi harus valid');
});

test('JS Utils: validateEmail menolak email format salah & non-string', () => {
    assertTrue(!validateEmail('user-at-domain.com'), 'Email tanpa @ harus ditolak');
    assertTrue(!validateEmail('user@'), 'Email tanpa domain harus ditolak');
    assertTrue(!validateEmail(''), 'String kosong harus ditolak');
    assertTrue(!validateEmail(null), 'Null harus ditolak');
    assertTrue(!validateEmail(12345), 'Angka harus ditolak');
});

test('JS Utils: slugifyTitle menghasilkan slug URL-safe', () => {
    assertEqual('panduan-php-8-3-native', slugifyTitle('Panduan PHP 8.3 Native!'));
    assertEqual('cafe-resume-artikel', slugifyTitle('Café & Résumé Artikel'));
    assertEqual('', slugifyTitle('---'));
    assertEqual('', slugifyTitle(null));
});

// Search highlight test
const searchModule = require('../../public/assets/js/search.js');
test('JS Search: highlightKeyword menyorot kata kunci dalam teks secara tepat', () => {
    const raw = 'Mengenal Arsitektur Multi-Agent di Antigravity';
    const highlighted = searchModule.highlightKeyword(raw, 'arsitektur');
    assertEqual('Mengenal <mark class="search-highlight">Arsitektur</mark> Multi-Agent di Antigravity', highlighted);
});

test('JS Search: highlightKeyword menangani multiple kata kunci dan karakter khusus regex', () => {
    const raw = 'Panduan PHP 8.3 & Arsitektur (Native)';
    const highlighted = searchModule.highlightKeyword(raw, 'PHP (Native)');
    assertEqual('Panduan <mark class="search-highlight">PHP</mark> 8.3 & Arsitektur <mark class="search-highlight">(Native)</mark>', highlighted);
});

console.log("\n============================================");
console.log(" Hasil Pengujian Unit Test JavaScript Native");
console.log("============================================");
console.log(` Total Test : ${passed + failed}`);
console.log(` Berhasil   : \x1b[32m${passed}\x1b[0m`);
console.log(` Gagal      : ${failed > 0 ? `\x1b[31m${failed}\x1b[0m` : '0'}`);
console.log("============================================");

if (failed > 0) process.exit(1);
