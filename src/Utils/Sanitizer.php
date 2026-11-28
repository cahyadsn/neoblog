<?php
/**
 * Utility Sanitizer untuk pencegahan XSS dan pembersihan string
 */

class Sanitizer {
    /**
     * Escape string untuk output aman di HTML
     */
    public static function clean(?string $input): string {
        if ($input === null) {
            return '';
        }
        return htmlspecialchars(trim($input), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    /**
     * Sanitasi dan validasi email
     */
    public static function cleanEmail(?string $email): string {
        $clean = filter_var(trim((string)$email), FILTER_SANITIZE_EMAIL);
        return filter_var($clean, FILTER_VALIDATE_EMAIL) ? $clean : '';
    }

    /**
     * Buat URL slug dari teks (misal judul artikel)
     */
    public static function slugify(string $text): string {
        // Ganti karakter non-alfanumerik dengan strip
        $text = preg_replace('~[^\pL\d]+~u', '-', $text);
        // Transliterasi
        $text = iconv('utf-8', 'us-ascii//TRANSLIT', $text) ?: $text;
        // Hapus karakter yang tidak diinginkan
        $text = preg_replace('~[^-\w]+~', '', $text);
        // Trim strip
        $text = trim($text, '-');
        // Kecilkan semua huruf
        $text = strtolower($text);
        // Hapus strip duplikat
        $text = preg_replace('~-+~', '-', $text);

        return empty($text) ? 'n-a' : $text;
    }

    /**
     * Sanitasi HTML artikel menggunakan allowlist DOMDocument native (tanpa HTML-ENTITIES)
     */
    public static function cleanHtml(?string $html): string {
        if ($html === null || trim($html) === '') {
            return '';
        }

        $allowedTags = [
            'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'ul', 'ol', 'li', 'strong', 'em', 'b', 'i',
            'code', 'pre', 'blockquote', 'a', 'br', 'hr', 'img',
        ];
        $dangerousTags = [
            'script', 'iframe', 'style', 'object', 'embed',
            'svg', 'math', 'noscript', 'template', 'form',
        ];
        $allowedAttrs = [
            'a'   => ['href', 'title', 'target', 'rel'],
            'img' => ['src', 'alt', 'title', 'width', 'height'],
        ];

        $prevUseErrors = libxml_use_internal_errors(true);
        try {
            $dom = new DOMDocument('1.0', 'UTF-8');
            $wrapped = '<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body>' . $html . '</body></html>';
            $dom->loadHTML($wrapped, LIBXML_NONET);

            $body = $dom->getElementsByTagName('body')->item(0);
            if (!$body) {
                return '';
            }

            self::sanitizeDomChildren($body, $allowedTags, $dangerousTags, $allowedAttrs);

            $output = '';
            foreach ($body->childNodes as $child) {
                $output .= $dom->saveHTML($child);
            }
            return trim($output);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($prevUseErrors);
        }
    }

    private static function sanitizeDomChildren(DOMNode $parent, array $allowedTags, array $dangerousTags, array $allowedAttrs): void {
        $children = [];
        foreach ($parent->childNodes as $child) {
            $children[] = $child;
        }

        foreach ($children as $node) {
            if ($node instanceof DOMText) {
                continue;
            }

            if (!($node instanceof DOMElement)) {
                $parent->removeChild($node);
                continue;
            }

            $tag = strtolower($node->tagName);

            if (in_array($tag, $dangerousTags, true)) {
                $parent->removeChild($node);
                continue;
            }

            // Sanitasi anak terlebih dahulu
            self::sanitizeDomChildren($node, $allowedTags, $dangerousTags, $allowedAttrs);

            if (!in_array($tag, $allowedTags, true)) {
                // Unwrap tag non-berbahaya yang tidak di-allowlist
                $grandChildren = [];
                foreach ($node->childNodes as $gc) {
                    $grandChildren[] = $gc;
                }
                foreach ($grandChildren as $gc) {
                    $parent->insertBefore($gc, $node);
                }
                $parent->removeChild($node);
                continue;
            }

            // Sanitasi atribut pada tag yang diizinkan
            $tagAllowedAttrs = $allowedAttrs[$tag] ?? [];
            $attrs = [];
            foreach ($node->attributes as $attr) {
                $attrs[] = $attr;
            }

            foreach ($attrs as $attr) {
                $attrName = strtolower($attr->nodeName);
                if (str_starts_with($attrName, 'on') || !in_array($attrName, $tagAllowedAttrs, true)) {
                    $node->removeAttribute($attr->nodeName);
                    continue;
                }

                if ($attrName === 'href' || $attrName === 'src') {
                    $allowMailto = ($tag === 'a' && $attrName === 'href');
                    if (!self::isSafeUrl($attr->nodeValue, $allowMailto)) {
                        $node->removeAttribute($attr->nodeName);
                    }
                } elseif ($attrName === 'target') {
                    $val = strtolower(trim($attr->nodeValue));
                    if (!in_array($val, ['_blank', '_self'], true)) {
                        $node->removeAttribute($attr->nodeName);
                    } else {
                        $node->setAttribute('target', $val);
                    }
                } elseif ($attrName === 'width' || $attrName === 'height') {
                    $val = trim($attr->nodeValue);
                    if (!preg_match('/^\d+(%|px)?$/i', $val)) {
                        $node->removeAttribute($attr->nodeName);
                    }
                }
            }

            if ($tag === 'a' && strtolower($node->getAttribute('target')) === '_blank') {
                $node->setAttribute('rel', 'noopener noreferrer');
            }
        }
    }

    private static function isSafeUrl(string $url, bool $allowMailto = false): bool {
        $decoded = html_entity_decode($url, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $normalized = preg_replace('/[\x00-\x20\x7f]+/u', '', $decoded) ?? '';
        if ($normalized === '') {
            return false;
        }

        // Tolak scheme berbahaya secara eksplisit (termasuk bentuk terobfuskasi)
        if (preg_match('/^(javascript|vbscript|data):/i', $normalized)) {
            return false;
        }

        $lower = strtolower($normalized);
        if (str_starts_with($lower, 'http://') || str_starts_with($lower, 'https://')) {
            return true;
        }
        if ($allowMailto && str_starts_with($lower, 'mailto:')) {
            return true;
        }

        // Izinkan path relatif (bukan protocol-relative '//' atau scheme lain)
        if (str_starts_with($normalized, '//')) {
            return false;
        }

        return !preg_match('/^[^\/?#]*:/', $normalized);
    }
}
