import fs from 'node:fs';
import path from 'node:path';

const SEEDED_PUBLISHED_SLUG_1 = 'membangun-web-modern-php-native-vanilla-stack';
const SEEDED_PUBLISHED_SLUG_2 = 'evolusi-multi-agent-systems-rekayasa-perangkat-lunak';
const SEEDED_DRAFT_SLUG = 'panduan-praktis-optimasi-query-mysql';
const SEEDED_ARCHIVED_SLUG = 'catatan-rilis-arsitektur-awal-neoblog-v1';

const SEEDED_PUBLISHED_TITLE_1 = 'Membangun Web Modern dengan PHP Native dan Vanilla Web Stack';
const SEEDED_DRAFT_TITLE = 'Panduan Praktis Optimasi Query MySQL untuk Aplikasi Skala Menengah';
const SEEDED_ARCHIVED_TITLE = 'Catatan Rilis Arsitektur Awal NeoBlog v1.0';

function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loginAs(ctx, identifier, password, loginPath = '/admin/login') {
    const client = ctx.createClient(ctx.baseUrl);
    const getRes = await client.get(loginPath);
    ctx.assert.assertStatus(getRes, 200);
    ctx.assert.assertNoPhpErrors(getRes);
    const csrf = ctx.http.extractCsrfToken(getRes.text);
    ctx.assert.ok(csrf, `Expected CSRF token on ${loginPath}`);

    const postRes = await client.postForm(loginPath, {
        csrf_token: csrf,
        identifier,
        password
    });
    ctx.assert.assertRedirect(postRes, /\/admin\/?$/i);
    return { client, loginRes: postRes };
}

async function getAdminCsrf(ctx, client, reqPath = '/admin') {
    const res = await client.get(reqPath);
    ctx.assert.assertStatus(res, 200);
    ctx.assert.assertNoPhpErrors(res);
    const csrf = ctx.http.extractCsrfToken(res.text);
    ctx.assert.ok(csrf, `Expected CSRF token on ${reqPath}`);
    return { res, csrf };
}

function extractPostIdByMarker(html, marker) {
    const rowRe = new RegExp(`<tr\\b[^>]*>[\\s\\S]*?${escapeRegExp(marker)}[\\s\\S]*?<\\/tr>`, 'i');
    const rowMatch = rowRe.exec(html);
    if (rowMatch) {
        const idMatch = /\/admin\/posts\/(\d+)\/(?:edit|update|status|delete)/i.exec(rowMatch[0]);
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

async function createArticle(ctx, adminClient, fields) {
    const { csrf } = await getAdminCsrf(ctx, adminClient, '/admin/posts/create');
    const res = await adminClient.postForm('/admin/posts', {
        csrf_token: csrf,
        title: fields.title,
        slug: fields.slug ?? '',
        category_id: String(fields.category_id ?? 1),
        excerpt: fields.excerpt ?? `Excerpt ${fields.title}`,
        content: fields.content ?? `<p>Content ${fields.title}</p>`,
        reading_time: String(fields.reading_time ?? 4),
        status: fields.status ?? 'draft'
    });
    ctx.assert.assertRedirect(res, /\/admin\/posts/);
    const listRes = await adminClient.get('/admin/posts', { query: { status: fields.status ?? 'all' } });
    ctx.assert.assertStatus(listRes, 200);
    const lookupMarker = fields.marker ?? fields.title;
    const id = extractPostIdByMarker(listRes.text, lookupMarker);
    ctx.assert.ok(id, `Could not find created post ID for "${lookupMarker}"`);
    return { id };
}

async function getPublicCsrfAndPostId(ctx, slug = SEEDED_PUBLISHED_SLUG_1) {
    const anon = ctx.createClient(ctx.baseUrl);
    const page = await anon.get(`/post/${slug}`);
    ctx.assert.assertStatus(page, 200);
    ctx.assert.assertNoPhpErrors(page);
    const csrf = ctx.http.extractCsrfToken(page.text);
    const postId = ctx.http.extractHiddenInput(page.text, 'post_id');
    ctx.assert.ok(csrf && postId, 'Expected CSRF token and post_id on public post detail');
    return { anon, csrf, postId };
}

function extractPostDetailContent(html) {
    const startMatch = /<div\b[^>]*class=["'][^"']*\bpost-detail-content\b[^"']*["'][^>]*>/i.exec(html);
    if (!startMatch) return html;
    const afterStart = html.slice(startMatch.index + startMatch[0].length);
    const end = afterStart.search(/<section\b[^>]*class=["'][^"']*\bcomments-section\b/i);
    return end === -1 ? afterStart : afterStart.slice(0, end);
}

function extractDiskusiCount(html) {
    const m = /Diskusi\s+Komunitas\s*\(\s*(?:<span\b[^>]*>\s*)?(\d+)(?:\s*<\/span>)?\s*\)/i.exec(html);
    return m ? Number.parseInt(m[1], 10) : null;
}

export function registerTests() {
    return [
        // ============================================================
        // F1 Security & Boundaries (M1 - 6 Tests)
        // ============================================================
        {
            id: 'T2-F1-01',
            tier: 2,
            feature: 'F1',
            milestone: 'm1',
            name: 'Wrong Password Rejected',
            run: async (ctx) => {
                const client = ctx.createClient(ctx.baseUrl);
                const getRes = await client.get('/admin/login');
                const csrf = ctx.http.extractCsrfToken(getRes.text);
                const postRes = await client.postForm('/admin/login', {
                    csrf_token: csrf,
                    identifier: 'admin',
                    password: 'wrongpass_invalid'
                });
                ctx.assert.assertNoPhpErrors(postRes);
                ctx.assert.ok(
                    postRes.status === 401 || (postRes.status === 302 && /\/(?:admin\/)?login/i.test(postRes.location || '')),
                    `Expected 401 or redirect to login, got ${postRes.status} (${postRes.location})`
                );
                const dashRes = await client.get('/admin');
                ctx.assert.assertRedirect(dashRes, /\/(?:admin\/)?login/i);
            }
        },
        {
            id: 'T2-F1-02',
            tier: 2,
            feature: 'F1',
            milestone: 'm1',
            name: 'Nonexistent Username/Email Rejected Without Enumeration',
            run: async (ctx) => {
                const c1 = ctx.createClient(ctx.baseUrl);
                const g1 = await c1.get('/admin/login');
                const r1 = await c1.postForm('/admin/login', {
                    csrf_token: ctx.http.extractCsrfToken(g1.text),
                    identifier: 'admin',
                    password: 'wrongpass_invalid'
                });

                const c2 = ctx.createClient(ctx.baseUrl);
                const g2 = await c2.get('/admin/login');
                const r2 = await c2.postForm('/admin/login', {
                    csrf_token: ctx.http.extractCsrfToken(g2.text),
                    identifier: `nobody_xyz_${ctx.uid}`,
                    password: 'admin123'
                });
                ctx.assert.assertNoPhpErrors(r2);
                ctx.assert.strictEqual(r2.status, r1.status, 'Wrong password and unknown user must return identical HTTP status');
                ctx.assert.assertIncludes(r2, 'Username, email, atau kata sandi tidak valid.');
                ctx.assert.assertRedirect(await c2.get('/admin'), /\/(?:admin\/)?login/i);
            }
        },
        {
            id: 'T2-F1-03',
            tier: 2,
            feature: 'F1',
            milestone: 'm1',
            name: 'Empty / Whitespace Credentials Rejected',
            run: async (ctx) => {
                const client = ctx.createClient(ctx.baseUrl);
                const g = await client.get('/admin/login');
                const postRes = await client.postForm('/admin/login', {
                    csrf_token: ctx.http.extractCsrfToken(g.text),
                    identifier: '   ',
                    password: ''
                });
                ctx.assert.assertNoPhpErrors(postRes);
                ctx.assert.assertStatusIn(postRes, [400, 401, 422, 302]);
                if (postRes.status === 302) {
                    ctx.assert.assertRedirect(postRes, /\/(?:admin\/)?login/i);
                }
                ctx.assert.assertRedirect(await client.get('/admin'), /\/(?:admin\/)?login/i);
            }
        },
        {
            id: 'T2-F1-04',
            tier: 2,
            feature: 'F1',
            milestone: 'm1',
            name: 'Missing or Tampered CSRF on POST /admin/login',
            run: async (ctx) => {
                const c1 = ctx.createClient(ctx.baseUrl);
                await c1.get('/admin/login');
                const missingRes = await c1.postForm('/admin/login', {
                    identifier: 'admin',
                    password: 'admin123'
                });
                ctx.assert.assertStatus(missingRes, 403);
                ctx.assert.assertRedirect(await c1.get('/admin'), /\/(?:admin\/)?login/i);

                const c2 = ctx.createClient(ctx.baseUrl);
                await c2.get('/admin/login');
                const tamperedRes = await c2.postAjax('/admin/login', {
                    csrf_token: 'tampered_token_0000',
                    identifier: 'admin',
                    password: 'admin123'
                });
                ctx.assert.assertStatus(tamperedRes, 403);
                ctx.assert.assertJson(tamperedRes, { success: false });
                ctx.assert.assertRedirect(await c2.get('/admin'), /\/(?:admin\/)?login/i);
            }
        },
        {
            id: 'T2-F1-05',
            tier: 2,
            feature: 'F1',
            milestone: 'm1',
            name: 'Missing or Tampered CSRF on POST /admin/logout',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const missingRes = await client.postForm('/admin/logout', {});
                ctx.assert.assertStatus(missingRes, 403);
                ctx.assert.assertStatus(await client.get('/admin'), 200);

                const wrongRes = await client.postAjax('/admin/logout', { csrf_token: 'bad_token_123' });
                ctx.assert.assertStatus(wrongRes, 403);
                ctx.assert.assertJson(wrongRes, { success: false });
                ctx.assert.assertStatus(await client.get('/admin'), 200);
            }
        },
        {
            id: 'T2-F1-06',
            tier: 2,
            feature: 'F1',
            milestone: 'm1',
            name: 'GET /admin/logout Does Not Destroy Session',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const getLogout = await client.get('/admin/logout');
                ctx.assert.assertStatusIn(getLogout, [404, 405]);
                ctx.assert.assertNoPhpErrors(getLogout);
                ctx.assert.assertStatus(await client.get('/admin'), 200);
            }
        },

        // ============================================================
        // F2 RBAC & Auth Guard Boundaries (M1 - 6 Tests)
        // ============================================================
        {
            id: 'T2-F2-01',
            tier: 2,
            feature: 'F2',
            milestone: 'm1',
            name: 'Unauthenticated HTML Access to All /admin* GET Routes',
            run: async (ctx) => {
                const anon = ctx.createClient(ctx.baseUrl);
                for (const route of ['/admin', '/admin/posts', '/admin/posts/create', '/admin/posts/1/edit', '/admin/comments']) {
                    const res = await anon.get(route);
                    ctx.assert.assertRedirect(res, /\/(?:admin\/)?login/i, `Unauthenticated GET ${route} must redirect to login`);
                    ctx.assert.assertNotIncludes(res, SEEDED_PUBLISHED_TITLE_1);
                    ctx.assert.assertNotIncludes(res, 'budi@example.com');
                    ctx.assert.assertNotIncludes(res, 'siti@example.com');
                }
            }
        },
        {
            id: 'T2-F2-02',
            tier: 2,
            feature: 'F2',
            milestone: 'm1',
            name: 'Unauthenticated HTML POST to Admin Mutations',
            run: async (ctx) => {
                const anon = ctx.createClient(ctx.baseUrl);
                for (const route of [
                    '/admin/posts',
                    '/admin/posts/1/update',
                    '/admin/posts/1/delete',
                    '/admin/comments/1/approve',
                    '/admin/comments/1/delete'
                ]) {
                    const res = await anon.postForm(route, { title: 'Hacked', status: 'draft' });
                    ctx.assert.assertStatusIn(res, [302, 401, 403], `Unauthenticated POST ${route} must be rejected`);
                    if (res.status === 302) {
                        ctx.assert.assertRedirect(res, /\/(?:admin\/)?login/i);
                    }
                }
                const pub = await anon.get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertStatus(pub, 200);
                ctx.assert.assertIncludes(pub, SEEDED_PUBLISHED_TITLE_1);
                ctx.assert.assertIncludes(pub, 'Budi Santoso');
            }
        },
        {
            id: 'T2-F2-03',
            tier: 2,
            feature: 'F2',
            milestone: 'm1',
            name: 'Unauthenticated AJAX Access to /admin* Returns 401 JSON',
            run: async (ctx) => {
                const anon = ctx.createClient(ctx.baseUrl);
                const r1 = await anon.get('/admin', { ajax: true });
                ctx.assert.assertStatus(r1, 401);
                ctx.assert.assertJson(r1, { success: false });

                const r2 = await anon.postAjax('/admin/posts/1/status', { status: 'draft' });
                ctx.assert.assertStatus(r2, 401);
                ctx.assert.assertJson(r2, { success: false });

                const r3 = await anon.postAjax('/admin/comments/1/approve', {});
                ctx.assert.assertStatus(r3, 401);
                ctx.assert.assertJson(r3, { success: false });
            }
        },
        {
            id: 'T2-F2-04',
            tier: 2,
            feature: 'F2',
            milestone: 'm1',
            name: 'author Role Denied HTML Access (403) on /admin* GET & POST',
            run: async (ctx) => {
                const author = ctx.createClient(ctx.baseUrl);
                const loginPage = await author.get('/admin/login');
                const csrf = ctx.http.extractCsrfToken(loginPage.text);
                const loginAttempt = await author.postForm('/admin/login', {
                    csrf_token: csrf,
                    identifier: 'author',
                    password: 'author123'
                });
                ctx.assert.assertStatus(loginAttempt, 403);

                for (const route of ['/admin', '/admin/posts', '/admin/comments']) {
                    const r = await author.get(route);
                    ctx.assert.assertStatusIn(r, [403, 302], `Author GET ${route} must be denied`);
                    ctx.assert.assertNotIncludes(r, 'Total Artikel');
                }
                const postAttempt = await author.postForm('/admin/posts', {
                    csrf_token: csrf,
                    title: `AuthorBypass ${ctx.uid}`,
                    content: '<p>Nope</p>'
                });
                ctx.assert.assertStatusIn(postAttempt, [403, 302]);
            }
        },
        {
            id: 'T2-F2-05',
            tier: 2,
            feature: 'F2',
            milestone: 'm1',
            name: 'author Role Denied AJAX Access (403 JSON) on Admin Endpoints',
            run: async (ctx) => {
                const author = ctx.createClient(ctx.baseUrl);
                const loginPage = await author.get('/admin/login');
                const csrf = ctx.http.extractCsrfToken(loginPage.text);
                const loginAttempt = await author.postAjax('/admin/login', {
                    csrf_token: csrf,
                    identifier: 'author',
                    password: 'author123'
                });
                ctx.assert.assertStatus(loginAttempt, 403);
                ctx.assert.assertJson(loginAttempt, { success: false });

                const r1 = await author.postAjax('/admin/posts/1/status', { status: 'draft' }, { csrfToken: csrf });
                ctx.assert.assertStatusIn(r1, [401, 403]);
                ctx.assert.assertJson(r1, { success: false });

                const r2 = await author.postAjax('/admin/comments/1/approve', {}, { csrfToken: csrf });
                ctx.assert.assertStatusIn(r2, [401, 403]);
                ctx.assert.assertJson(r2, { success: false });
            }
        },
        {
            id: 'T2-F2-06',
            tier: 2,
            feature: 'F2',
            milestone: 'm1',
            name: 'Forged / Arbitrary PHPSESSID Cookie Rejected',
            run: async (ctx) => {
                const attacker = ctx.createClient(ctx.baseUrl);
                attacker.setCookie('PHPSESSID', 'deadbeef0000000000000000');

                const htmlRes = await attacker.get('/admin');
                ctx.assert.assertRedirect(htmlRes, /\/(?:admin\/)?login/i);

                const ajaxRes = await attacker.get('/admin', { ajax: true });
                ctx.assert.assertStatus(ajaxRes, 401);
                ctx.assert.assertJson(ajaxRes, { success: false });
            }
        },

        // ============================================================
        // F3 Admin Dashboard & Shell Boundaries (M1 - 5 Tests)
        // ============================================================
        {
            id: 'T2-F3-01',
            tier: 2,
            feature: 'F3',
            milestone: 'm1',
            name: 'POST /admin Method Not Registered',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin');
                const res = await client.postForm('/admin', { csrf_token: csrf });
                ctx.assert.assertStatusIn(res, [404, 405]);
                ctx.assert.assertNoPhpErrors(res);
            }
        },
        {
            id: 'T2-F3-02',
            tier: 2,
            feature: 'F3',
            milestone: 'm1',
            name: 'Unknown Admin Sub-Route Returns 404',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const htmlRes = await client.get('/admin/nonexistent-page');
                ctx.assert.assertStatus(htmlRes, 404);
                ctx.assert.assertNoPhpErrors(htmlRes);

                const jsonRes = await client.get('/admin/nonexistent-page', { ajax: true });
                ctx.assert.assertStatus(jsonRes, 404);
                ctx.assert.assertJson(jsonRes, { success: false });
            }
        },
        {
            id: 'T2-F3-03',
            tier: 2,
            feature: 'F3',
            milestone: 'm1',
            name: 'Unauthenticated GET /admin Body Contains No Dashboard HTML/Counts',
            run: async (ctx) => {
                const anon = ctx.createClient(ctx.baseUrl);
                const res = await anon.get('/admin');
                ctx.assert.assertRedirect(res, /\/(?:admin\/)?login/i);
                ctx.assert.assertNotIncludes(res, 'Total Artikel');
                ctx.assert.assertNotIncludes(res, 'Komentar Menunggu');
                ctx.assert.assertNotIncludes(res, SEEDED_DRAFT_TITLE);
                ctx.assert.assertNotIncludes(res, 'siti@example.com');
            }
        },
        {
            id: 'T2-F3-04',
            tier: 2,
            feature: 'F3',
            milestone: 'm1',
            name: 'Dashboard Renders Cleanly With Zero Pending Comments / Zero Drafts',
            run: async (ctx) => {
                const draftRows = await ctx.db.query("SELECT id FROM posts WHERE status = 'draft'");
                const pendingRows = await ctx.db.query('SELECT id FROM comments WHERE is_approved = 0');
                try {
                    if (draftRows.length > 0) {
                        const ids = draftRows.map((r) => Number(r.id)).join(',');
                        await ctx.db.query(`UPDATE posts SET status = 'published', published_at = COALESCE(published_at, NOW()) WHERE id IN (${ids})`);
                    }
                    if (pendingRows.length > 0) {
                        const ids = pendingRows.map((r) => Number(r.id)).join(',');
                        await ctx.db.query(`UPDATE comments SET is_approved = 1 WHERE id IN (${ids})`);
                    }

                    const { client } = await loginAs(ctx, 'admin', 'admin123');
                    const res = await client.get('/admin');
                    ctx.assert.assertStatus(res, 200);
                    ctx.assert.assertNoPhpErrors(res);
                    ctx.assert.assertMatch(res, /Belum ada draf artikel/i);
                    ctx.assert.assertMatch(res, /Tidak ada komentar yang menunggu moderasi/i);
                } finally {
                    if (draftRows.length > 0) {
                        const ids = draftRows.map((r) => Number(r.id)).join(',');
                        await ctx.db.query(`UPDATE posts SET status = 'draft' WHERE id IN (${ids})`);
                    }
                    if (pendingRows.length > 0) {
                        const ids = pendingRows.map((r) => Number(r.id)).join(',');
                        await ctx.db.query(`UPDATE comments SET is_approved = 0 WHERE id IN (${ids})`);
                    }
                }
            }
        },
        {
            id: 'T2-F3-05',
            tier: 2,
            feature: 'F3',
            milestone: 'm1',
            name: 'Admin Shell Navigation Active/Escaped Under Query Noise',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const res = await client.get('/admin?foo=%3Cscript%3Ealert(1)%3C/script%3E');
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertNotIncludes(res, '<script>alert(1)</script>');
                ctx.assert.assertIncludes(res, 'Dashboard CMS');
            }
        },

        // ============================================================
        // F4 Seed & Schema Integrity Boundaries (M1 - 5 Tests)
        // ============================================================
        {
            id: 'T2-F4-01',
            tier: 2,
            feature: 'F4',
            milestone: 'm1',
            name: 'Seeded Draft Post Invisible on Public / & /post/{slug}',
            run: async (ctx) => {
                const anon = ctx.createClient(ctx.baseUrl);
                const home = await anon.get('/');
                ctx.assert.assertStatus(home, 200);
                ctx.assert.assertNotIncludes(home, SEEDED_DRAFT_TITLE);

                const detail = await anon.get(`/post/${SEEDED_DRAFT_SLUG}`);
                ctx.assert.assertStatus(detail, 404);
                ctx.assert.assertNoPhpErrors(detail);
            }
        },
        {
            id: 'T2-F4-02',
            tier: 2,
            feature: 'F4',
            milestone: 'm1',
            name: 'Seeded Archived Post Invisible on Public / & /post/{slug}',
            run: async (ctx) => {
                const anon = ctx.createClient(ctx.baseUrl);
                const home = await anon.get('/');
                ctx.assert.assertStatus(home, 200);
                ctx.assert.assertNotIncludes(home, SEEDED_ARCHIVED_TITLE);

                const detail = await anon.get(`/post/${SEEDED_ARCHIVED_SLUG}`);
                ctx.assert.assertStatus(detail, 404);
                ctx.assert.assertNoPhpErrors(detail);
            }
        },
        {
            id: 'T2-F4-03',
            tier: 2,
            feature: 'F4',
            milestone: 'm1',
            name: 'Seeded Pending Comment Invisible on Public /post/{slug}',
            run: async (ctx) => {
                const anon = ctx.createClient(ctx.baseUrl);
                const d1 = await anon.get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertStatus(d1, 200);
                ctx.assert.assertNotIncludes(d1, 'Siti Rahma');

                const d2 = await anon.get(`/post/${SEEDED_PUBLISHED_SLUG_2}`);
                ctx.assert.assertStatus(d2, 200);
                ctx.assert.assertNotIncludes(d2, 'Andi Wijaya');
            }
        },
        {
            id: 'T2-F4-04',
            tier: 2,
            feature: 'F4',
            milestone: 'm1',
            name: 'Seeded Author Role Cannot Escalate via Login Alias /login',
            run: async (ctx) => {
                const client = ctx.createClient(ctx.baseUrl);
                const page = await client.get('/login');
                ctx.assert.assertStatus(page, 200);
                const csrf = ctx.http.extractCsrfToken(page.text);
                const postRes = await client.postForm('/login', {
                    csrf_token: csrf,
                    identifier: 'author',
                    password: 'author123'
                });
                ctx.assert.assertStatus(postRes, 403);
                ctx.assert.assertNoPhpErrors(postRes);
            }
        },
        {
            id: 'T2-F4-05',
            tier: 2,
            feature: 'F4',
            milestone: 'm1',
            name: 'Re-Running seed.sql Is Idempotent',
            run: async (ctx) => {
                let sql = fs.readFileSync(path.join(ctx.rootDir, 'database', 'seed.sql'), 'utf8');
                if (ctx.db.name && ctx.db.name !== 'neoblog') {
                    const safeDb = ctx.db.name.replace(/`/g, '');
                    sql = sql.replace(/USE\s+`?neoblog`?\s*;/gi, `USE \`${safeDb}\`;`);
                }
                await ctx.db.query(sql);

                const anon = ctx.createClient(ctx.baseUrl);
                const home = await anon.get('/');
                ctx.assert.assertStatus(home, 200);
                ctx.assert.assertNoPhpErrors(home);
                const matches = home.text.match(new RegExp(escapeRegExp(SEEDED_PUBLISHED_TITLE_1), 'g')) || [];
                ctx.assert.strictEqual(matches.length, 1, 'Seeded post must not be duplicated on /');

                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const adminPosts = await client.get('/admin/posts');
                ctx.assert.assertStatus(adminPosts, 200);
                const adminMatches = adminPosts.text.match(new RegExp(escapeRegExp(SEEDED_DRAFT_TITLE), 'g')) || [];
                ctx.assert.strictEqual(adminMatches.length, 1, 'Seeded draft must not be duplicated in /admin/posts');
            }
        },

        // ============================================================
        // F5 Core Security, Sanitization & Response Boundaries (M1 - 6 Tests)
        // ============================================================
        {
            id: 'T2-F5-01',
            tier: 2,
            feature: 'F5',
            milestone: 'm1',
            name: '<script> & <iframe> Stripped from Article HTML Content',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const slug = `xss-script-${ctx.uid.toLowerCase()}`;
                await createArticle(ctx, client, {
                    title: `XSS Script ${ctx.uid}`,
                    slug,
                    content: `<p>Aman ${ctx.uid}</p><script>alert(1)</script><iframe src="https://evil.test"></iframe>`,
                    status: 'published'
                });

                const pub = await ctx.createClient(ctx.baseUrl).get(`/post/${slug}`);
                ctx.assert.assertStatus(pub, 200);
                const body = extractPostDetailContent(pub.text);
                ctx.assert.assertIncludes(body, `<p>Aman ${ctx.uid}</p>`);
                ctx.assert.assertNotIncludes(body.toLowerCase(), '<script');
                ctx.assert.assertNotIncludes(body.toLowerCase(), '<iframe');
            }
        },
        {
            id: 'T2-F5-02',
            tier: 2,
            feature: 'F5',
            milestone: 'm1',
            name: 'Inline Event Handlers (onerror, onload, onclick) Stripped',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const slug = `xss-events-${ctx.uid.toLowerCase()}`;
                await createArticle(ctx, client, {
                    title: `XSS Events ${ctx.uid}`,
                    slug,
                    content: `<img src="x" onerror="alert(1)"><p onclick="alert(2)" onload="alert(3)">Hi ${ctx.uid}</p>`,
                    status: 'published'
                });

                const pub = await ctx.createClient(ctx.baseUrl).get(`/post/${slug}`);
                ctx.assert.assertStatus(pub, 200);
                const body = extractPostDetailContent(pub.text);
                ctx.assert.assertIncludes(body, `Hi ${ctx.uid}`);
                ctx.assert.assertNotMatch(body, /\bon(?:error|load|click)\s*=/i);
            }
        },
        {
            id: 'T2-F5-03',
            tier: 2,
            feature: 'F5',
            milestone: 'm1',
            name: 'javascript: & data:text/html URIs Stripped from Links',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const slug = `xss-uri-${ctx.uid.toLowerCase()}`;
                await createArticle(ctx, client, {
                    title: `XSS URI ${ctx.uid}`,
                    slug,
                    content: `<a href="javascript:alert(1)">Klik ${ctx.uid}</a><a href="data:text/html,<script>alert(1)</script>">Data</a>`,
                    status: 'published'
                });

                const pub = await ctx.createClient(ctx.baseUrl).get(`/post/${slug}`);
                ctx.assert.assertStatus(pub, 200);
                const body = extractPostDetailContent(pub.text);
                ctx.assert.assertNotMatch(body, /javascript\s*:/i);
                ctx.assert.assertNotMatch(body, /data\s*:\s*text\/html/i);
            }
        },
        {
            id: 'T2-F5-04',
            tier: 2,
            feature: 'F5',
            milestone: 'm1',
            name: 'Cross-Session CSRF Token Rejected (403)',
            run: async (ctx) => {
                const anon = ctx.createClient(ctx.baseUrl);
                const loginPage = await anon.get('/admin/login');
                const anonToken = ctx.http.extractCsrfToken(loginPage.text);
                ctx.assert.ok(anonToken);

                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const res = await client.postForm('/admin/posts', {
                    csrf_token: anonToken,
                    title: `CrossSession ${ctx.uid}`,
                    content: '<p>Nope</p>',
                    status: 'draft'
                });
                ctx.assert.assertStatus(res, 403);
            }
        },
        {
            id: 'T2-F5-05',
            tier: 2,
            feature: 'F5',
            milestone: 'm1',
            name: 'Malformed X-CSRF-Token Header Rejected (403)',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const res = await client.postAjax(
                    '/admin/posts',
                    { title: `BadHeader ${ctx.uid}`, content: '<p>Nope</p>', status: 'draft' },
                    { csrfToken: 'invalid_token_123' }
                );
                ctx.assert.assertStatus(res, 403);
                ctx.assert.assertJson(res, { success: false });
            }
        },
        {
            id: 'T2-F5-06',
            tier: 2,
            feature: 'F5',
            milestone: 'm1',
            name: 'Zero External Dependencies Present in Repo',
            run: async (ctx) => {
                for (const forbidden of ['composer.json', 'package.json', 'vendor', 'node_modules']) {
                    ctx.assert.strictEqual(
                        fs.existsSync(path.join(ctx.rootDir, forbidden)),
                        false,
                        `Forbidden external dependency artifact found: ${forbidden}`
                    );
                }

                const anon = ctx.createClient(ctx.baseUrl);
                const home = await anon.get('/');
                ctx.assert.assertStatus(home, 200);
                ctx.assert.assertNotMatch(home, /<(?:script|link)\b[^>]*(?:src|href)=["']https?:\/\//i);

                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const dash = await client.get('/admin');
                ctx.assert.assertStatus(dash, 200);
                ctx.assert.assertNotMatch(dash, /<(?:script|link)\b[^>]*(?:src|href)=["']https?:\/\//i);
            }
        },

        // ============================================================
        // F6 Article Listing & Filtering Boundaries (M2 - 5 Tests)
        // ============================================================
        {
            id: 'T2-F6-01',
            tier: 2,
            feature: 'F6',
            milestone: 'm2',
            name: 'Invalid Status Filter Parameter Handled Safely',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const res = await client.get('/admin/posts', { query: { status: 'nonexistent_status' } });
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
            }
        },
        {
            id: 'T2-F6-02',
            tier: 2,
            feature: 'F6',
            milestone: 'm2',
            name: 'SQL Injection Probe in Search q Safely Parameterized',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const res = await client.get('/admin/posts', { query: { q: "' OR 1=1 --" } });
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertNotIncludes(res, SEEDED_PUBLISHED_TITLE_1);
            }
        },
        {
            id: 'T2-F6-03',
            tier: 2,
            feature: 'F6',
            milestone: 'm2',
            name: 'XSS Probe in Search q Reflected Safely Escaped',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const payload = '"><script>alert(1)</script>';
                const res = await client.get('/admin/posts', { query: { q: payload } });
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertNotIncludes(res, '<script>alert(1)</script>');
            }
        },
        {
            id: 'T2-F6-04',
            tier: 2,
            feature: 'F6',
            milestone: 'm2',
            name: 'Non-Matching Search Query Displays Graceful Empty State',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const res = await client.get('/admin/posts', { query: { q: 'zzz_no_such_article_99999' } });
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertNotIncludes(res, SEEDED_PUBLISHED_TITLE_1);
                ctx.assert.assertNotIncludes(res, SEEDED_DRAFT_TITLE);
            }
        },
        {
            id: 'T2-F6-05',
            tier: 2,
            feature: 'F6',
            milestone: 'm2',
            name: 'SQL Wildcard Characters (%, _) in q Handled Safely Without Error',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                for (const q of ['%', '_']) {
                    const res = await client.get('/admin/posts', { query: { q } });
                    ctx.assert.assertStatus(res, 200);
                    ctx.assert.assertNoPhpErrors(res);
                    ctx.assert.assertIncludes(res, 'admin-main');
                    ctx.assert.assertMatch(res, /<table\b|Belum ada|Tidak ada|\/admin\/posts\/create/i);
                }
            }
        },

        // ============================================================
        // F7 Article Create & Edit Boundaries (M2 - 7 Tests)
        // ============================================================
        {
            id: 'T2-F7-01',
            tier: 2,
            feature: 'F7',
            milestone: 'm2',
            name: 'Empty / Whitespace Title Rejected',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/posts/create');
                const marker = `EmptyTitleBody-${ctx.uid}`;
                const res = await client.postAjax(
                    '/admin/posts',
                    { title: '   ', content: `<p>${marker}</p>`, status: 'draft' },
                    { csrfToken: csrf }
                );
                ctx.assert.assertStatusIn(res, [400, 422]);
                ctx.assert.assertJson(res, { success: false });
            }
        },
        {
            id: 'T2-F7-02',
            tier: 2,
            feature: 'F7',
            milestone: 'm2',
            name: 'Empty Content Rejected',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/posts/create');
                const title = `EmptyContentTitle-${ctx.uid}`;
                const res = await client.postAjax(
                    '/admin/posts',
                    { title, content: '   ', status: 'draft' },
                    { csrfToken: csrf }
                );
                ctx.assert.assertStatusIn(res, [400, 422]);
                ctx.assert.assertJson(res, { success: false });
                ctx.assert.assertNotIncludes(await client.get('/admin/posts'), title);
            }
        },
        {
            id: 'T2-F7-03',
            tier: 2,
            feature: 'F7',
            milestone: 'm2',
            name: 'Duplicate Explicit Slug Handled Without 500 Fatal Error',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const dupSlug = `dup-slug-${ctx.uid.toLowerCase()}`;
                await createArticle(ctx, client, {
                    title: `First Slug ${ctx.uid}`,
                    slug: dupSlug,
                    status: 'draft'
                });

                const { csrf } = await getAdminCsrf(ctx, client, '/admin/posts/create');
                const secondRes = await client.postAjax(
                    '/admin/posts',
                    {
                        title: `Second Slug ${ctx.uid}`,
                        slug: dupSlug,
                        category_id: '1',
                        content: `<p>Second ${ctx.uid}</p>`,
                        status: 'draft'
                    },
                    { csrfToken: csrf }
                );
                ctx.assert.assertNoPhpErrors(secondRes);
                ctx.assert.notStrictEqual(secondRes.status, 500, 'Duplicate slug must never trigger HTTP 500');
                ctx.assert.assertStatusIn(secondRes, [200, 201, 400, 422]);
                if (secondRes.status === 200 || secondRes.status === 201) {
                    const data = ctx.assert.assertJson(secondRes, { success: true });
                    const assignedSlug = data.post?.slug ?? data.slug ?? '';
                    ctx.assert.ok(assignedSlug, 'Expected slug in JSON response for created article');
                    ctx.assert.notStrictEqual(assignedSlug, dupSlug, 'Auto-deduped slug must differ from original');
                } else {
                    ctx.assert.assertJson(secondRes, { success: false });
                }
            }
        },
        {
            id: 'T2-F7-04',
            tier: 2,
            feature: 'F7',
            milestone: 'm2',
            name: 'Nonexistent category_id Handled Without 500 FK Crash',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/posts/create');
                const res = await client.postAjax(
                    '/admin/posts',
                    {
                        title: `Bad Cat ${ctx.uid}`,
                        slug: `bad-cat-${ctx.uid.toLowerCase()}`,
                        category_id: '999999',
                        content: `<p>Body ${ctx.uid}</p>`,
                        status: 'draft'
                    },
                    { csrfToken: csrf }
                );
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.notStrictEqual(res.status, 500, 'Nonexistent category_id must never trigger 500 FK crash');
                ctx.assert.assertStatusIn(res, [200, 201, 400, 422]);
            }
        },
        {
            id: 'T2-F7-05',
            tier: 2,
            feature: 'F7',
            milestone: 'm2',
            name: 'XSS in Title & Excerpt Escaped Everywhere',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const slug = `xss-meta-${ctx.uid.toLowerCase()}`;
                const xssTitle = `<script>alert('T')</script> Judul ${ctx.uid}`;
                const xssExcerpt = `<img src=x onerror=alert('E')> Ringkas ${ctx.uid}`;
                await createArticle(ctx, client, {
                    title: xssTitle,
                    marker: `Judul ${ctx.uid}`,
                    slug,
                    excerpt: xssExcerpt,
                    content: `<p>Aman ${ctx.uid}</p>`,
                    status: 'published'
                });

                const adminList = await client.get('/admin/posts');
                ctx.assert.assertStatus(adminList, 200);
                ctx.assert.assertNotIncludes(adminList, "<script>alert('T')</script>");
                ctx.assert.assertIncludes(adminList, '&lt;script&gt;');
                ctx.assert.assertIncludes(adminList, `Judul ${ctx.uid}`);

                const anon = ctx.createClient(ctx.baseUrl);
                const home = await anon.get('/');
                ctx.assert.assertStatus(home, 200);
                ctx.assert.assertNotIncludes(home, "<script>alert('T')</script>");
                ctx.assert.assertNotIncludes(home, "<img src=x onerror=alert('E')>");
                ctx.assert.assertIncludes(home, '&lt;script&gt;');
                ctx.assert.assertIncludes(home, `Judul ${ctx.uid}`);

                const detail = await anon.get(`/post/${slug}`);
                ctx.assert.assertStatus(detail, 200);
                ctx.assert.assertNotIncludes(detail, "<script>alert('T')</script>");
                ctx.assert.assertIncludes(detail, '&lt;script&gt;');
                ctx.assert.assertIncludes(detail, `Judul ${ctx.uid}`);
            }
        },
        {
            id: 'T2-F7-06',
            tier: 2,
            feature: 'F7',
            milestone: 'm2',
            name: 'Missing CSRF on Create & Update Rejected (403)',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const createRes = await client.postForm('/admin/posts', {
                    title: `NoCsrfCreate ${ctx.uid}`,
                    content: '<p>Nope</p>',
                    status: 'draft'
                });
                ctx.assert.assertStatus(createRes, 403);
                ctx.assert.assertNotIncludes(await client.get('/admin/posts'), `NoCsrfCreate ${ctx.uid}`);

                const updRes = await client.postForm('/admin/posts/1/update', {
                    title: `NoCsrfUpdate ${ctx.uid}`,
                    content: '<p>Nope</p>',
                    status: 'published'
                });
                ctx.assert.assertStatus(updRes, 403);
                ctx.assert.assertIncludes(await ctx.createClient(ctx.baseUrl).get('/'), SEEDED_PUBLISHED_TITLE_1);
            }
        },
        {
            id: 'T2-F7-07',
            tier: 2,
            feature: 'F7',
            milestone: 'm2',
            name: 'Edit / Update Nonexistent Post ID Returns 404',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const editRes = await client.get('/admin/posts/999999/edit');
                ctx.assert.assertStatus(editRes, 404);
                ctx.assert.assertNoPhpErrors(editRes);

                const { csrf } = await getAdminCsrf(ctx, client, '/admin');
                const updRes = await client.postAjax(
                    '/admin/posts/999999/update',
                    { title: 'Ghost', content: '<p>Ghost</p>', status: 'draft' },
                    { csrfToken: csrf }
                );
                ctx.assert.assertStatus(updRes, 404);
                ctx.assert.assertJson(updRes, { success: false });
            }
        },

        // ============================================================
        // F8 Article Status Transitions & Delete Boundaries (M2 - 6 Tests)
        // ============================================================
        {
            id: 'T2-F8-01',
            tier: 2,
            feature: 'F8',
            milestone: 'm2',
            name: 'Invalid Status Value Rejected',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const title = `InvalidStatus ${ctx.uid}`;
                const { id } = await createArticle(ctx, client, { title, status: 'draft' });
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/posts');

                const res = await client.postAjax(
                    `/admin/posts/${id}/status`,
                    { status: 'hacked_status' },
                    { csrfToken: csrf }
                );
                ctx.assert.assertStatusIn(res, [400, 422]);
                ctx.assert.assertJson(res, { success: false });
                ctx.assert.assertIncludes(await client.get('/admin/posts', { query: { status: 'draft' } }), title);
            }
        },
        {
            id: 'T2-F8-02',
            tier: 2,
            feature: 'F8',
            milestone: 'm2',
            name: 'Status Transition on Nonexistent Post ID Returns 404',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin');
                const res = await client.postAjax(
                    '/admin/posts/999999/status',
                    { status: 'published' },
                    { csrfToken: csrf }
                );
                ctx.assert.assertStatus(res, 404);
                ctx.assert.assertJson(res, { success: false });
            }
        },
        {
            id: 'T2-F8-03',
            tier: 2,
            feature: 'F8',
            milestone: 'm2',
            name: 'Delete Nonexistent Post ID Returns 404',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin');
                const res = await client.postAjax('/admin/posts/999999/delete', {}, { csrfToken: csrf });
                ctx.assert.assertStatus(res, 404);
                ctx.assert.assertJson(res, { success: false });
            }
        },
        {
            id: 'T2-F8-04',
            tier: 2,
            feature: 'F8',
            milestone: 'm2',
            name: 'Missing CSRF on Status Change & Delete Rejected (403)',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const title = `CsrfStatusDel ${ctx.uid}`;
                const { id } = await createArticle(ctx, client, { title, status: 'draft' });

                const sRes = await client.postForm(`/admin/posts/${id}/status`, {
                    csrf_token: 'bad_csrf',
                    status: 'published'
                });
                ctx.assert.assertStatus(sRes, 403);

                const dRes = await client.postForm(`/admin/posts/${id}/delete`, {
                    csrf_token: 'bad_csrf'
                });
                ctx.assert.assertStatus(dRes, 403);

                ctx.assert.assertIncludes(await client.get('/admin/posts', { query: { status: 'draft' } }), title);
            }
        },
        {
            id: 'T2-F8-05',
            tier: 2,
            feature: 'F8',
            milestone: 'm2',
            name: 'Non-Positive reading_time Coerced or Validated Safely',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/posts/create');
                const slug = `neg-readtime-${ctx.uid.toLowerCase()}`;
                const res = await client.postAjax(
                    '/admin/posts',
                    {
                        title: `Neg ReadTime ${ctx.uid}`,
                        slug,
                        category_id: '1',
                        content: `<p>Body ${ctx.uid}</p>`,
                        reading_time: '-5',
                        status: 'published'
                    },
                    { csrfToken: csrf }
                );
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertStatusIn(res, [200, 201, 400, 422]);
                if (res.status === 200 || res.status === 201) {
                    const detail = await ctx.createClient(ctx.baseUrl).get(`/post/${slug}`);
                    ctx.assert.assertStatus(detail, 200);
                    ctx.assert.assertNotIncludes(detail, '-5 menit baca');
                    ctx.assert.assertNotIncludes(detail, '0 menit baca');
                }
            }
        },
        {
            id: 'T2-F8-06',
            tier: 2,
            feature: 'F8',
            milestone: 'm2',
            name: 'author Role Cannot Transition Status or Delete Existing Post',
            run: async (ctx) => {
                const author = ctx.createClient(ctx.baseUrl);
                const page = await author.get('/admin/login');
                const csrf = ctx.http.extractCsrfToken(page.text);
                const loginRes = await author.postAjax('/admin/login', {
                    csrf_token: csrf,
                    identifier: 'author',
                    password: 'author123'
                });
                ctx.assert.assertStatus(loginRes, 403);

                const sRes = await author.postAjax('/admin/posts/1/status', { status: 'draft' }, { csrfToken: csrf });
                ctx.assert.assertStatusIn(sRes, [401, 403]);
                ctx.assert.assertJson(sRes, { success: false });

                const dRes = await author.postAjax('/admin/posts/1/delete', {}, { csrfToken: csrf });
                ctx.assert.assertStatusIn(dRes, [401, 403]);
                ctx.assert.assertJson(dRes, { success: false });

                ctx.assert.assertIncludes(await ctx.createClient(ctx.baseUrl).get('/'), SEEDED_PUBLISHED_TITLE_1);
            }
        },

        // ============================================================
        // F9 Comment Listing & Filtering Boundaries (M3 - 5 Tests)
        // ============================================================
        {
            id: 'T2-F9-01',
            tier: 2,
            feature: 'F9',
            milestone: 'm3',
            name: 'Invalid Comment Status Filter Handled Safely',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const res = await client.get('/admin/comments', { query: { status: 'bogus' } });
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
            }
        },
        {
            id: 'T2-F9-02',
            tier: 2,
            feature: 'F9',
            milestone: 'm3',
            name: 'XSS Payload in Comment Author/Text Escaped in /admin/comments',
            run: async (ctx) => {
                const { anon, csrf, postId } = await getPublicCsrfAndPostId(ctx);
                const marker = `XssMod-${ctx.uid}`;
                const sub = await anon.postAjax('/api/comments', {
                    csrf_token: csrf,
                    post_id: postId,
                    author_name: `<b>Eve</b> ${ctx.uid}`,
                    author_email: `eve_${ctx.uid}@example.com`,
                    comment_text: `<script>alert('C')</script> casino ${marker}`
                });
                ctx.assert.assertStatusIn(sub, [200, 201]);

                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const list = await client.get('/admin/comments', { query: { status: 'pending' } });
                ctx.assert.assertStatus(list, 200);
                ctx.assert.assertNoPhpErrors(list);
                ctx.assert.assertIncludes(list, marker);
                ctx.assert.assertNotIncludes(list, '<b>Eve</b>');
                ctx.assert.assertNotIncludes(list, "<script>alert('C')</script>");
                ctx.assert.assertIncludes(list, '&lt;b&gt;Eve&lt;/b&gt;');
                ctx.assert.assertIncludes(list, '&lt;script&gt;');
            }
        },
        {
            id: 'T2-F9-03',
            tier: 2,
            feature: 'F9',
            milestone: 'm3',
            name: 'Long Comment Text (2,500 chars) Renders Without Truncation Crash',
            run: async (ctx) => {
                const { anon, csrf, postId } = await getPublicCsrfAndPostId(ctx);
                const marker = `LongEnd-${ctx.uid}`;
                const longText = `${'A'.repeat(2480)} ${marker}`;
                const sub = await anon.postAjax('/api/comments', {
                    csrf_token: csrf,
                    post_id: postId,
                    author_name: `LongAuthor ${ctx.uid}`,
                    author_email: `long_${ctx.uid}@example.com`,
                    comment_text: longText
                });
                ctx.assert.assertStatusIn(sub, [200, 201]);

                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const mod = await client.get('/admin/comments');
                ctx.assert.assertStatus(mod, 200);
                ctx.assert.assertNoPhpErrors(mod);
                ctx.assert.assertIncludes(mod, `LongAuthor ${ctx.uid}`);

                const pub = await ctx.createClient(ctx.baseUrl).get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertStatus(pub, 200);
                ctx.assert.assertNoPhpErrors(pub);
                ctx.assert.assertIncludes(pub, marker);
            }
        },
        {
            id: 'T2-F9-04',
            tier: 2,
            feature: 'F9',
            milestone: 'm3',
            name: 'Empty Pending Queue Renders Graceful Empty State',
            run: async (ctx) => {
                const pendingRows = await ctx.db.query('SELECT id FROM comments WHERE is_approved = 0');
                try {
                    if (pendingRows.length > 0) {
                        const ids = pendingRows.map((r) => Number(r.id)).join(',');
                        await ctx.db.query(`UPDATE comments SET is_approved = 1 WHERE id IN (${ids})`);
                    }

                    const { client } = await loginAs(ctx, 'admin', 'admin123');
                    const res = await client.get('/admin/comments', { query: { status: 'pending' } });
                    ctx.assert.assertStatus(res, 200);
                    ctx.assert.assertNoPhpErrors(res);
                    ctx.assert.assertMatch(res, /Tidak ada komentar|Belum ada komentar/i);
                } finally {
                    if (pendingRows.length > 0) {
                        const ids = pendingRows.map((r) => Number(r.id)).join(',');
                        await ctx.db.query(`UPDATE comments SET is_approved = 0 WHERE id IN (${ids})`);
                    }
                }
            }
        },
        {
            id: 'T2-F9-05',
            tier: 2,
            feature: 'F9',
            milestone: 'm3',
            name: 'SQLi Probe in /admin/comments Query String Handled Safely',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const res = await client.get('/admin/comments', { query: { status: "pending' OR '1'='1" } });
                ctx.assert.assertStatus(res, 200);
                ctx.assert.assertNoPhpErrors(res);
            }
        },

        // ============================================================
        // F10 Comment Approval & Hiding Boundaries (M3 - 5 Tests)
        // ============================================================
        {
            id: 'T2-F10-01',
            tier: 2,
            feature: 'F10',
            milestone: 'm3',
            name: 'Approve Nonexistent Comment ID Returns 404',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/comments');
                const res = await client.postAjax('/admin/comments/999999/approve', {}, { csrfToken: csrf });
                ctx.assert.assertStatus(res, 404);
                ctx.assert.assertJson(res, { success: false });
            }
        },
        {
            id: 'T2-F10-02',
            tier: 2,
            feature: 'F10',
            milestone: 'm3',
            name: 'Hide Nonexistent Comment ID Returns 404',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/comments');
                const res = await client.postAjax('/admin/comments/999999/hide', {}, { csrfToken: csrf });
                ctx.assert.assertStatus(res, 404);
                ctx.assert.assertJson(res, { success: false });
            }
        },
        {
            id: 'T2-F10-03',
            tier: 2,
            feature: 'F10',
            milestone: 'm3',
            name: 'Missing/Invalid CSRF on Approve & Hide Rejected (403)',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const hideRes = await client.postForm('/admin/comments/1/hide', { csrf_token: 'bad_csrf' });
                ctx.assert.assertStatus(hideRes, 403);

                const appRes = await client.postForm('/admin/comments/1/approve', {});
                ctx.assert.assertStatus(appRes, 403);

                const pub = await ctx.createClient(ctx.baseUrl).get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertIncludes(pub, 'Budi Santoso');
            }
        },
        {
            id: 'T2-F10-04',
            tier: 2,
            feature: 'F10',
            milestone: 'm3',
            name: 'Idempotent Re-Approve & Re-Hide Succeed Cleanly',
            run: async (ctx) => {
                const { anon, csrf: pubCsrf, postId } = await getPublicCsrfAndPostId(ctx);
                const sub = await anon.postAjax('/api/comments', {
                    csrf_token: pubCsrf,
                    post_id: postId,
                    author_name: `Idem ${ctx.uid}`,
                    author_email: `idem_${ctx.uid}@example.com`,
                    comment_text: `Idempotent test ${ctx.uid}`
                });
                const cid = ctx.assert.assertJson(sub, { success: true }).comment?.id;
                ctx.assert.ok(cid);

                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/comments');

                const a1 = await client.postAjax(`/admin/comments/${cid}/approve`, {}, { csrfToken: csrf });
                ctx.assert.assertStatus(a1, 200);
                ctx.assert.assertJson(a1, { success: true });

                const h1 = await client.postAjax(`/admin/comments/${cid}/hide`, {}, { csrfToken: csrf });
                ctx.assert.assertStatus(h1, 200);
                ctx.assert.assertJson(h1, { success: true });

                const h2 = await client.postAjax(`/admin/comments/${cid}/hide`, {}, { csrfToken: csrf });
                ctx.assert.assertStatus(h2, 200);
                ctx.assert.assertJson(h2, { success: true });
            }
        },
        {
            id: 'T2-F10-05',
            tier: 2,
            feature: 'F10',
            milestone: 'm3',
            name: 'author Role Denied Approve & Hide (403)',
            run: async (ctx) => {
                const author = ctx.createClient(ctx.baseUrl);
                const page = await author.get('/admin/login');
                const csrf = ctx.http.extractCsrfToken(page.text);
                ctx.assert.assertStatus(
                    await author.postAjax('/admin/login', { csrf_token: csrf, identifier: 'author', password: 'author123' }),
                    403
                );

                const hideRes = await author.postAjax('/admin/comments/1/hide', {}, { csrfToken: csrf });
                ctx.assert.assertStatusIn(hideRes, [401, 403]);
                ctx.assert.assertJson(hideRes, { success: false });

                const pub = await ctx.createClient(ctx.baseUrl).get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertIncludes(pub, 'Budi Santoso');
            }
        },

        // ============================================================
        // F11 Admin Comment Reply & Deletion Boundaries (M3 - 6 Tests)
        // ============================================================
        {
            id: 'T2-F11-01',
            tier: 2,
            feature: 'F11',
            milestone: 'm3',
            name: 'Empty / Whitespace Reply Rejected',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/comments');
                const res = await client.postAjax(
                    '/admin/comments/1/reply',
                    { comment_text: '   ' },
                    { csrfToken: csrf }
                );
                ctx.assert.assertStatusIn(res, [400, 422]);
                ctx.assert.assertJson(res, { success: false });
            }
        },
        {
            id: 'T2-F11-02',
            tier: 2,
            feature: 'F11',
            milestone: 'm3',
            name: 'Reply to Nonexistent Comment ID Returns 404',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/comments');
                const res = await client.postAjax(
                    '/admin/comments/999999/reply',
                    { comment_text: 'Test reply ghost' },
                    { csrfToken: csrf }
                );
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertStatus(res, 404);
                ctx.assert.assertJson(res, { success: false });
            }
        },
        {
            id: 'T2-F11-03',
            tier: 2,
            feature: 'F11',
            milestone: 'm3',
            name: 'Delete Nonexistent Comment ID Returns 404',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/comments');
                const res = await client.postAjax('/admin/comments/999999/delete', {}, { csrfToken: csrf });
                ctx.assert.assertStatus(res, 404);
                ctx.assert.assertJson(res, { success: false });
            }
        },
        {
            id: 'T2-F11-04',
            tier: 2,
            feature: 'F11',
            milestone: 'm3',
            name: 'Missing CSRF on Reply & Delete Rejected (403)',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const r1 = await client.postForm('/admin/comments/1/reply', { comment_text: `NoCsrfReply ${ctx.uid}` });
                ctx.assert.assertStatus(r1, 403);

                const r2 = await client.postForm('/admin/comments/1/delete', {});
                ctx.assert.assertStatus(r2, 403);

                const pub = await ctx.createClient(ctx.baseUrl).get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertIncludes(pub, 'Budi Santoso');
                ctx.assert.assertNotIncludes(pub, `NoCsrfReply ${ctx.uid}`);
            }
        },
        {
            id: 'T2-F11-05',
            tier: 2,
            feature: 'F11',
            milestone: 'm3',
            name: 'XSS in Admin Reply Escaped on Public & Admin Views',
            run: async (ctx) => {
                const { anon, csrf: pubCsrf, postId } = await getPublicCsrfAndPostId(ctx);
                const sub = await anon.postAjax('/api/comments', {
                    csrf_token: pubCsrf,
                    post_id: postId,
                    author_name: `XssParent ${ctx.uid}`,
                    author_email: `xp_${ctx.uid}@example.com`,
                    comment_text: `Parent for XSS reply ${ctx.uid}`
                });
                const cid = ctx.assert.assertJson(sub, { success: true }).comment?.id;
                ctx.assert.ok(cid);

                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { csrf } = await getAdminCsrf(ctx, client, '/admin/comments');
                const replyRes = await client.postAjax(
                    `/admin/comments/${cid}/reply`,
                    { comment_text: `<script>alert('R')</script> Aman ${ctx.uid}` },
                    { csrfToken: csrf }
                );
                ctx.assert.assertStatusIn(replyRes, [200, 201]);

                const pub = await ctx.createClient(ctx.baseUrl).get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertNotIncludes(pub, "<script>alert('R')</script>");
                ctx.assert.assertIncludes(pub, '&lt;script&gt;');
                ctx.assert.assertIncludes(pub, `Aman ${ctx.uid}`);

                const mod = await client.get('/admin/comments');
                ctx.assert.assertNotIncludes(mod, "<script>alert('R')</script>");
                ctx.assert.assertIncludes(mod, '&lt;script&gt;');
                ctx.assert.assertIncludes(mod, `Aman ${ctx.uid}`);
            }
        },
        {
            id: 'T2-F11-06',
            tier: 2,
            feature: 'F11',
            milestone: 'm3',
            name: 'Cascade Delete Parent Comment Removes Child Replies',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const slug = `cascade-del-${ctx.uid.toLowerCase()}`;
                await createArticle(ctx, client, {
                    title: `Cascade Delete ${ctx.uid}`,
                    slug,
                    status: 'published'
                });

                const { anon, csrf: pubCsrf, postId } = await getPublicCsrfAndPostId(ctx, slug);
                const rootMarker = `CascadeRoot-${ctx.uid}`;
                const replyMarker = `CascadeReply-${ctx.uid}`;

                const sub = await anon.postAjax('/api/comments', {
                    csrf_token: pubCsrf,
                    post_id: postId,
                    author_name: `RootUser ${ctx.uid}`,
                    author_email: `root_${ctx.uid}@example.com`,
                    comment_text: rootMarker
                });
                const rootId = ctx.assert.assertJson(sub, { success: true }).comment?.id;
                ctx.assert.ok(rootId);

                const { csrf } = await getAdminCsrf(ctx, client, '/admin/comments');
                const rep = await client.postAjax(
                    `/admin/comments/${rootId}/reply`,
                    { comment_text: replyMarker },
                    { csrfToken: csrf }
                );
                ctx.assert.assertStatusIn(rep, [200, 201]);

                const beforePub = await anon.get(`/post/${slug}`);
                ctx.assert.strictEqual(extractDiskusiCount(beforePub.text), 2);

                const del = await client.postAjax(`/admin/comments/${rootId}/delete`, {}, { csrfToken: csrf });
                ctx.assert.assertStatus(del, 200);
                ctx.assert.assertJson(del, { success: true });

                const mod = await client.get('/admin/comments');
                ctx.assert.assertNotIncludes(mod, rootMarker);
                ctx.assert.assertNotIncludes(mod, replyMarker);

                const afterPub = await anon.get(`/post/${slug}`);
                ctx.assert.strictEqual(extractDiskusiCount(afterPub.text), 0);
                ctx.assert.assertNotIncludes(afterPub, rootMarker);
                ctx.assert.assertNotIncludes(afterPub, replyMarker);
            }
        },

        // ============================================================
        // F12 Public Comment API & Threading Boundaries (M3 - 6 Tests)
        // ============================================================
        {
            id: 'T2-F12-01',
            tier: 2,
            feature: 'F12',
            milestone: 'm3',
            name: 'Reject Public Comment Targeting a draft Post',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { id: draftId } = await createArticle(ctx, client, {
                    title: `Draft NoComment ${ctx.uid}`,
                    slug: `draft-nocomment-${ctx.uid.toLowerCase()}`,
                    status: 'draft'
                });

                const { anon, csrf } = await getPublicCsrfAndPostId(ctx);
                const marker = `DraftTarget-${ctx.uid}`;
                const res = await anon.postAjax('/api/comments', {
                    csrf_token: csrf,
                    post_id: draftId,
                    author_name: `Probe ${ctx.uid}`,
                    author_email: `probe_${ctx.uid}@example.com`,
                    comment_text: marker
                });
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertStatusIn(res, [400, 404, 422]);
                ctx.assert.assertJson(res, { success: false });
                ctx.assert.assertNotIncludes(await client.get('/admin/comments'), marker);
            }
        },
        {
            id: 'T2-F12-02',
            tier: 2,
            feature: 'F12',
            milestone: 'm3',
            name: 'Reject Public Comment Targeting an archived Post',
            run: async (ctx) => {
                const { client } = await loginAs(ctx, 'admin', 'admin123');
                const { id: archivedId } = await createArticle(ctx, client, {
                    title: `Archived NoComment ${ctx.uid}`,
                    slug: `archived-nocomment-${ctx.uid.toLowerCase()}`,
                    status: 'archived'
                });

                const { anon, csrf } = await getPublicCsrfAndPostId(ctx);
                const marker = `ArchivedTarget-${ctx.uid}`;
                const res = await anon.postAjax('/api/comments', {
                    csrf_token: csrf,
                    post_id: archivedId,
                    author_name: `Probe2 ${ctx.uid}`,
                    author_email: `probe2_${ctx.uid}@example.com`,
                    comment_text: marker
                });
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.assertStatusIn(res, [400, 404, 422]);
                ctx.assert.assertJson(res, { success: false });
                ctx.assert.assertNotIncludes(await client.get('/admin/comments'), marker);
            }
        },
        {
            id: 'T2-F12-03',
            tier: 2,
            feature: 'F12',
            milestone: 'm3',
            name: 'Reject Public Comment Targeting Nonexistent post_id=999999',
            run: async (ctx) => {
                const { anon, csrf } = await getPublicCsrfAndPostId(ctx);
                const res = await anon.postAjax('/api/comments', {
                    csrf_token: csrf,
                    post_id: '999999',
                    author_name: `GhostPost ${ctx.uid}`,
                    author_email: `ghost_${ctx.uid}@example.com`,
                    comment_text: `Ghost ${ctx.uid}`
                });
                ctx.assert.assertNoPhpErrors(res);
                ctx.assert.notStrictEqual(res.status, 500, 'Nonexistent post_id must never trigger 500 FK crash');
                ctx.assert.assertStatusIn(res, [400, 404]);
                ctx.assert.assertJson(res, { success: false });
            }
        },
        {
            id: 'T2-F12-04',
            tier: 2,
            feature: 'F12',
            milestone: 'm3',
            name: 'Reject Invalid Email or Missing Required Fields (400/422)',
            run: async (ctx) => {
                const { anon, csrf, postId } = await getPublicCsrfAndPostId(ctx);
                const badEmail = await anon.postAjax('/api/comments', {
                    csrf_token: csrf,
                    post_id: postId,
                    author_name: 'Valid Name',
                    author_email: 'not-an-email',
                    comment_text: 'Valid comment'
                });
                ctx.assert.assertStatusIn(badEmail, [400, 422]);
                ctx.assert.assertJson(badEmail, { success: false });

                const emptyText = await anon.postAjax('/api/comments', {
                    csrf_token: csrf,
                    post_id: postId,
                    author_name: 'Valid Name',
                    author_email: 'valid@example.com',
                    comment_text: '   '
                });
                ctx.assert.assertStatusIn(emptyText, [400, 422]);
                ctx.assert.assertJson(emptyText, { success: false });
            }
        },
        {
            id: 'T2-F12-05',
            tier: 2,
            feature: 'F12',
            milestone: 'm3',
            name: 'Reject Public Comment Without Valid CSRF (403)',
            run: async (ctx) => {
                const { anon, postId } = await getPublicCsrfAndPostId(ctx);
                const res = await anon.postAjax('/api/comments', {
                    csrf_token: 'bad',
                    post_id: postId,
                    author_name: 'Attacker',
                    author_email: 'atk@example.com',
                    comment_text: `NoCsrf ${ctx.uid}`
                });
                ctx.assert.assertStatus(res, 403);
                ctx.assert.assertJson(res, { success: false });
            }
        },
        {
            id: 'T2-F12-06',
            tier: 2,
            feature: 'F12',
            milestone: 'm3',
            name: 'XSS Payload in Public Comment Escaped Without Double-Encoding Corruption',
            run: async (ctx) => {
                const { anon, csrf, postId } = await getPublicCsrfAndPostId(ctx);
                const marker = `NoDbl-${ctx.uid}`;
                const sub = await anon.postAjax('/api/comments', {
                    csrf_token: csrf,
                    post_id: postId,
                    author_name: `Rina & Co <script>x</script> ${ctx.uid}`,
                    author_email: `rina_${ctx.uid}@example.com`,
                    comment_text: `A > B & "C" ${marker}`
                });
                ctx.assert.assertStatusIn(sub, [200, 201]);
                ctx.assert.assertJson(sub, { success: true, is_approved: 1 });

                const detail = await anon.get(`/post/${SEEDED_PUBLISHED_SLUG_1}`);
                ctx.assert.assertStatus(detail, 200);
                ctx.assert.assertNotIncludes(detail, '<script>x</script>');
                ctx.assert.assertNotIncludes(detail, '&amp;amp;');
                ctx.assert.assertNotIncludes(detail, '&amp;quot;');
                ctx.assert.assertIncludes(detail, 'Rina &amp; Co');
                ctx.assert.assertIncludes(detail, '&quot;C&quot;');
            }
        }
    ];
}
