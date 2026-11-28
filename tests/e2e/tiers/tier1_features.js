import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SEEDED_PUBLISHED_SLUG_1 = 'membangun-web-modern-php-native-vanilla-stack';
const SEEDED_PUBLISHED_TITLE_1 = 'Membangun Web Modern dengan PHP Native dan Vanilla Web Stack';
const SEEDED_PUBLISHED_TITLE_2 = 'Evolusi Multi-Agent Systems dalam Rekayasa Perangkat Lunak';
const SEEDED_DRAFT_TITLE = 'Panduan Praktis Optimasi Query MySQL untuk Aplikasi Skala Menengah';
const SEEDED_ARCHIVED_TITLE = 'Catatan Rilis Arsitektur Awal NeoBlog v1.0';

function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loginAs(ctx, identifier, password, loginPath = '/admin/login') {
    const client = ctx.createClient(ctx.baseUrl);
    const getRes = await client.get(loginPath);
    ctx.assert.assertStatus(getRes, 200, `GET ${loginPath} should render login form`);
    ctx.assert.assertNoPhpErrors(getRes);
    const csrf = ctx.http.extractCsrfToken(getRes.text);
    ctx.assert.ok(csrf, `Expected CSRF token on ${loginPath}`);

    const postRes = await client.postForm(loginPath, {
        csrf_token: csrf,
        identifier,
        password
    });
    ctx.assert.assertRedirect(postRes, /\/admin\/?$/i, `POST ${loginPath} for ${identifier} should redirect to /admin`);
    return { client, loginRes: postRes };
}

async function getAdminCsrf(ctx, client, path = '/admin') {
    const res = await client.get(path);
    ctx.assert.assertStatus(res, 200, `GET ${path} should return 200`);
    ctx.assert.assertNoPhpErrors(res);
    const csrf = ctx.http.extractCsrfToken(res.text);
    ctx.assert.ok(csrf && /^[0-9a-f]{32,}$/i.test(csrf), `Expected valid CSRF token on ${path}, got ${csrf}`);
    return { res, csrf };
}

function extractPostIdByMarker(html, marker) {
    const rowRe = new RegExp(`<tr\\b[^>]*>[\\s\\S]*?${escapeRegExp(marker)}[\\s\\S]*?<\\/tr>`, 'i');
    const rowMatch = rowRe.exec(html);
    const scope = rowMatch ? rowMatch[0] : null;
    if (scope) {
        const idMatch = /\/admin\/posts\/(\d+)\/(?:edit|update|status|delete)/i.exec(scope);
        if (idMatch) return idMatch[1];
    }
    const idx = html.indexOf(marker);
    if (idx !== -1) {
        const slice = html.slice(Math.max(0, idx - 300), Math.min(html.length, idx + 800));
        const idMatch = /\/admin\/posts\/(\d+)\/(?:edit|update|status|delete)/i.exec(slice);
        if (idMatch) return idMatch[1];
    }
    return null;
}

function extractCommentIdByMarker(html, marker) {
    const rowRe = new RegExp(`<tr\\b[^>]*>[\\s\\S]*?${escapeRegExp(marker)}[\\s\\S]*?<\\/tr>`, 'i');
    const rowMatch = rowRe.exec(html);
    const scope = rowMatch ? rowMatch[0] : null;
    if (scope) {
        const idMatch = /\/admin\/comments\/(\d+)\/(?:approve|hide|reply|delete)/i.exec(scope);
        if (idMatch) return idMatch[1];
    }
    const idx = html.indexOf(marker);
    if (idx !== -1) {
        const slice = html.slice(Math.max(0, idx - 300), Math.min(html.length, idx + 1200));
        const idMatch = /\/admin\/comments\/(\d+)\/(?:approve|hide|reply|delete)/i.exec(slice);
        if (idMatch) return idMatch[1];
    }
    return null;
}

async function createArticleForm(ctx, adminClient, fields) {
    const { csrf } = await getAdminCsrf(ctx, adminClient, '/admin/posts/create');
    const res = await adminClient.postForm('/admin/posts', {
        csrf_token: csrf,
        title: fields.title,
        slug: fields.slug ?? '',
        category_id: String(fields.category_id ?? 1),
        excerpt: fields.excerpt ?? `Ringkasan ${fields.title}`,
        content: fields.content ?? `<p>Konten ${fields.title}</p>`,
        reading_time: String(fields.reading_time ?? 4),
        status: fields.status ?? 'draft'
    });
    ctx.assert.assertRedirect(res, /\/admin\/posts/, 'Create article should redirect to /admin/posts');

    const listRes = await adminClient.get('/admin/posts', { query: { status: fields.status ?? 'all' } });
    ctx.assert.assertStatus(listRes, 200);
    ctx.assert.assertNoPhpErrors(listRes);
    const id = extractPostIdByMarker(listRes.text, fields.title);
    ctx.assert.ok(id, `Could not locate created post ID for "${fields.title}" in /admin/posts`);
    return { id, createRes: res, listRes };
}

async function submitPublicComment(ctx, slug, { authorName, authorEmail, commentText }) {
    const anon = ctx.createClient(ctx.baseUrl);
    const pageRes = await anon.get(`/post/${slug}`);
    ctx.assert.assertStatus(pageRes, 200, `GET /post/${slug} should return 200`);
    ctx.assert.assertNoPhpErrors(pageRes);
    const csrf = ctx.http.extractCsrfToken(pageRes.text);
    const postId = ctx.http.extractHiddenInput(pageRes.text, 'post_id');
    ctx.assert.ok(csrf, 'Expected CSRF token on post detail');
    ctx.assert.ok(postId, 'Expected post_id hidden input on post detail');

    const res = await anon.postAjax('/api/comments', {
        csrf_token: csrf,
        post_id: postId,
        author_name: authorName,
        author_email: authorEmail,
        comment_text: commentText
    });
    return { anon, res, postId };
}

function extractDiskusiCount(html) {
    const m = /Diskusi\s+Komunitas\s*\(\s*(?:<span\b[^>]*>\s*)?(\d+)(?:\s*<\/span>)?\s*\)/i.exec(html);
    return m ? Number.parseInt(m[1], 10) : null;
}

function extractHomeCardCommentCount(html, slug) {
    const re = new RegExp(
        `<article\\b[^>]*class=["'][^"']*post-card[^"']*["'][^>]*>[\\s\\S]*?href=["']/post/${escapeRegExp(slug)}["'][\\s\\S]*?(\\d+)\\s+Komentar[\\s\\S]*?<\\/article>`,
        'i'
    );
    const m = re.exec(html);
    return m ? Number.parseInt(m[1], 10) : null;
}

function extractCommentsListSection(html) {
    const start = html.indexOf('id="commentsList"');
    if (start === -1) return html;
    const end = html.indexOf('</section>', start);
    return end === -1 ? html.slice(start) : html.slice(start, end);
}

export function registerTests() {
    return [
        // ============================================================
        // F1: Session Login & Logout (M1 - 6 Tests)
        // ============================================================
        {
            id: 'T1-F1-01',
            tier: 1,
            feature: 'F1',
            milestone: 'm1',
            name: 'Render Login Form at /admin/login',
            run: async (ctx) => {
                const anon = ctx.createClient(ctx.baseUrl);
                const res = await anon.get('/admin/login');
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertMatch(res, /<form\b[^>]*method=["']?post["']?/i, 'Login form must use POST');
                const csrf = ctx.http.extractCsrfToken(res.text);
                ctx.assert.ok(csrf && /^[0-9a-f]{64}$/i.test(csrf), `Expected 64-hex csrf_token, got ${csrf}`);
                ctx.assert.assertMatch(res, /<input\b[^>]*name=["']identifier["']/i);
                ctx.assert.assertMatch(res, /<input\b[^>]*name=["']password["']/i);
                ctx.assert.assertSetCookieFlag(res, 'PHPSESSID', 'HttpOnly');
                ctx.assert.assertSetCookieFlag(res, 'PHPSESSID', 'SameSite=Lax');
            }
        },
        {
            id: 'T1-F1-02',
            tier: 1,
            feature: 'F1',
            milestone: 'm1',
            name: 'Render Login Form via /login Alias',
            run: async (ctx) => {
                const anon = ctx.createClient(ctx.baseUrl);
                const res = await anon.get('/login');
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                const csrf = ctx.http.extractCsrfToken(res.text);
                ctx.assert.ok(csrf && /^[0-9a-f]{64}$/i.test(csrf), 'Expected 64-hex CSRF token on /login');
                ctx.assert.assertMatch(res, /<input\b[^>]*name=["']identifier["']/i);
                ctx.assert.assertMatch(res, /<input\b[^>]*name=["']password["']/i);
            }
        },
        {
            id: 'T1-F1-03',
            tier: 1,
            feature: 'F1',
            milestone: 'm1',
            name: 'Admin Login by Username & Session Regeneration',
            run: async (ctx) => {
                const client = ctx.createClient(ctx.baseUrl);
                const getRes = await client.get('/admin/login');
                ctx.assert.assertStatus(getRes, 200);
                const preSid = client.getCookie('PHPSESSID');
                const csrf = ctx.http.extractCsrfToken(getRes.text);
                ctx.assert.ok(preSid, 'Expected initial PHPSESSID');

                const postRes = await client.postForm('/admin/login', {
                    csrf_token: csrf,
                    identifier: 'admin',
                    password: 'admin123'
                });
                ctx.assert.assertRedirect(postRes, /\/admin\/?$/i);
                ctx.assert.assertCookieChanged(preSid, client.getCookie('PHPSESSID'), 'PHPSESSID');
                ctx.assert.assertSetCookieFlag(postRes, 'PHPSESSID', 'HttpOnly');
                ctx.assert.assertSetCookieFlag(postRes, 'PHPSESSID', 'SameSite=Lax');

                const dashRes = await client.get('/admin');
                ctx.assert.assertStatus(dashRes, 200);
                ctx.assert.assertNoPhpErrors(dashRes);
            }
        },
        {
            id: 'T1-F1-04',
            tier: 1,
            feature: 'F1',
            milestone: 'm1',
            name: 'Editor Login by Email via /login Alias',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'editor@neoblog.local', 'editor123', '/login');
                const dashRes = await client.get('/admin');
                ctx.assert.assertStatus(dashRes, 200);
                ctx.assert.assertNoPhpErrors(dashRes);
                ctx.assert.assertMatch(dashRes, /Editor/i);
                ctx.assert.assertMatch(dashRes, /Editor NeoBlog|editor/i);
            }
        },
        {
            id: 'T1-F1-05',
            tier: 1,
            feature: 'F1',
            milestone: 'm1',
            name: 'AJAX Login Returns JSON Payload',
            run: async (ctx) => {
                const client = ctx.createClient(ctx.baseUrl);
                const getRes = await client.get('/admin/login');
                ctx.assert.assertStatus(getRes, 200);
                const csrf = ctx.http.extractCsrfToken(getRes.text);

                const res = await client.postAjax('/admin/login', {
                    csrf_token: csrf,
                    identifier: 'admin',
                    password: 'admin123'
                });
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertJson(res, (data) => {
                    ctx.assert.strictEqual(data.success, true);
                    ctx.assert.ok(String(data.redirect || '').includes('/admin'), 'Expected redirect to /admin');
                    ctx.assert.ok(data.user && typeof data.user === 'object', 'Expected user object');
                    ctx.assert.strictEqual(data.user.username, 'admin');
                    ctx.assert.strictEqual(data.user.role, 'admin');
                    ctx.assert.strictEqual(data.user.password_hash, undefined, 'Must not leak password_hash');
                });
            }
        },
        {
            id: 'T1-F1-06',
            tier: 1,
            feature: 'F1',
            milestone: 'm1',
            name: 'CSRF-Protected Logout via /admin/logout & /logout',
            run: async (ctx) => {
                // Cycle 1: POST /admin/logout
                const { client: c1 } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf: csrf1 } = await getAdminCsrf(ctx, c1, '/admin');
                const logout1 = await c1.postForm('/admin/logout', { csrf_token: csrf1 });
                ctx.assert.assertRedirect(logout1, /\/(?:admin\/)?login\/?$/i);
                const after1 = await c1.get('/admin');
                ctx.assert.assertRedirect(after1, /\/(?:admin\/)?login/i);

                // Cycle 2: POST /logout alias
                const { client: c2 } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf: csrf2 } = await getAdminCsrf(ctx, c2, '/admin');
                const logout2 = await c2.postForm('/logout', { csrf_token: csrf2 });
                ctx.assert.assertRedirect(logout2, /\/(?:admin\/)?login\/?$/i);
                const after2 = await c2.get('/admin');
                ctx.assert.assertRedirect(after2, /\/(?:admin\/)?login/i);
            }
        },

        // ============================================================
        // F2: Role-Based Access Control (M1 - 5 Tests)
        // ============================================================
        {
            id: 'T1-F2-01',
            tier: 1,
            feature: 'F2',
            milestone: 'm1',
            name: 'Admin Role Permitted Across All /admin* GET Routes',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                for (const route of ['/admin', '/admin/posts', '/admin/posts/create', '/admin/comments']) {
                    const res = await client.get(route);
                    ctx.assert.assertStatus(res, 200, `Admin GET ${route} must return 200`);
                    ctx.assert.assertNoPhpErrors(res);
                }
            }
        },
        {
            id: 'T1-F2-02',
            tier: 1,
            feature: 'F2',
            milestone: 'm1',
            name: 'Editor Role Permitted Across All /admin* GET Routes',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'editor', 'editor123');
                for (const route of ['/admin', '/admin/posts', '/admin/posts/create', '/admin/comments']) {
                    const res = await client.get(route);
                    ctx.assert.assertStatus(res, 200, `Editor GET ${route} must return 200`);
                    ctx.assert.assertNoPhpErrors(res);
                }
            }
        },
        {
            id: 'T1-F2-03',
            tier: 1,
            feature: 'F2',
            milestone: 'm1',
            name: 'Authenticated Admin Redirected Away from /admin/login',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const res = await client.get('/admin/login');
                ctx.assert.assertRedirect(res, /\/admin\/?$/i);
            }
        },
        {
            id: 'T1-F2-04',
            tier: 1,
            feature: 'F2',
            milestone: 'm1',
            name: 'Authenticated Editor Redirected Away from /login',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'editor', 'editor123');
                const res = await client.get('/login');
                ctx.assert.assertRedirect(res, /\/admin\/?$/i);
            }
        },
        {
            id: 'T1-F2-05',
            tier: 1,
            feature: 'F2',
            milestone: 'm1',
            name: 'Public Routes Accessible Without Auth',
            run: async (ctx) => {
                const anon = ctx.createClient(ctx.baseUrl);
                const home = await anon.get('/');
                ctx.assert.assertStatus(home, 200);
                ctx.assert.assertNoPhpErrors(home);

                const detail = await anon.get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertStatus(detail, 200);
                ctx.assert.assertNoPhpErrors(detail);
            }
        },

        // ============================================================
        // F3: Admin Dashboard & Layout Shell (M1 - 5 Tests)
        // ============================================================
        {
            id: 'T1-F3-01',
            tier: 1,
            feature: 'F3',
            milestone: 'm1',
            name: 'Dashboard Overview Page Renders Metrics & Navigation',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const res = await client.get('/admin');
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertIncludes(res, '<nav');
                ctx.assert.assertIncludes(res, '/admin/posts');
                ctx.assert.assertIncludes(res, '/admin/comments');
                ctx.assert.assertMatch(res, /href=["']\/["']/i);
                ctx.assert.assertMatch(res, /<form\b[^>]*action=["'][^"']*\/(?:admin\/)?logout["'][^>]*method=["']post["']|<form\b[^>]*method=["']post["'][^>]*action=["'][^"']*\/(?:admin\/)?logout["']/i);
                ctx.assert.ok(ctx.http.extractCsrfToken(res.text), 'Expected CSRF token in logout form');
                ctx.assert.assertMatch(res, /Total Artikel|Draf|Terbit/i);
                ctx.assert.assertMatch(res, /Komentar/i);
            }
        },
        {
            id: 'T1-F3-02',
            tier: 1,
            feature: 'F3',
            milestone: 'm1',
            name: 'Dashboard Displays Logged-In User Identity & Role',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'editor', 'editor123');
                const res = await client.get('/admin');
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertMatch(res, /Editor NeoBlog|editor/i);
                ctx.assert.assertMatch(res, /Editor/i);
            }
        },
        {
            id: 'T1-F3-03',
            tier: 1,
            feature: 'F3',
            milestone: 'm1',
            name: 'Public Layout Isolation From Admin Controls',
            run: async (ctx) => {
                const anon = ctx.createClient(ctx.baseUrl);
                const home = await anon.get('/');
                ctx.assert.assertStatus(home, 200);
                ctx.assert.assertNoPhpErrors(home);
                ctx.assert.assertIncludes(home, 'Beranda');
                ctx.assert.assertIncludes(home, 'id="themeToggleBtn"');
                ctx.assert.assertIncludes(home, 'posts-grid');
                ctx.assert.assertIncludes(home, '/assets/js/main.js');
                ctx.assert.assertNotIncludes(home, '/admin/logout');

                const detail = await anon.get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertStatus(detail, 200);
                ctx.assert.assertNoPhpErrors(detail);
                ctx.assert.assertIncludes(detail, 'post-detail');
                ctx.assert.assertIncludes(detail, '/assets/js/main.js');
            }
        },
        {
            id: 'T1-F3-04',
            tier: 1,
            feature: 'F3',
            milestone: 'm1',
            name: 'Admin Layout Includes Theme Toggle & Native CSS/JS Assets',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const res = await client.get('/admin');
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertIncludes(res, '/assets/css/style.css');
                ctx.assert.assertIncludes(res, '/assets/js/main.js');
                ctx.assert.assertIncludes(res, '/assets/js/admin.js');
                ctx.assert.assertIncludes(res, 'id="themeToggleBtn"');

                if (!res.text.includes('/assets/css/variables.css')) {
                    const cssRes = await client.get('/assets/css/style.css');
                    ctx.assert.assertStatus(cssRes, 200);
                    ctx.assert.assertIncludes(cssRes, 'variables.css');
                }

                ctx.assert.assertNotMatch(res, /(?:cdn\.|unpkg\.com|jsdelivr|cdnjs|<script[^>]+src=["']https?:\/\/|<link[^>]+href=["']https?:\/\/)/i);
            }
        },
        {
            id: 'T1-F3-05',
            tier: 1,
            feature: 'F3',
            milestone: 'm1',
            name: 'Admin Quick-Action Links Resolve Validly',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const dash = await client.get('/admin');
                ctx.assert.assertStatus(dash, 200);
                ctx.assert.assertIncludes(dash, '/admin/posts');
                ctx.assert.assertIncludes(dash, '/admin/comments');

                for (const target of ['/admin/posts', '/admin/posts/create', '/admin/comments']) {
                    const r = await client.get(target);
                    ctx.assert.assertStatus(r, 200, `Linked admin route ${target} must resolve 200`);
                    ctx.assert.assertNoPhpErrors(r);
                }
            }
        },

        // ============================================================
        // F4: Seed Fix & Schema/Fixture Baseline (M1 - 5 Tests)
        // ============================================================
        {
            id: 'T1-F4-01',
            tier: 1,
            feature: 'F4',
            milestone: 'm1',
            name: 'Seeded Admin Credentials Valid (admin / admin123)',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const res = await client.get('/admin');
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
            }
        },
        {
            id: 'T1-F4-02',
            tier: 1,
            feature: 'F4',
            milestone: 'm1',
            name: 'Seeded Editor Credentials Valid (editor / editor123)',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'editor', 'editor123');
                const res = await client.get('/admin');
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertMatch(res, /Editor/i);
            }
        },
        {
            id: 'T1-F4-03',
            tier: 1,
            feature: 'F4',
            milestone: 'm1',
            name: 'Seeded Author Account Exists (author / author123)',
            run: async (ctx) => {
                const client = ctx.createClient(ctx.baseUrl);
                const getRes = await client.get('/admin/login');
                ctx.assert.assertStatus(getRes, 200);
                const csrf = ctx.http.extractCsrfToken(getRes.text);

                const res = await client.postForm('/admin/login', {
                    csrf_token: csrf,
                    identifier: 'author',
                    password: 'author123'
                });
                // Must fail with 403 (role forbidden), not 401 (bad password) or 302 /admin
                ctx.assert.assertStatus(res, 403, 'Valid author credentials should trigger RBAC 403, not 401');
                ctx.assert.assertNoPhpErrors(res);
            }
        },
        {
            id: 'T1-F4-04',
            tier: 1,
            feature: 'F4',
            milestone: 'm1',
            name: 'Seeded Published Posts & Categories Visible Publicly',
            run: async (ctx) => {
                const anon = ctx.createClient(ctx.baseUrl);
                const res = await anon.get('/');
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertIncludes(res, SEEDED_PUBLISHED_TITLE_1);
                ctx.assert.assertIncludes(res, SEEDED_PUBLISHED_TITLE_2);
                ctx.assert.assertIncludes(res, 'Teknologi');
                ctx.assert.assertIncludes(res, 'Kecerdasan Buatan');
            }
        },
        {
            id: 'T1-F4-05',
            tier: 1,
            feature: 'F4',
            milestone: 'm1',
            name: 'Seeded Draft/Archived Posts & Pending Comments Present in Admin',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const draftRes = await client.get('/admin/posts', { query: { status: 'draft' } });
                ctx.assert.assertStatus(draftRes, 200);
                ctx.assert.assertNoPhpErrors(draftRes);
                ctx.assert.assertIncludes(draftRes, SEEDED_DRAFT_TITLE);

                const archRes = await client.get('/admin/posts', { query: { status: 'archived' } });
                ctx.assert.assertStatus(archRes, 200);
                ctx.assert.assertNoPhpErrors(archRes);
                ctx.assert.assertIncludes(archRes, SEEDED_ARCHIVED_TITLE);

                const pendRes = await client.get('/admin/comments', { query: { status: 'pending' } });
                ctx.assert.assertStatus(pendRes, 200);
                ctx.assert.assertNoPhpErrors(pendRes);
                ctx.assert.assertMatch(pendRes, /Siti Rahma|Andi Wijaya/);
            }
        },

        // ============================================================
        // F5: Core Security, CSRF Header, HTML Sanitization, JSON 404 (M1 - 5 Tests)
        // ============================================================
        {
            id: 'T1-F5-01',
            tier: 1,
            feature: 'F5',
            milestone: 'm1',
            name: 'CSRF Validation via X-CSRF-Token Header',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin');

                const res = await client.postAjax('/admin/logout', {}, { csrfToken: csrf });
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertJson(res, { success: true });

                const check = await client.get('/admin');
                ctx.assert.assertRedirect(check, /\/(?:admin\/)?login/i);
            }
        },
        {
            id: 'T1-F5-02',
            tier: 1,
            feature: 'F5',
            milestone: 'm1',
            name: 'Router Returns JSON 404 for Unknown API Routes',
            run: async (ctx) => {
                const anon = ctx.createClient(ctx.baseUrl);
                const getApi = await anon.get('/api/nonexistent-endpoint', { ajax: true });
                ctx.assert.assertStatus(getApi, 404);
                ctx.assert.assertNoPhpErrors(getApi);
                ctx.assert.assertJson(getApi, (data) => {
                    ctx.assert.strictEqual(data.success, false);
                    ctx.assert.ok(data.error, 'Expected error field in JSON 404');
                });

                const postApi = await anon.postAjax('/api/nonexistent', {});
                ctx.assert.assertStatus(postApi, 404);
                ctx.assert.assertJson(postApi, { success: false });
            }
        },
        {
            id: 'T1-F5-03',
            tier: 1,
            feature: 'F5',
            milestone: 'm1',
            name: 'Router Normalizes Trailing Slashes Consistently',
            run: async (ctx) => {
                const anon = ctx.createClient(ctx.baseUrl);
                const pubSlash = await anon.get(`/post/${SEEDED_PUBLISHED_SLUG_1}/`);
                ctx.assert.assertStatus(pubSlash, 200);
                ctx.assert.assertNoPhpErrors(pubSlash);
                ctx.assert.assertIncludes(pubSlash, SEEDED_PUBLISHED_TITLE_1);

                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const adminSlash = await client.get('/admin/');
                ctx.assert.assertStatus(adminSlash, 200);
                ctx.assert.assertNoPhpErrors(adminSlash);
            }
        },
        {
            id: 'T1-F5-04',
            tier: 1,
            feature: 'F5',
            milestone: 'm1',
            name: 'Rich HTML Allowlist Preserved on Public Article Detail',
            run: async (ctx) => {
                const anon = ctx.createClient(ctx.baseUrl);
                const res = await anon.get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertIncludes(res, '<p>');
                ctx.assert.assertIncludes(res, '<h3>Kenapa Memilih Native?</h3>');
                ctx.assert.assertIncludes(res, '<ul>');
                ctx.assert.assertIncludes(res, '<li>');
                ctx.assert.assertIncludes(res, '<strong>PHP Native</strong>');
            }
        },
        {
            id: 'T1-F5-05',
            tier: 1,
            feature: 'F5',
            milestone: 'm1',
            name: 'All Native CSS & JS Static Assets Served Cleanly',
            run: async (ctx) => {
                const anon = ctx.createClient(ctx.baseUrl);
                const assets = [
                    '/assets/css/variables.css',
                    '/assets/css/style.css',
                    '/assets/js/main.js',
                    '/assets/js/comments.js',
                    '/assets/js/utils.js',
                    '/assets/js/admin.js'
                ];
                for (const asset of assets) {
                    const res = await anon.get(asset);
                    ctx.assert.assertStatus(res, 200, `Asset ${asset} must be served with 200`);
                    ctx.assert.assertNoPhpErrors(res);
                    ctx.assert.ok(res.text.trim().length > 0, `Asset ${asset} must not be empty`);
                }
            }
        },

        // ============================================================
        // F6: Article Draft Listing & Filtering (M2 - 5 Tests)
        // ============================================================
        {
            id: 'T1-F6-01',
            tier: 1,
            feature: 'F6',
            milestone: 'm2',
            name: 'List All Articles at /admin/posts',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                for (const query of [undefined, { status: 'all' }]) {
                    const res = await client.get('/admin/posts', { query });
                    ctx.assert.assertStatus(res, 200);
                    ctx.assert.assertNoPhpErrors(res);
                    ctx.assert.assertIncludes(res, SEEDED_PUBLISHED_TITLE_1);
                    ctx.assert.assertIncludes(res, SEEDED_DRAFT_TITLE);
                    ctx.assert.assertIncludes(res, SEEDED_ARCHIVED_TITLE);
                    ctx.assert.assertMatch(res, /\/admin\/posts\/\d+\/edit/);
                    ctx.assert.assertMatch(res, /\/admin\/posts\/\d+\/delete/);
                }
            }
        },
        {
            id: 'T1-F6-02',
            tier: 1,
            feature: 'F6',
            milestone: 'm2',
            name: 'Filter Articles by status=draft',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const res = await client.get('/admin/posts', { query: { status: 'draft' } });
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertIncludes(res, SEEDED_DRAFT_TITLE);
                ctx.assert.assertNotIncludes(res, SEEDED_PUBLISHED_TITLE_1);
                ctx.assert.assertNotIncludes(res, SEEDED_ARCHIVED_TITLE);
            }
        },
        {
            id: 'T1-F6-03',
            tier: 1,
            feature: 'F6',
            milestone: 'm2',
            name: 'Filter Articles by status=published',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const res = await client.get('/admin/posts', { query: { status: 'published' } });
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertIncludes(res, SEEDED_PUBLISHED_TITLE_1);
                ctx.assert.assertNotIncludes(res, SEEDED_DRAFT_TITLE);
                ctx.assert.assertNotIncludes(res, SEEDED_ARCHIVED_TITLE);
            }
        },
        {
            id: 'T1-F6-04',
            tier: 1,
            feature: 'F6',
            milestone: 'm2',
            name: 'Filter Articles by status=archived',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const res = await client.get('/admin/posts', { query: { status: 'archived' } });
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertIncludes(res, SEEDED_ARCHIVED_TITLE);
                ctx.assert.assertNotIncludes(res, SEEDED_DRAFT_TITLE);
                ctx.assert.assertNotIncludes(res, SEEDED_PUBLISHED_TITLE_1);
            }
        },
        {
            id: 'T1-F6-05',
            tier: 1,
            feature: 'F6',
            milestone: 'm2',
            name: 'Search Articles by Keyword q Combined with Status',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const res = await client.get('/admin/posts', {
                    query: { status: 'published', q: 'Vanilla' }
                });
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertIncludes(res, SEEDED_PUBLISHED_TITLE_1);
                ctx.assert.assertNotIncludes(res, SEEDED_PUBLISHED_TITLE_2);
                ctx.assert.assertNotIncludes(res, SEEDED_DRAFT_TITLE);
            }
        },

        // ============================================================
        // F7: Article Create & Edit (M2 - 6 Tests)
        // ============================================================
        {
            id: 'T1-F7-01',
            tier: 1,
            feature: 'F7',
            milestone: 'm2',
            name: 'Render Create Article Form with Category Dropdown & Statuses',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const res = await client.get('/admin/posts/create');
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.ok(ctx.http.extractCsrfToken(res.text), 'Expected csrf_token in create form');
                for (const field of ['title', 'slug', 'category_id', 'excerpt', 'content', 'reading_time', 'status']) {
                    ctx.assert.assertMatch(res, new RegExp(`name=["']${field}["']`, 'i'), `Missing field ${field}`);
                }
                ctx.assert.assertIncludes(res, 'Teknologi');
                ctx.assert.assertIncludes(res, 'Kecerdasan Buatan');
                ctx.assert.assertIncludes(res, 'Tutorial');
                ctx.assert.assertMatch(res, /value=["']draft["']/i);
                ctx.assert.assertMatch(res, /value=["']published["']/i);
                ctx.assert.assertMatch(res, /value=["']archived["']/i);
            }
        },
        {
            id: 'T1-F7-02',
            tier: 1,
            feature: 'F7',
            milestone: 'm2',
            name: 'Create Draft Article via POST /admin/posts with Auto-Slug',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const title = `Panduan Draft E2E ${ctx.uid}`;
                const expectedSlug = `panduan-draft-e2e-${ctx.uid.toLowerCase()}`;
                await createArticleForm(ctx, client, {
                    title,
                    slug: '',
                    category_id: 1,
                    excerpt: `Ringkasan ${ctx.uid}`,
                    content: `<p>Isi draft ${ctx.uid}</p>`,
                    reading_time: 4,
                    status: 'draft'
                });

                const draftList = await client.get('/admin/posts', { query: { status: 'draft' } });
                ctx.assert.assertStatus(draftList, 200);
                ctx.assert.assertIncludes(draftList, title);
                ctx.assert.assertIncludes(draftList, expectedSlug);

                const anon = ctx.createClient(ctx.baseUrl);
                const home = await anon.get('/');
                ctx.assert.assertNotIncludes(home, title);
                const pubDetail = await anon.get(`/post/${expectedSlug}`);
                ctx.assert.assertStatus(pubDetail, 404);
            }
        },
        {
            id: 'T1-F7-03',
            tier: 1,
            feature: 'F7',
            milestone: 'm2',
            name: 'Create Published Article via POST /admin/posts/store Alias',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/posts/create');
                const title = `Artikel Terbit Alias ${ctx.uid}`;
                const slug = `artikel-terbit-alias-${ctx.uid.toLowerCase()}`;
                const res = await client.postForm('/admin/posts/store', {
                    csrf_token: csrf,
                    title,
                    slug,
                    category_id: '2',
                    excerpt: `Ex ${ctx.uid}`,
                    content: `<p>Konten ${ctx.uid}</p>`,
                    reading_time: '6',
                    status: 'published'
                });
                ctx.assert.assertRedirect(res, /\/admin\/posts/);

                const anon = ctx.createClient(ctx.baseUrl);
                const home = await anon.get('/');
                ctx.assert.assertStatus(home, 200);
                ctx.assert.assertIncludes(home, title);

                const detail = await anon.get(`/post/${slug}`);
                ctx.assert.assertStatus(detail, 200);
                ctx.assert.assertNoPhpErrors(detail);
                ctx.assert.assertIncludes(detail, `Konten ${ctx.uid}`);
                ctx.assert.assertIncludes(detail, 'Kecerdasan Buatan');
                ctx.assert.assertIncludes(detail, '6 menit baca');
            }
        },
        {
            id: 'T1-F7-04',
            tier: 1,
            feature: 'F7',
            milestone: 'm2',
            name: 'Render Edit Form Pre-Populated with Existing Article Data',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const title = `Draft Edit Preview ${ctx.uid}`;
                const slug = `draft-edit-preview-${ctx.uid.toLowerCase()}`;
                const { id } = await createArticleForm(ctx, client, {
                    title,
                    slug,
                    category_id: 2,
                    excerpt: `Excerpt edit ${ctx.uid}`,
                    content: `<p>Body edit ${ctx.uid}</p>`,
                    reading_time: 7,
                    status: 'draft'
                });

                const editRes = await client.get(`/admin/posts/${id}/edit`);
                ctx.assert.assertStatus(editRes, 200);
                ctx.assert.assertNoPhpErrors(editRes);
                ctx.assert.ok(ctx.http.extractCsrfToken(editRes.text));
                ctx.assert.strictEqual(ctx.http.extractInputValue(editRes.text, 'title'), title);
                ctx.assert.strictEqual(ctx.http.extractInputValue(editRes.text, 'slug'), slug);
                ctx.assert.strictEqual(ctx.http.extractInputValue(editRes.text, 'reading_time'), '7');
                ctx.assert.assertIncludes(editRes, `Excerpt edit ${ctx.uid}`);
                ctx.assert.assertIncludes(editRes, `Body edit ${ctx.uid}`);
            }
        },
        {
            id: 'T1-F7-05',
            tier: 1,
            feature: 'F7',
            milestone: 'm2',
            name: 'Edit Article Content, Category, Reading Time & Title',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const slug = `edit-target-${ctx.uid.toLowerCase()}`;
                const { id } = await createArticleForm(ctx, client, {
                    title: `Before Edit ${ctx.uid}`,
                    slug,
                    category_id: 1,
                    excerpt: `Old excerpt ${ctx.uid}`,
                    content: `<p>Old content ${ctx.uid}</p>`,
                    reading_time: 3,
                    status: 'draft'
                });

                const { csrf } = await getAdminCsrf(ctx, client, `/admin/posts/${id}/edit`);
                const updatedTitle = `After Edit ${ctx.uid}`;
                const updRes = await client.postForm(`/admin/posts/${id}/update`, {
                    csrf_token: csrf,
                    title: updatedTitle,
                    slug,
                    category_id: '3',
                    excerpt: `New excerpt ${ctx.uid}`,
                    content: `<p>Updated <strong>HTML</strong> ${ctx.uid}</p>`,
                    reading_time: '9',
                    status: 'published'
                });
                ctx.assert.assertRedirect(updRes, /\/admin\/posts/);

                const anon = ctx.createClient(ctx.baseUrl);
                const detail = await anon.get(`/post/${slug}`);
                ctx.assert.assertStatus(detail, 200);
                ctx.assert.assertNoPhpErrors(detail);
                ctx.assert.assertIncludes(detail, updatedTitle);
                ctx.assert.assertIncludes(detail, 'Tutorial');
                ctx.assert.assertIncludes(detail, '9 menit baca');
                ctx.assert.assertIncludes(detail, '<strong>HTML</strong>');
            }
        },
        {
            id: 'T1-F7-06',
            tier: 1,
            feature: 'F7',
            milestone: 'm2',
            name: 'Create & Update Article via AJAX JSON Mode',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/posts/create');
                const title = `AJAX Draft ${ctx.uid}`;
                const slug = `ajax-draft-${ctx.uid.toLowerCase()}`;

                const createRes = await client.postAjax(
                    '/admin/posts',
                    {
                        title,
                        slug,
                        category_id: '1',
                        excerpt: `Ajax ex ${ctx.uid}`,
                        content: `<p>Ajax body ${ctx.uid}</p>`,
                        reading_time: '5',
                        status: 'draft'
                    },
                    { csrfToken: csrf }
                );
                ctx.assert.assertStatusIn(createRes, [200, 201]);
                ctx.assert.assertNoPhpErrors(createRes);
                const createData = ctx.assert.assertJson(createRes, { success: true });
                const id = createData.post?.id ?? createData.id;
                ctx.assert.ok(id, 'Expected created post ID in AJAX JSON');

                const updatedTitle = `AJAX Updated ${ctx.uid}`;
                const updRes = await client.postAjax(
                    `/admin/posts/${id}/update`,
                    {
                        title: updatedTitle,
                        slug,
                        category_id: '2',
                        excerpt: `Ajax ex2 ${ctx.uid}`,
                        content: `<p>Ajax body2 ${ctx.uid}</p>`,
                        reading_time: '8',
                        status: 'draft'
                    },
                    { csrfToken: csrf }
                );
                ctx.assert.assertStatus(updRes, 200);
                ctx.assert.assertNoPhpErrors(updRes);
                ctx.assert.assertJson(updRes, { success: true });

                const editRes = await client.get(`/admin/posts/${id}/edit`);
                ctx.assert.assertStatus(editRes, 200);
                ctx.assert.strictEqual(ctx.http.extractInputValue(editRes.text, 'title'), updatedTitle);
                ctx.assert.strictEqual(ctx.http.extractInputValue(editRes.text, 'reading_time'), '8');
            }
        },

        // ============================================================
        // F8: Article Status Transitions & Delete (M2 - 6 Tests)
        // ============================================================
        {
            id: 'T1-F8-01',
            tier: 1,
            feature: 'F8',
            milestone: 'm2',
            name: 'Quick Publish Draft via POST /admin/posts/{id}/status',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const title = `Quick Publish ${ctx.uid}`;
                const slug = `quick-publish-${ctx.uid.toLowerCase()}`;
                const { id } = await createArticleForm(ctx, client, { title, slug, status: 'draft' });

                const { csrf } = await getAdminCsrf(ctx, client, '/admin/posts');
                const res = await client.postForm(`/admin/posts/${id}/status`, {
                    csrf_token: csrf,
                    status: 'published'
                });
                ctx.assert.assertRedirect(res, /\/admin\/posts/);

                const pubList = await client.get('/admin/posts', { query: { status: 'published' } });
                ctx.assert.assertIncludes(pubList, title);
                const draftList = await client.get('/admin/posts', { query: { status: 'draft' } });
                ctx.assert.assertNotIncludes(draftList, title);

                const anon = ctx.createClient(ctx.baseUrl);
                ctx.assert.assertIncludes(await anon.get('/'), title);
                const detail = await anon.get(`/post/${slug}`);
                ctx.assert.assertStatus(detail, 200);
                ctx.assert.assertIncludes(detail, 'Dipublikasikan pada');
            }
        },
        {
            id: 'T1-F8-02',
            tier: 1,
            feature: 'F8',
            milestone: 'm2',
            name: 'Revert Published Article Back to Draft',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const title = `Revert Draft ${ctx.uid}`;
                const slug = `revert-draft-${ctx.uid.toLowerCase()}`;
                const { id } = await createArticleForm(ctx, client, { title, slug, status: 'published' });

                const { csrf } = await getAdminCsrf(ctx, client, '/admin/posts');
                const res = await client.postForm(`/admin/posts/${id}/status`, {
                    csrf_token: csrf,
                    status: 'draft'
                });
                ctx.assert.assertRedirect(res, /\/admin\/posts/);

                const anon = ctx.createClient(ctx.baseUrl);
                ctx.assert.assertNotIncludes(await anon.get('/'), title);
                ctx.assert.assertStatus(await anon.get(`/post/${slug}`), 404);
                ctx.assert.assertIncludes(await client.get('/admin/posts', { query: { status: 'draft' } }), title);
            }
        },
        {
            id: 'T1-F8-03',
            tier: 1,
            feature: 'F8',
            milestone: 'm2',
            name: 'Archive Published Article via POST /admin/posts/{id}/status',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const title = `Archive Target ${ctx.uid}`;
                const slug = `archive-target-${ctx.uid.toLowerCase()}`;
                const { id } = await createArticleForm(ctx, client, { title, slug, status: 'published' });

                const { csrf } = await getAdminCsrf(ctx, client, '/admin/posts');
                const res = await client.postForm(`/admin/posts/${id}/status`, {
                    csrf_token: csrf,
                    status: 'archived'
                });
                ctx.assert.assertRedirect(res, /\/admin\/posts/);

                const anon = ctx.createClient(ctx.baseUrl);
                ctx.assert.assertNotIncludes(await anon.get('/'), title);
                ctx.assert.assertStatus(await anon.get(`/post/${slug}`), 404);
                ctx.assert.assertIncludes(await client.get('/admin/posts', { query: { status: 'archived' } }), title);
            }
        },
        {
            id: 'T1-F8-04',
            tier: 1,
            feature: 'F8',
            milestone: 'm2',
            name: 'Restore Archived Article to Published',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const title = `Restore Archived ${ctx.uid}`;
                const slug = `restore-archived-${ctx.uid.toLowerCase()}`;
                const { id } = await createArticleForm(ctx, client, { title, slug, status: 'archived' });

                const { csrf } = await getAdminCsrf(ctx, client, '/admin/posts');
                const res = await client.postForm(`/admin/posts/${id}/status`, {
                    csrf_token: csrf,
                    status: 'published'
                });
                ctx.assert.assertRedirect(res, /\/admin\/posts/);

                const anon = ctx.createClient(ctx.baseUrl);
                ctx.assert.assertIncludes(await anon.get('/'), title);
                ctx.assert.assertStatus(await anon.get(`/post/${slug}`), 200);
            }
        },
        {
            id: 'T1-F8-05',
            tier: 1,
            feature: 'F8',
            milestone: 'm2',
            name: 'Quick Status Transition via AJAX JSON',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const title = `AJAX Status ${ctx.uid}`;
                const slug = `ajax-status-${ctx.uid.toLowerCase()}`;
                const { id } = await createArticleForm(ctx, client, { title, slug, status: 'draft' });

                const { csrf } = await getAdminCsrf(ctx, client, '/admin/posts');
                const res = await client.postAjax(
                    `/admin/posts/${id}/status`,
                    { status: 'published' },
                    { csrfToken: csrf }
                );
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertJson(res, { success: true });

                const anon = ctx.createClient(ctx.baseUrl);
                ctx.assert.assertStatus(await anon.get(`/post/${slug}`), 200);
            }
        },
        {
            id: 'T1-F8-06',
            tier: 1,
            feature: 'F8',
            milestone: 'm2',
            name: 'Delete Article via POST /admin/posts/{id}/delete (Form & AJAX)',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                // Form delete
                const title1 = `Delete Form ${ctx.uid}`;
                const slug1 = `delete-form-${ctx.uid.toLowerCase()}`;
                const { id: id1 } = await createArticleForm(ctx, client, { title: title1, slug: slug1, status: 'published' });

                const { csrf } = await getAdminCsrf(ctx, client, '/admin/posts');
                const del1 = await client.postForm(`/admin/posts/${id1}/delete`, { csrf_token: csrf });
                ctx.assert.assertRedirect(del1, /\/admin\/posts/);
                ctx.assert.assertNotIncludes(await client.get('/admin/posts'), title1);
                ctx.assert.assertStatus(await client.get(`/admin/posts/${id1}/edit`), 404);
                ctx.assert.assertStatus(await ctx.createClient(ctx.baseUrl).get(`/post/${slug1}`), 404);

                // AJAX delete
                const title2 = `Delete AJAX ${ctx.uid}`;
                const slug2 = `delete-ajax-${ctx.uid.toLowerCase()}`;
                const { id: id2 } = await createArticleForm(ctx, client, { title: title2, slug: slug2, status: 'published' });
                const del2 = await client.postAjax(`/admin/posts/${id2}/delete`, {}, { csrfToken: csrf });
                ctx.assert.assertStatus(del2, 200);
                ctx.assert.assertJson(del2, { success: true });
                ctx.assert.assertNotIncludes(await client.get('/admin/posts'), title2);
                ctx.assert.assertStatus(await ctx.createClient(ctx.baseUrl).get(`/post/${slug2}`), 404);
            }
        },

        // ============================================================
        // F9: Comment Listing & Filtering (M3 - 5 Tests)
        // ============================================================
        {
            id: 'T1-F9-01',
            tier: 1,
            feature: 'F9',
            milestone: 'm3',
            name: 'List All Comments at /admin/comments',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                for (const query of [undefined, { status: 'all' }]) {
                    const res = await client.get('/admin/comments', { query });
                    ctx.assert.assertStatus(res, 200);
                    ctx.assert.assertNoPhpErrors(res);
                    ctx.assert.assertIncludes(res, 'Budi Santoso');
                    ctx.assert.assertIncludes(res, 'budi@example.com');
                    ctx.assert.assertIncludes(res, 'Siti Rahma');
                    ctx.assert.assertIncludes(res, 'siti@example.com');
                    ctx.assert.assertIncludes(res, SEEDED_PUBLISHED_TITLE_1);
                    ctx.assert.assertMatch(res, /Disetujui|Menunggu/i);
                }
            }
        },
        {
            id: 'T1-F9-02',
            tier: 1,
            feature: 'F9',
            milestone: 'm3',
            name: 'Filter Pending / Hidden Comments (?status=pending)',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const res = await client.get('/admin/comments', { query: { status: 'pending' } });
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertIncludes(res, 'Siti Rahma');
                ctx.assert.assertIncludes(res, 'Andi Wijaya');
                ctx.assert.assertNotIncludes(res, 'Tulisan yang sangat membuka wawasan!');
            }
        },
        {
            id: 'T1-F9-03',
            tier: 1,
            feature: 'F9',
            milestone: 'm3',
            name: 'Filter Approved Comments (?status=approved)',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const res = await client.get('/admin/comments', { query: { status: 'approved' } });
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertIncludes(res, 'Budi Santoso');
                ctx.assert.assertIncludes(res, 'NeoBlog Assistant');
                ctx.assert.assertNotIncludes(res, 'Siti Rahma');
            }
        },
        {
            id: 'T1-F9-04',
            tier: 1,
            feature: 'F9',
            milestone: 'm3',
            name: 'Display Tab Counts & Reply Parent Indicator',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const res = await client.get('/admin/comments');
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                // Filter links with counts for all, pending, approved
                ctx.assert.assertMatch(res, /\/admin\/comments(?:\?status=all)?["'][^>]*>(?:(?!<\/a>)[\s\S])*\d+/i);
                ctx.assert.assertMatch(res, /\/admin\/comments\?status=pending["'][^>]*>(?:(?!<\/a>)[\s\S])*\d+/i);
                ctx.assert.assertMatch(res, /\/admin\/comments\?status=approved["'][^>]*>(?:(?!<\/a>)[\s\S])*\d+/i);
                // Seeded bot reply has parent_id = 1 (Budi Santoso)
                ctx.assert.assertMatch(res, /Balasan|Membalas|Budi Santoso|#1/i);
            }
        },
        {
            id: 'T1-F9-05',
            tier: 1,
            feature: 'F9',
            milestone: 'm3',
            name: 'Comment Author Email Visible to Admin Only (Not Leaked Publicly)',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const adminComments = await client.get('/admin/comments');
                ctx.assert.assertStatus(adminComments, 200);
                ctx.assert.assertIncludes(adminComments, 'budi@example.com');
                ctx.assert.assertIncludes(adminComments, 'bot@neoblog.local');

                const anon = ctx.createClient(ctx.baseUrl);
                const pubDetail = await anon.get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertStatus(pubDetail, 200);
                ctx.assert.assertIncludes(pubDetail, 'id="commentsList"');
                const commentsSection = extractCommentsListSection(pubDetail.text);
                ctx.assert.assertNotIncludes(commentsSection, 'budi@example.com');
                ctx.assert.assertNotIncludes(pubDetail, 'bot@neoblog.local');
            }
        },

        // ============================================================
        // F10: Comment Approval & Hiding (M3 - 5 Tests)
        // ============================================================
        {
            id: 'T1-F10-01',
            tier: 1,
            feature: 'F10',
            milestone: 'm3',
            name: 'Approve Pending Comment via Form POST',
            run: async (ctx) => {
                const marker = `SpamToApprove-${ctx.uid}`;
                const { res: subRes } = await submitPublicComment(ctx, SEEDED_PUBLISHED_SLUG_1, {
                    authorName: `Tester ${ctx.uid}`,
                    authorEmail: `t1f1001_${ctx.uid}@example.com`,
                    commentText: `Promo slot gacor ${marker}`
                });
                ctx.assert.assertStatusIn(subRes, [200, 201]);
                ctx.assert.assertJson(subRes, { success: true, is_approved: 0 });

                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const pendPage = await client.get('/admin/comments', { query: { status: 'pending' } });
                ctx.assert.assertStatus(pendPage, 200);
                const cid = extractCommentIdByMarker(pendPage.text, marker);
                ctx.assert.ok(cid, `Could not find pending comment ID for ${marker}`);

                const csrf = ctx.http.extractCsrfToken(pendPage.text);
                const appRes = await client.postForm(`/admin/comments/${cid}/approve`, { csrf_token: csrf });
                ctx.assert.assertRedirect(appRes, /\/admin\/comments/);

                ctx.assert.assertNotIncludes(await client.get('/admin/comments', { query: { status: 'pending' } }), marker);
                ctx.assert.assertIncludes(await client.get('/admin/comments', { query: { status: 'approved' } }), marker);

                const pubDetail = await ctx.createClient(ctx.baseUrl).get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertIncludes(pubDetail, marker);
            }
        },
        {
            id: 'T1-F10-02',
            tier: 1,
            feature: 'F10',
            milestone: 'm3',
            name: 'Hide Approved Comment via Form POST',
            run: async (ctx) => {
                const marker = `ApprovedToHide-${ctx.uid}`;
                const { res: subRes } = await submitPublicComment(ctx, SEEDED_PUBLISHED_SLUG_1, {
                    authorName: `Reader ${ctx.uid}`,
                    authorEmail: `t1f1002_${ctx.uid}@example.com`,
                    commentText: `Komentar bagus ${marker}`
                });
                ctx.assert.assertStatusIn(subRes, [200, 201]);
                const subData = ctx.assert.assertJson(subRes, { success: true, is_approved: 1 });
                const cid = subData.comment?.id;
                ctx.assert.ok(cid, 'Expected created comment ID');

                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/comments');
                const hideRes = await client.postForm(`/admin/comments/${cid}/hide`, { csrf_token: csrf });
                ctx.assert.assertRedirect(hideRes, /\/admin\/comments/);

                ctx.assert.assertNotIncludes(await client.get('/admin/comments', { query: { status: 'approved' } }), marker);
                ctx.assert.assertIncludes(await client.get('/admin/comments', { query: { status: 'pending' } }), marker);

                const pubDetail = await ctx.createClient(ctx.baseUrl).get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertNotIncludes(pubDetail, marker);
            }
        },
        {
            id: 'T1-F10-03',
            tier: 1,
            feature: 'F10',
            milestone: 'm3',
            name: 'Approve Pending Comment via AJAX JSON',
            run: async (ctx) => {
                const marker = `AjaxApprove-${ctx.uid}`;
                const { res: subRes } = await submitPublicComment(ctx, SEEDED_PUBLISHED_SLUG_1, {
                    authorName: `AjaxReader ${ctx.uid}`,
                    authorEmail: `t1f1003_${ctx.uid}@example.com`,
                    commentText: `Cek casino ${marker}`
                });
                ctx.assert.assertStatusIn(subRes, [200, 201]);
                const subData = ctx.assert.assertJson(subRes, { success: true, is_approved: 0 });
                const cid = subData.comment?.id;
                ctx.assert.ok(cid, 'Expected pending comment ID in JSON');

                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/comments');
                const appRes = await client.postAjax(`/admin/comments/${cid}/approve`, {}, { csrfToken: csrf });
                ctx.assert.assertStatus(appRes, 200);
                ctx.assert.assertNoPhpErrors(appRes);
                ctx.assert.assertJson(appRes, { success: true });

                const pubDetail = await ctx.createClient(ctx.baseUrl).get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertIncludes(pubDetail, marker);
            }
        },
        {
            id: 'T1-F10-04',
            tier: 1,
            feature: 'F10',
            milestone: 'm3',
            name: 'Hide Approved Comment via AJAX JSON',
            run: async (ctx) => {
                const marker = `AjaxHide-${ctx.uid}`;
                const { res: subRes } = await submitPublicComment(ctx, SEEDED_PUBLISHED_SLUG_1, {
                    authorName: `AjaxReader2 ${ctx.uid}`,
                    authorEmail: `t1f1004_${ctx.uid}@example.com`,
                    commentText: `Bersih ${marker}`
                });
                ctx.assert.assertStatusIn(subRes, [200, 201]);
                const cid = ctx.assert.assertJson(subRes, { success: true, is_approved: 1 }).comment?.id;
                ctx.assert.ok(cid);

                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/comments');
                const hideRes = await client.postAjax(`/admin/comments/${cid}/hide`, {}, { csrfToken: csrf });
                ctx.assert.assertStatus(hideRes, 200);
                ctx.assert.assertNoPhpErrors(hideRes);
                ctx.assert.assertJson(hideRes, { success: true });

                const pubDetail = await ctx.createClient(ctx.baseUrl).get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertNotIncludes(pubDetail, marker);
            }
        },
        {
            id: 'T1-F10-05',
            tier: 1,
            feature: 'F10',
            milestone: 'm3',
            name: 'Public Comment Counter Updates After Approve & Hide',
            run: async (ctx) => {
                const anon = ctx.createClient(ctx.baseUrl);
                const beforeDetail = await anon.get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                const beforeHome = await anon.get('/');
                const n0 = extractDiskusiCount(beforeDetail.text);
                const h0 = extractHomeCardCommentCount(beforeHome.text, SEEDED_PUBLISHED_SLUG_1);
                ctx.assert.ok(Number.isInteger(n0) && Number.isInteger(h0), 'Expected numeric baseline counters');

                const marker = `CounterSync-${ctx.uid}`;
                const { res: subRes } = await submitPublicComment(ctx, SEEDED_PUBLISHED_SLUG_1, {
                    authorName: `Counter ${ctx.uid}`,
                    authorEmail: `t1f1005_${ctx.uid}@example.com`,
                    commentText: `viagra promo ${marker}`
                });
                ctx.assert.assertStatusIn(subRes, [200, 201]);
                const cid = ctx.assert.assertJson(subRes, { success: true, is_approved: 0 }).comment?.id;
                ctx.assert.ok(cid);

                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/comments');

                await client.postAjax(`/admin/comments/${cid}/approve`, {}, { csrfToken: csrf });
                const afterApproveDetail = await anon.get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                const afterApproveHome = await anon.get('/');
                ctx.assert.strictEqual(extractDiskusiCount(afterApproveDetail.text), n0 + 1);
                ctx.assert.strictEqual(extractHomeCardCommentCount(afterApproveHome.text, SEEDED_PUBLISHED_SLUG_1), h0 + 1);

                await client.postAjax(`/admin/comments/${cid}/hide`, {}, { csrfToken: csrf });
                const afterHideDetail = await anon.get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                const afterHideHome = await anon.get('/');
                ctx.assert.strictEqual(extractDiskusiCount(afterHideDetail.text), n0);
                ctx.assert.strictEqual(extractHomeCardCommentCount(afterHideHome.text, SEEDED_PUBLISHED_SLUG_1), h0);
            }
        },

        // ============================================================
        // F11: Admin Comment Reply & Deletion (M3 - 5 Tests)
        // ============================================================
        {
            id: 'T1-F11-01',
            tier: 1,
            feature: 'F11',
            milestone: 'm3',
            name: 'Admin Reply via Form POST (POST /admin/comments/{id}/reply)',
            run: async (ctx) => {
                const parentMarker = `ParentForm-${ctx.uid}`;
                const { res: subRes } = await submitPublicComment(ctx, SEEDED_PUBLISHED_SLUG_1, {
                    authorName: `Pembaca ${ctx.uid}`,
                    authorEmail: `t1f1101_${ctx.uid}@example.com`,
                    commentText: parentMarker
                });
                ctx.assert.assertStatusIn(subRes, [200, 201]);
                const parentId = ctx.assert.assertJson(subRes, { success: true }).comment?.id;
                ctx.assert.ok(parentId);

                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/comments');
                const replyText = `Terima kasih atas masukannya ${ctx.uid}`;
                const replyRes = await client.postForm(`/admin/comments/${parentId}/reply`, {
                    csrf_token: csrf,
                    comment_text: replyText
                });
                ctx.assert.assertRedirect(replyRes, /\/admin\/comments/);

                const appList = await client.get('/admin/comments', { query: { status: 'approved' } });
                ctx.assert.assertStatus(appList, 200);
                ctx.assert.assertIncludes(appList, replyText);
                ctx.assert.assertIncludes(appList, 'Administrator NeoBlog');
            }
        },
        {
            id: 'T1-F11-02',
            tier: 1,
            feature: 'F11',
            milestone: 'm3',
            name: 'Admin Reply via AJAX JSON',
            run: async (ctx) => {
                const parentMarker = `ParentAjax-${ctx.uid}`;
                const { res: subRes } = await submitPublicComment(ctx, SEEDED_PUBLISHED_SLUG_1, {
                    authorName: `PembacaAjax ${ctx.uid}`,
                    authorEmail: `t1f1102_${ctx.uid}@example.com`,
                    commentText: parentMarker
                });
                ctx.assert.assertStatusIn(subRes, [200, 201]);
                const parentId = ctx.assert.assertJson(subRes, { success: true }).comment?.id;
                ctx.assert.ok(parentId);

                const { client } = await loginAs(ctx, 'editor', 'editor123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/comments');
                const replyText = `Balasan editor ${ctx.uid}`;
                const replyRes = await client.postAjax(
                    `/admin/comments/${parentId}/reply`,
                    { comment_text: replyText },
                    { csrfToken: csrf }
                );
                ctx.assert.assertStatusIn(replyRes, [200, 201]);
                ctx.assert.assertNoPhpErrors(replyRes);
                ctx.assert.assertJson(replyRes, (data) => {
                    ctx.assert.strictEqual(data.success, true);
                    const reply = data.reply || data.comment || {};
                    ctx.assert.ok(String(reply.comment_text || '').includes(replyText), 'Expected reply text in JSON');
                    ctx.assert.ok(
                        String(reply.author_name || '').includes('Editor NeoBlog') ||
                            String(reply.author_name || '').toLowerCase().includes('editor'),
                        'Expected reply attributed to editor user'
                    );
                });
            }
        },
        {
            id: 'T1-F11-03',
            tier: 1,
            feature: 'F11',
            milestone: 'm3',
            name: 'Admin Reply Appears Publicly With Admin/Editor Badge (Not Assistant)',
            run: async (ctx) => {
                const parentMarker = `ParentBadge-${ctx.uid}`;
                const { res: subRes } = await submitPublicComment(ctx, SEEDED_PUBLISHED_SLUG_1, {
                    authorName: `UserBadge ${ctx.uid}`,
                    authorEmail: `t1f1103_${ctx.uid}@example.com`,
                    commentText: parentMarker
                });
                const parentId = ctx.assert.assertJson(subRes, { success: true }).comment?.id;

                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/comments');
                const replyMarker = `AdminBadgeReply-${ctx.uid}`;
                const replyRes = await client.postAjax(
                    `/admin/comments/${parentId}/reply`,
                    { comment_text: replyMarker },
                    { csrfToken: csrf }
                );
                ctx.assert.assertStatusIn(replyRes, [200, 201]);

                const pub = await ctx.createClient(ctx.baseUrl).get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertStatus(pub, 200);
                const section = extractCommentsListSection(pub.text);
                const idxParent = section.indexOf(parentMarker);
                const idxReply = section.indexOf(replyMarker);
                ctx.assert.ok(idxParent !== -1 && idxReply !== -1 && idxReply > idxParent, 'Reply must appear after parent');
                const replyWindow = section.slice(Math.max(0, idxReply - 400), idxReply + replyMarker.length + 200);
                ctx.assert.assertMatch(replyWindow, /Admin|Editor/);
                ctx.assert.assertNotIncludes(replyWindow, '>Assistant<');
            }
        },
        {
            id: 'T1-F11-04',
            tier: 1,
            feature: 'F11',
            milestone: 'm3',
            name: 'Delete Single Leaf Comment via Form POST',
            run: async (ctx) => {
                const marker = `DelLeafForm-${ctx.uid}`;
                const { res: subRes } = await submitPublicComment(ctx, SEEDED_PUBLISHED_SLUG_1, {
                    authorName: `LeafForm ${ctx.uid}`,
                    authorEmail: `t1f1104_${ctx.uid}@example.com`,
                    commentText: marker
                });
                const cid = ctx.assert.assertJson(subRes, { success: true }).comment?.id;
                ctx.assert.ok(cid);

                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/comments');
                const delRes = await client.postForm(`/admin/comments/${cid}/delete`, { csrf_token: csrf });
                ctx.assert.assertRedirect(delRes, /\/admin\/comments/);

                ctx.assert.assertNotIncludes(await client.get('/admin/comments'), marker);
                ctx.assert.assertNotIncludes(await ctx.createClient(ctx.baseUrl).get(`/post/${SEEDED_PUBLISHED_SLUG_1}`), marker);
            }
        },
        {
            id: 'T1-F11-05',
            tier: 1,
            feature: 'F11',
            milestone: 'm3',
            name: 'Delete Comment via AJAX JSON',
            run: async (ctx) => {
                const marker = `DelLeafAjax-${ctx.uid}`;
                const { res: subRes } = await submitPublicComment(ctx, SEEDED_PUBLISHED_SLUG_1, {
                    authorName: `LeafAjax ${ctx.uid}`,
                    authorEmail: `t1f1105_${ctx.uid}@example.com`,
                    commentText: marker
                });
                const cid = ctx.assert.assertJson(subRes, { success: true }).comment?.id;
                ctx.assert.ok(cid);

                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/comments');
                const delRes = await client.postAjax(`/admin/comments/${cid}/delete`, {}, { csrfToken: csrf });
                ctx.assert.assertStatus(delRes, 200);
                ctx.assert.assertNoPhpErrors(delRes);
                ctx.assert.assertJson(delRes, { success: true });

                ctx.assert.assertNotIncludes(await client.get('/admin/comments'), marker);
                ctx.assert.assertNotIncludes(await ctx.createClient(ctx.baseUrl).get(`/post/${SEEDED_PUBLISHED_SLUG_1}`), marker);
            }
        },

        // ============================================================
        // F12: Public Comment Threading, API Status & Client JS (M3 - 6 Tests)
        // ============================================================
        {
            id: 'T1-F12-01',
            tier: 1,
            feature: 'F12',
            milestone: 'm3',
            name: 'Valid Public Comment Returns is_approved: 1, status: "approved"',
            run: async (ctx) => {
                const marker = `CleanPublic-${ctx.uid}`;
                const { res } = await submitPublicComment(ctx, SEEDED_PUBLISHED_SLUG_1, {
                    authorName: `PembacaValid ${ctx.uid}`,
                    authorEmail: `valid_${ctx.uid}@example.com`,
                    commentText: marker
                });
                ctx.assert.assertStatusIn(res, [200, 201]);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertJson(res, (data) => {
                    ctx.assert.strictEqual(data.success, true);
                    ctx.assert.strictEqual(data.is_approved, 1);
                    ctx.assert.strictEqual(data.status, 'approved');
                    ctx.assert.ok(data.comment && data.comment.id, 'Expected comment object');
                });

                const detail = await ctx.createClient(ctx.baseUrl).get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertIncludes(detail, marker);
            }
        },
        {
            id: 'T1-F12-02',
            tier: 1,
            feature: 'F12',
            milestone: 'm3',
            name: 'Public Spam Keyword Comment Returns is_approved: 0, status: "pending"',
            run: async (ctx) => {
                const anon = ctx.createClient(ctx.baseUrl);
                const before = await anon.get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                const beforeCount = extractDiskusiCount(before.text);
                ctx.assert.ok(Number.isInteger(beforeCount), 'Expected numeric Diskusi Komunitas count before comment');

                const marker = `SpamSlot-${ctx.uid}`;
                const { res } = await submitPublicComment(ctx, SEEDED_PUBLISHED_SLUG_1, {
                    authorName: `Spammer ${ctx.uid}`,
                    authorEmail: `spam_${ctx.uid}@example.com`,
                    commentText: `Promo slot gacor ${marker}`
                });
                ctx.assert.assertStatusIn(res, [200, 201]);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertJson(res, (data) => {
                    ctx.assert.strictEqual(data.success, true);
                    ctx.assert.strictEqual(data.is_approved, 0);
                    ctx.assert.strictEqual(data.status, 'pending');
                });

                const after = await anon.get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertNotIncludes(after, marker);
                ctx.assert.strictEqual(extractDiskusiCount(after.text), beforeCount);
            }
        },
        {
            id: 'T1-F12-03',
            tier: 1,
            feature: 'F12',
            milestone: 'm3',
            name: 'Threaded Public Rendering Groups Child Replies Under Parent',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const slug = `thread-order-${ctx.uid.toLowerCase()}`;
                await createArticleForm(ctx, client, {
                    title: `Thread Order ${ctx.uid}`,
                    slug,
                    status: 'published'
                });

                const rootAMarker = `RootA-${ctx.uid}`;
                const rootBMarker = `RootB-${ctx.uid}`;
                const replyA1Marker = `ReplyA1-${ctx.uid}`;

                const resA = await submitPublicComment(ctx, slug, {
                    authorName: `UserA ${ctx.uid}`,
                    authorEmail: `ua_${ctx.uid}@example.com`,
                    commentText: rootAMarker
                });
                const rootAId = ctx.assert.assertJson(resA.res, { success: true }).comment?.id;
                ctx.assert.ok(rootAId);

                await submitPublicComment(ctx, slug, {
                    authorName: `UserB ${ctx.uid}`,
                    authorEmail: `ub_${ctx.uid}@example.com`,
                    commentText: rootBMarker
                });

                const { csrf } = await getAdminCsrf(ctx, client, '/admin/comments');
                const repRes = await client.postAjax(
                    `/admin/comments/${rootAId}/reply`,
                    { comment_text: replyA1Marker },
                    { csrfToken: csrf }
                );
                ctx.assert.assertStatusIn(repRes, [200, 201]);

                const pub = await ctx.createClient(ctx.baseUrl).get(`/post/${slug}`);
                ctx.assert.assertStatus(pub, 200);
                const section = extractCommentsListSection(pub.text);
                const idxA = section.indexOf(rootAMarker);
                const idxA1 = section.indexOf(replyA1Marker);
                const idxB = section.indexOf(rootBMarker);
                ctx.assert.ok(idxA !== -1 && idxA1 !== -1 && idxB !== -1, 'All 3 thread comments must render');
                ctx.assert.ok(
                    idxA < idxA1 && idxA1 < idxB,
                    `Expected nested order RootA (${idxA}) < ReplyA1 (${idxA1}) < RootB (${idxB})`
                );
            }
        },
        {
            id: 'T1-F12-04',
            tier: 1,
            feature: 'F12',
            milestone: 'm3',
            name: 'Public Thread Distinguishes Bot (Assistant) vs Admin (Admin/Editor) Replies',
            run: async (ctx) => {
                const parentMarker = `CoexistParent-${ctx.uid}`;
                const { res: subRes } = await submitPublicComment(ctx, SEEDED_PUBLISHED_SLUG_1, {
                    authorName: `CoexistUser ${ctx.uid}`,
                    authorEmail: `coexist_${ctx.uid}@example.com`,
                    commentText: parentMarker
                });
                const parentId = ctx.assert.assertJson(subRes, { success: true }).comment?.id;

                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/comments');
                const adminReplyMarker = `CoexistAdminReply-${ctx.uid}`;
                const repRes = await client.postAjax(
                    `/admin/comments/${parentId}/reply`,
                    { comment_text: adminReplyMarker },
                    { csrfToken: csrf }
                );
                ctx.assert.assertStatusIn(repRes, [200, 201]);

                const pub = await ctx.createClient(ctx.baseUrl).get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertStatus(pub, 200);
                const section = extractCommentsListSection(pub.text);
                const botIdx = section.indexOf('NeoBlog Assistant');
                ctx.assert.ok(botIdx !== -1, 'Seeded NeoBlog Assistant reply should be present');
                const botWindow = section.slice(botIdx, botIdx + 300);
                ctx.assert.assertIncludes(botWindow, 'Assistant');

                const admIdx = section.indexOf(adminReplyMarker);
                ctx.assert.ok(admIdx !== -1, 'Admin reply should be present');
                const admWindow = section.slice(Math.max(0, admIdx - 400), admIdx + 200);
                ctx.assert.assertMatch(admWindow, /Admin|Editor/);
            }
        },
        {
            id: 'T1-F12-05',
            tier: 1,
            feature: 'F12',
            milestone: 'm3',
            name: 'Multiline Public Comment Preserves Line Breaks Safely',
            run: async (ctx) => {
                const l1 = `Baris1-${ctx.uid}`;
                const l2 = `Baris2-${ctx.uid}`;
                const { res } = await submitPublicComment(ctx, SEEDED_PUBLISHED_SLUG_1, {
                    authorName: `MultiLine ${ctx.uid}`,
                    authorEmail: `ml_${ctx.uid}@example.com`,
                    commentText: `${l1}\n${l2}`
                });
                ctx.assert.assertStatusIn(res, [200, 201]);
                ctx.assert.assertJson(res, { success: true, is_approved: 1 });

                const detail = await ctx.createClient(ctx.baseUrl).get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertStatus(detail, 200);
                ctx.assert.assertMatch(
                    detail,
                    new RegExp(`${escapeRegExp(l1)}\\s*<br\\s*\\/?>\\s*${escapeRegExp(l2)}`, 'i')
                );
            }
        },
        {
            id: 'T1-F12-06',
            tier: 1,
            feature: 'F12',
            milestone: 'm3',
            name: 'Native JS Runner Tests Real Production public/assets/js/utils.js',
            run: async (ctx) => {
                const { stdout } = await execFileAsync(process.execPath, ['tests/js/runner.js'], {
                    cwd: ctx.rootDir,
                    windowsHide: true
                });
                ctx.assert.ok(stdout.length > 0, 'Expected output from tests/js/runner.js');

                const anon = ctx.createClient(ctx.baseUrl);
                const detail = await anon.get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertStatus(detail, 200);
                const utilsIdx = detail.text.indexOf('/assets/js/utils.js');
                const commentsIdx = detail.text.indexOf('/assets/js/comments.js');
                ctx.assert.ok(utilsIdx !== -1, 'Expected /assets/js/utils.js script include');
                ctx.assert.ok(commentsIdx !== -1, 'Expected /assets/js/comments.js script include');
                ctx.assert.ok(utilsIdx < commentsIdx, 'utils.js must load before comments.js');

                const jsRes = await anon.get('/assets/js/comments.js');
                ctx.assert.assertStatus(jsRes, 200);
                ctx.assert.assertMatch(jsRes, /is_approved|status/);
            }
        }
    ];
}
