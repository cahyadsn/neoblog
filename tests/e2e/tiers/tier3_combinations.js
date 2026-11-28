/**
 * Tier 3 — Cross-Feature Pairwise Combinations (T3-01 .. T3-14)
 * Opaque-box E2E tests verifying contract handshakes across features F1-F12.
 */

const SAMPLE_POST_1_SLUG = 'membangun-web-modern-php-native-vanilla-stack';
const SAMPLE_POST_2_SLUG = 'evolusi-multi-agent-systems-rekayasa-perangkat-lunak';

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
    const preSession = client.getCookie('PHPSESSID');

    const postRes = await client.postForm(loginPath, {
        csrf_token: csrf,
        identifier,
        password
    });

    return { client, loginRes: postRes, getRes, preSession };
}

async function loginAdminOrEditor(ctx, identifier, password, loginPath = '/admin/login') {
    const { client, loginRes, preSession } = await loginAs(ctx, identifier, password, loginPath);
    ctx.assert.assertRedirect(loginRes, /\/admin\/?$/);
    const postSession = client.getCookie('PHPSESSID');
    ctx.assert.assertCookieChanged(preSession, postSession, 'PHPSESSID');
    ctx.assert.assertSetCookieFlag(loginRes, 'PHPSESSID', 'HttpOnly');
    ctx.assert.assertSetCookieFlag(loginRes, 'PHPSESSID', 'SameSite=Lax');

    const dashRes = await client.get('/admin');
    ctx.assert.assertStatus(dashRes, 200);
    ctx.assert.assertNoPhpErrors(dashRes);
    const csrf = ctx.http.extractCsrfToken(dashRes.text);
    ctx.assert.ok(csrf, 'Expected CSRF token on /admin');

    return { client, csrf, dashRes };
}

async function getAdminCsrf(ctx, client) {
    const res = await client.get('/admin');
    ctx.assert.assertStatus(res, 200);
    ctx.assert.assertNoPhpErrors(res);
    const csrf = ctx.http.extractCsrfToken(res.text);
    ctx.assert.ok(csrf, 'Expected CSRF token on /admin');
    return csrf;
}

function extractPostIdFromHtml(html, marker) {
    const rowMatches = html.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    for (const row of rowMatches) {
        if (row.includes(marker)) {
            const m = /\/admin\/posts\/(\d+)\/(?:edit|update|status|delete)\b/i.exec(row)
                || /data-post-id=["']?(\d+)["']?/i.exec(row);
            if (m) return Number.parseInt(m[1], 10);
        }
    }
    const idx = html.indexOf(marker);
    if (idx !== -1) {
        const windowText = html.slice(Math.max(0, idx - 500), idx + 1500);
        const m = /\/admin\/posts\/(\d+)\/(?:edit|update|status|delete)\b/i.exec(windowText)
            || /data-post-id=["']?(\d+)["']?/i.exec(windowText);
        if (m) return Number.parseInt(m[1], 10);
    }
    return null;
}

async function findPostIdByMarker(ctx, adminClient, marker, status = 'all') {
    let res = await adminClient.get('/admin/posts', { query: { status, q: marker } });
    ctx.assert.assertStatus(res, 200);
    ctx.assert.assertNoPhpErrors(res);
    let id = extractPostIdFromHtml(res.text, marker);
    if (id) return id;

    res = await adminClient.get('/admin/posts', { query: { status } });
    ctx.assert.assertStatus(res, 200);
    ctx.assert.assertNoPhpErrors(res);
    id = extractPostIdFromHtml(res.text, marker);
    ctx.assert.ok(id, `Could not locate post ID for marker "${marker}" in /admin/posts?status=${status}`);
    return id;
}

function extractCommentIdFromHtml(html, marker) {
    const rowMatches = html.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    for (const row of rowMatches) {
        if (row.includes(marker)) {
            const m = /\/admin\/comments\/(\d+)\/(?:approve|hide|reply|delete)\b/i.exec(row)
                || /data-comment-id=["']?(\d+)["']?/i.exec(row);
            if (m) return Number.parseInt(m[1], 10);
        }
    }
    const idx = html.indexOf(marker);
    if (idx !== -1) {
        const windowText = html.slice(Math.max(0, idx - 500), idx + 1500);
        const m = /\/admin\/comments\/(\d+)\/(?:approve|hide|reply|delete)\b/i.exec(windowText)
            || /data-comment-id=["']?(\d+)["']?/i.exec(windowText);
        if (m) return Number.parseInt(m[1], 10);
    }
    return null;
}

async function findCommentIdByMarker(ctx, adminClient, marker, status = 'all') {
    const res = await adminClient.get('/admin/comments', { query: { status } });
    ctx.assert.assertStatus(res, 200);
    ctx.assert.assertNoPhpErrors(res);
    ctx.assert.assertIncludes(res, marker);
    const id = extractCommentIdFromHtml(res.text, marker);
    ctx.assert.ok(id, `Could not locate comment ID for marker "${marker}" in /admin/comments?status=${status}`);
    return id;
}

function extractJsonEntityId(data, kind = 'post') {
    if (!data || typeof data !== 'object') return null;
    if (data[kind] && data[kind].id) return Number.parseInt(data[kind].id, 10);
    if (data.data && data.data.id) return Number.parseInt(data.data.id, 10);
    if (data.id) return Number.parseInt(data.id, 10);
    return null;
}

function extractDashboardPostStats(html) {
    const getStat = (hrefPattern, labelPattern) => {
        const byHref = new RegExp(`${hrefPattern}[^>]*>[\\s\\S]*?stat-card-value[^>]*>(\\d+)<`, 'i').exec(html);
        if (byHref) return Number.parseInt(byHref[1], 10);
        const byLabel = new RegExp(`${labelPattern}[\\s\\S]{0,120}?stat-card-value[^>]*>(\\d+)<`, 'i').exec(html);
        if (byLabel) return Number.parseInt(byLabel[1], 10);
        throw new Error(`Could not parse dashboard stat matching ${hrefPattern}`);
    };
    return {
        total: getStat('href="/admin/posts"', 'Total Artikel'),
        published: getStat('href="/admin/posts\\?status=published"', 'Terbit'),
        draft: getStat('href="/admin/posts\\?status=draft"', 'Draf'),
        archived: getStat('href="/admin/posts\\?status=archived"', 'Diarsipkan')
    };
}

function extractHomeCardCommentCount(html, slug) {
    const cards = html.match(/<article\b[^>]*class="[^"]*\bpost-card\b[^"]*"[^>]*>[\s\S]*?<\/article>/gi) || [];
    const target = cards.find((card) => card.includes(`/post/${slug}`));
    if (!target) {
        throw new Error(`Could not find post-card for slug "${slug}" on /`);
    }
    const m = /(\d+)\s*Komentar/i.exec(target);
    if (!m) {
        throw new Error(`Could not find comment count in post-card for "${slug}"`);
    }
    return Number.parseInt(m[1], 10);
}

function extractDetailCommentCount(html) {
    const m = /Diskusi\s+Komunitas\s*\(\s*(?:<span\b[^>]*>\s*)?(\d+)(?:\s*<\/span>)?\s*\)/i.exec(html);
    if (!m) {
        throw new Error('Could not find "Diskusi Komunitas (N)" counter in post detail HTML');
    }
    return Number.parseInt(m[1], 10);
}

function extractCommentsListHtml(html) {
    const idx = html.indexOf('id="commentsList"');
    if (idx === -1) {
        throw new Error('Could not find #commentsList in post detail HTML');
    }
    const tail = html.slice(idx);
    const endIdx = tail.search(/<\/section>|<\/article>/i);
    return endIdx === -1 ? tail : tail.slice(0, endIdx);
}

function extractCommentItemBlock(commentsListHtml, marker) {
    const chunks = commentsListHtml.split(/(?=<div\b[^>]*class="[^"]*\bcomment-item\b)/i);
    return chunks.find((c) => c.includes(marker)) || null;
}

function extractPostDetailContent(html) {
    const start = html.indexOf('class="post-detail-content"');
    if (start === -1) return html;
    const afterStart = html.slice(start);
    const end = afterStart.search(/<section\b[^>]*class="[^"]*\bcomments-section\b/i);
    return end === -1 ? afterStart : afterStart.slice(0, end);
}

async function submitPublicComment(ctx, postSlug, { authorName, authorEmail, commentText }) {
    const client = ctx.createClient(ctx.baseUrl);
    const pageRes = await client.get(`/post/${postSlug}`);
    ctx.assert.assertStatus(pageRes, 200);
    ctx.assert.assertNoPhpErrors(pageRes);
    const csrf = ctx.http.extractCsrfToken(pageRes.text);
    const postId = ctx.http.extractHiddenInput(pageRes.text, 'post_id');
    ctx.assert.ok(csrf && postId, `Expected csrf_token and post_id on /post/${postSlug}`);

    const res = await client.postAjax('/api/comments', {
        csrf_token: csrf,
        post_id: postId,
        author_name: authorName,
        author_email: authorEmail,
        comment_text: commentText
    });
    return { client, res, postId };
}

export function registerTests() {
    return [
        {
            id: 'T3-01',
            tier: 3,
            feature: 'F1',
            milestone: 'm1',
            name: 'Role Switching & Session Isolation (author -> editor -> logout -> admin)',
            run: async (ctx) => {
                const { assert } = ctx;

                // 1. Author denied at login & /admin
                const authorAttempt = await loginAs(ctx, 'author', 'author123');
                assert.assertStatus(authorAttempt.loginRes, 403);
                assert.assertNoPhpErrors(authorAttempt.loginRes);
                const authorAdminRes = await authorAttempt.client.get('/admin');
                assert.ok(
                    authorAdminRes.status === 403 || (authorAdminRes.status === 302 && /\/login/.test(authorAdminRes.location || '')),
                    `Expected author /admin to be 403 or 302 login, got ${authorAdminRes.status}`
                );

                // 2. Fresh jar logs in as editor
                const { client: editorJar, csrf: editorCsrf, dashRes: editorDash } = await loginAdminOrEditor(
                    ctx,
                    'editor@neoblog.local',
                    'editor123'
                );
                assert.assertIncludes(editorDash, 'Editor');

                for (const route of ['/admin', '/admin/posts', '/admin/comments']) {
                    const r = await editorJar.get(route);
                    assert.assertStatus(r, 200, `Editor should access ${route}`);
                    assert.assertNoPhpErrors(r);
                }

                // 3. Logout invalidates editor session
                const logoutRes = await editorJar.postForm('/admin/logout', { csrf_token: editorCsrf });
                assert.assertRedirect(logoutRes, /\/(?:admin\/)?login/);
                const postLogoutDash = await editorJar.get('/admin');
                assert.assertRedirect(postLogoutDash, /\/(?:admin\/)?login/);

                // 4. Fresh admin login succeeds
                const { dashRes: adminDash } = await loginAdminOrEditor(ctx, 'admin', 'admin123');
                assert.assertIncludes(adminDash, 'Administrator NeoBlog');
            }
        },
        {
            id: 'T3-02',
            tier: 3,
            feature: 'F3',
            milestone: 'm2',
            name: 'Dashboard Counters Track Full Article Lifecycle (draft -> published -> archived -> deleted)',
            run: async (ctx) => {
                const { assert } = ctx;
                const { client: adminJar, csrf, dashRes } = await loginAdminOrEditor(ctx, 'admin', 'admin123');
                const base = extractDashboardPostStats(dashRes.text);

                const marker = `T302-${ctx.uid}`;
                const slug = `t3-02-lifecycle-${ctx.uid}`;

                // Create draft -> draft +1, total +1
                const createRes = await adminJar.postForm('/admin/posts', {
                    csrf_token: csrf,
                    title: `Artikel Lifecycle ${marker}`,
                    slug,
                    category_id: '1',
                    excerpt: `Ringkasan ${marker}`,
                    content: `<p>Isi lifecycle ${marker}</p>`,
                    reading_time: '4',
                    status: 'draft'
                });
                assert.assertRedirect(createRes, /\/admin\/posts/);

                let afterDraft = extractDashboardPostStats((await adminJar.get('/admin')).text);
                assert.strictEqual(afterDraft.total, base.total + 1);
                assert.strictEqual(afterDraft.draft, base.draft + 1);
                assert.strictEqual(afterDraft.published, base.published);
                assert.strictEqual(afterDraft.archived, base.archived);

                const postId = await findPostIdByMarker(ctx, adminJar, marker, 'draft');

                // Publish -> draft -1, published +1
                const pubRes = await adminJar.postForm(`/admin/posts/${postId}/status`, {
                    csrf_token: csrf,
                    status: 'published'
                });
                assert.assertRedirect(pubRes, /\/admin\/posts/);

                const afterPub = extractDashboardPostStats((await adminJar.get('/admin')).text);
                assert.strictEqual(afterPub.total, base.total + 1);
                assert.strictEqual(afterPub.draft, base.draft);
                assert.strictEqual(afterPub.published, base.published + 1);
                assert.strictEqual(afterPub.archived, base.archived);

                // Archive -> published -1, archived +1
                const archRes = await adminJar.postForm(`/admin/posts/${postId}/status`, {
                    csrf_token: csrf,
                    status: 'archived'
                });
                assert.assertRedirect(archRes, /\/admin\/posts/);

                const afterArch = extractDashboardPostStats((await adminJar.get('/admin')).text);
                assert.strictEqual(afterArch.total, base.total + 1);
                assert.strictEqual(afterArch.draft, base.draft);
                assert.strictEqual(afterArch.published, base.published);
                assert.strictEqual(afterArch.archived, base.archived + 1);

                // Delete -> back to baseline
                const delRes = await adminJar.postForm(`/admin/posts/${postId}/delete`, { csrf_token: csrf });
                assert.assertRedirect(delRes, /\/admin\/posts/);

                const afterDel = extractDashboardPostStats((await adminJar.get('/admin')).text);
                assert.deepStrictEqual(afterDel, base);
            }
        },
        {
            id: 'T3-03',
            tier: 3,
            feature: 'F7',
            milestone: 'm2',
            name: 'Draft Visibility & Public Comment Isolation Until Published',
            run: async (ctx) => {
                const { assert } = ctx;
                const { client: adminJar, csrf } = await loginAdminOrEditor(ctx, 'admin', 'admin123');
                const marker = `T303-${ctx.uid}`;
                const slug = `t3-03-draft-iso-${ctx.uid}`;

                const createRes = await adminJar.postForm('/admin/posts', {
                    csrf_token: csrf,
                    title: `Draft Terisolasi ${marker}`,
                    slug,
                    category_id: '1',
                    excerpt: `Ringkasan ${marker}`,
                    content: `<p>Konten draft ${marker}</p>`,
                    reading_time: '3',
                    status: 'draft'
                });
                assert.assertRedirect(createRes, /\/admin\/posts/);

                const draftList = await adminJar.get('/admin/posts', { query: { status: 'draft' } });
                assert.assertStatus(draftList, 200);
                assert.assertIncludes(draftList, marker);

                const postId = await findPostIdByMarker(ctx, adminJar, marker, 'draft');

                // Reader cannot see draft on / or /post/{slug}
                const anon = ctx.createClient(ctx.baseUrl);
                const homeRes = await anon.get('/');
                assert.assertStatus(homeRes, 200);
                assert.assertNotIncludes(homeRes, marker);
                assert.assertNotIncludes(homeRes, slug);

                const detailDraft = await anon.get(`/post/${slug}`);
                assert.assertStatus(detailDraft, 404);

                // Public API must reject comments targeting a draft post_id
                const pubPage = await anon.get(`/post/${SAMPLE_POST_1_SLUG}`);
                const pubCsrf = ctx.http.extractCsrfToken(pubPage.text);
                const badComment = await anon.postAjax('/api/comments', {
                    csrf_token: pubCsrf,
                    post_id: String(postId),
                    author_name: 'Reader Probe',
                    author_email: 'probe@example.com',
                    comment_text: `Blocked draft comment ${marker}`
                });
                assert.assertStatusIn(badComment, [400, 404, 422]);
                assert.assertJson(badComment, { success: false });
            }
        },
        {
            id: 'T3-04',
            tier: 3,
            feature: 'F7',
            milestone: 'm2',
            name: 'Edit Slug Update Reroutes Public URL Immediately',
            run: async (ctx) => {
                const { assert } = ctx;
                const { client: adminJar, csrf } = await loginAdminOrEditor(ctx, 'admin', 'admin123');
                const marker = `T304-${ctx.uid}`;
                const oldSlug = `old-slug-t304-${ctx.uid}`;
                const newSlug = `new-slug-t304-${ctx.uid}`;

                const createRes = await adminJar.postForm('/admin/posts', {
                    csrf_token: csrf,
                    title: `Artikel Slug ${marker}`,
                    slug: oldSlug,
                    category_id: '2',
                    excerpt: `Ex ${marker}`,
                    content: `<p>Konten slug ${marker}</p>`,
                    reading_time: '5',
                    status: 'published'
                });
                assert.assertRedirect(createRes, /\/admin\/posts/);

                const anon = ctx.createClient(ctx.baseUrl);
                const oldRes = await anon.get(`/post/${oldSlug}`);
                assert.assertStatus(oldRes, 200);
                assert.assertIncludes(oldRes, marker);

                const postId = await findPostIdByMarker(ctx, adminJar, marker, 'published');
                const editPage = await adminJar.get(`/admin/posts/${postId}/edit`);
                assert.assertStatus(editPage, 200);

                const updateRes = await adminJar.postForm(`/admin/posts/${postId}/update`, {
                    csrf_token: csrf,
                    title: `Artikel Slug Updated ${marker}`,
                    slug: newSlug,
                    category_id: '2',
                    excerpt: `Ex updated ${marker}`,
                    content: `<p>Konten slug baru ${marker}</p>`,
                    reading_time: '5',
                    status: 'published'
                });
                assert.assertRedirect(updateRes, /\/admin\/posts/);

                const newRes = await anon.get(`/post/${newSlug}`);
                assert.assertStatus(newRes, 200);
                assert.assertIncludes(newRes, marker);

                const staleRes = await anon.get(`/post/${oldSlug}`);
                assert.assertStatus(staleRes, 404);
            }
        },
        {
            id: 'T3-05',
            tier: 3,
            feature: 'F5',
            milestone: 'm2',
            name: 'HTML Sanitization Round-Trip on Create & Edit',
            run: async (ctx) => {
                const { assert } = ctx;
                const { client: adminJar, csrf } = await loginAdminOrEditor(ctx, 'admin', 'admin123');
                const marker = `T305-${ctx.uid}`;
                const slug = `t3-05-sanitize-${ctx.uid}`;

                const createRes = await adminJar.postForm('/admin/posts', {
                    csrf_token: csrf,
                    title: `Sanitize Post ${marker}`,
                    slug,
                    category_id: '1',
                    excerpt: `Ringkasan ${marker}`,
                    content: `<p><strong>Valid-${marker}</strong></p><script>badCreate_${ctx.uid}()</script><img src="https://example.test/a.png" onerror="badCreate_${ctx.uid}()">`,
                    reading_time: '3',
                    status: 'published'
                });
                assert.assertRedirect(createRes, /\/admin\/posts/);

                const anon = ctx.createClient(ctx.baseUrl);
                let detail = await anon.get(`/post/${slug}`);
                assert.assertStatus(detail, 200);
                let bodyContent = extractPostDetailContent(detail.text);
                assert.assertIncludes(bodyContent, `<p><strong>Valid-${marker}</strong></p>`);
                assert.assertNotIncludes(bodyContent, '<script');
                assert.assertNotIncludes(bodyContent, `badCreate_${ctx.uid}`);
                assert.assertNotIncludes(bodyContent, 'onerror=');

                const postId = await findPostIdByMarker(ctx, adminJar, marker, 'published');
                const updateRes = await adminJar.postForm(`/admin/posts/${postId}/update`, {
                    csrf_token: csrf,
                    title: `Sanitize Post ${marker}`,
                    slug,
                    category_id: '1',
                    excerpt: `Ringkasan ${marker}`,
                    content: `<p><strong>Edited-${marker}</strong></p><a href="javascript:badEdit_${ctx.uid}()">Klik</a><iframe src="https://evil.test"></iframe>`,
                    reading_time: '3',
                    status: 'published'
                });
                assert.assertRedirect(updateRes, /\/admin\/posts/);

                detail = await anon.get(`/post/${slug}`);
                assert.assertStatus(detail, 200);
                bodyContent = extractPostDetailContent(detail.text);
                assert.assertIncludes(bodyContent, `<strong>Edited-${marker}</strong>`);
                assert.assertNotIncludes(bodyContent, 'javascript:');
                assert.assertNotIncludes(bodyContent, `badEdit_${ctx.uid}`);
                assert.assertNotIncludes(bodyContent, '<iframe');
            }
        },
        {
            id: 'T3-06',
            tier: 3,
            feature: 'F10',
            milestone: 'm3',
            name: 'Spam Held Pending -> Admin Approves -> Publicly Visible & Counter Updates',
            run: async (ctx) => {
                const { assert } = ctx;
                const anon = ctx.createClient(ctx.baseUrl);
                const beforeCount = extractDetailCommentCount((await anon.get(`/post/${SAMPLE_POST_1_SLUG}`)).text);

                const marker = `T306-${ctx.uid}`;
                const { res: submitRes } = await submitPublicComment(ctx, SAMPLE_POST_1_SLUG, {
                    authorName: `SpamProbe ${marker}`,
                    authorEmail: 'probe306@example.com',
                    commentText: `Info crypto bounty ${marker}`
                });
                assert.assertStatusIn(submitRes, [200, 201]);
                assert.assertJson(submitRes, (data) => {
                    assert.strictEqual(data.success, true);
                    assert.strictEqual(data.is_approved, 0);
                    assert.strictEqual(data.status, 'pending');
                });

                // Absent publicly while pending
                const stillHidden = await anon.get(`/post/${SAMPLE_POST_1_SLUG}`);
                assert.assertNotIncludes(stillHidden, marker);
                assert.strictEqual(extractDetailCommentCount(stillHidden.text), beforeCount);

                // Visible in pending queue only
                const { client: adminJar, csrf } = await loginAdminOrEditor(ctx, 'admin', 'admin123');
                const pendingPage = await adminJar.get('/admin/comments', { query: { status: 'pending' } });
                assert.assertStatus(pendingPage, 200);
                assert.assertIncludes(pendingPage, marker);

                const approvedBefore = await adminJar.get('/admin/comments', { query: { status: 'approved' } });
                assert.assertStatus(approvedBefore, 200);
                assert.assertNotIncludes(approvedBefore, marker);

                const commentId = await findCommentIdByMarker(ctx, adminJar, marker, 'pending');
                const approveRes = await adminJar.postForm(`/admin/comments/${commentId}/approve`, { csrf_token: csrf });
                assert.assertRedirect(approveRes, /\/admin\/comments/);

                const pendingAfter = await adminJar.get('/admin/comments', { query: { status: 'pending' } });
                assert.assertNotIncludes(pendingAfter, marker);
                const approvedAfter = await adminJar.get('/admin/comments', { query: { status: 'approved' } });
                assert.assertIncludes(approvedAfter, marker);

                const publicAfter = await anon.get(`/post/${SAMPLE_POST_1_SLUG}`);
                assert.assertIncludes(publicAfter, marker);
                assert.strictEqual(extractDetailCommentCount(publicAfter.text), beforeCount + 1);
            }
        },
        {
            id: 'T3-07',
            tier: 3,
            feature: 'F10',
            milestone: 'm3',
            name: 'Approved Public Comment -> Admin Hides -> Disappears From / & /post/{slug}',
            run: async (ctx) => {
                const { assert } = ctx;
                const anon = ctx.createClient(ctx.baseUrl);
                const homeBefore = extractHomeCardCommentCount((await anon.get('/')).text, SAMPLE_POST_2_SLUG);
                const detailBefore = extractDetailCommentCount((await anon.get(`/post/${SAMPLE_POST_2_SLUG}`)).text);

                const marker = `T307-${ctx.uid}`;
                const { res: submitRes } = await submitPublicComment(ctx, SAMPLE_POST_2_SLUG, {
                    authorName: `Reader ${marker}`,
                    authorEmail: 'reader307@example.com',
                    commentText: `Komentar bersih ${marker}`
                });
                assert.assertStatusIn(submitRes, [200, 201]);
                const created = assert.assertJson(submitRes, (data) => {
                    assert.strictEqual(data.success, true);
                    assert.strictEqual(data.is_approved, 1);
                });
                const commentId = extractJsonEntityId(created, 'comment');

                assert.strictEqual(extractHomeCardCommentCount((await anon.get('/')).text, SAMPLE_POST_2_SLUG), homeBefore + 1);
                const detailMid = await anon.get(`/post/${SAMPLE_POST_2_SLUG}`);
                assert.assertIncludes(detailMid, marker);
                assert.strictEqual(extractDetailCommentCount(detailMid.text), detailBefore + 1);

                const { client: adminJar, csrf } = await loginAdminOrEditor(ctx, 'admin', 'admin123');
                const targetId = commentId || (await findCommentIdByMarker(ctx, adminJar, marker, 'approved'));
                const hideRes = await adminJar.postForm(`/admin/comments/${targetId}/hide`, { csrf_token: csrf });
                assert.assertRedirect(hideRes, /\/admin\/comments/);

                assert.strictEqual(extractHomeCardCommentCount((await anon.get('/')).text, SAMPLE_POST_2_SLUG), homeBefore);
                const detailAfter = await anon.get(`/post/${SAMPLE_POST_2_SLUG}`);
                assert.assertNotIncludes(detailAfter, marker);
                assert.strictEqual(extractDetailCommentCount(detailAfter.text), detailBefore);
            }
        },
        {
            id: 'T3-08',
            tier: 3,
            feature: 'F12',
            milestone: 'm3',
            name: 'Approve Comment + Admin Reply -> Nested Public Threading Order & Badge',
            run: async (ctx) => {
                const { assert } = ctx;
                const { client: adminJar, csrf } = await loginAdminOrEditor(ctx, 'admin', 'admin123');
                const marker = `T308-${ctx.uid}`;
                const slug = `t3-08-thread-${ctx.uid}`;

                const createPost = await adminJar.postForm('/admin/posts', {
                    csrf_token: csrf,
                    title: `Thread Post ${marker}`,
                    slug,
                    category_id: '1',
                    excerpt: `Ex ${marker}`,
                    content: `<p>Artikel thread ${marker}</p>`,
                    reading_time: '3',
                    status: 'published'
                });
                assert.assertRedirect(createPost, /\/admin\/posts/);

                // Submit C1 (spam -> pending), then C2 (approved)
                const c1Marker = `C1-${marker}`;
                const c2Marker = `C2-${marker}`;
                const r1Marker = `R1-${marker}`;

                const c1Submit = await submitPublicComment(ctx, slug, {
                    authorName: 'Pengirim Satu',
                    authorEmail: 'c1@example.com',
                    commentText: `Pertanyaan casino ${c1Marker}`
                });
                assert.assertStatusIn(c1Submit.res, [200, 201]);
                const c1Id = extractJsonEntityId(c1Submit.res.json(), 'comment')
                    || (await findCommentIdByMarker(ctx, adminJar, c1Marker, 'pending'));

                const c2Submit = await submitPublicComment(ctx, slug, {
                    authorName: 'Pengirim Dua',
                    authorEmail: 'c2@example.com',
                    commentText: `Komentar terpisah ${c2Marker}`
                });
                assert.assertStatusIn(c2Submit.res, [200, 201]);

                // Admin approves C1 and replies R1 to C1
                const appRes = await adminJar.postForm(`/admin/comments/${c1Id}/approve`, { csrf_token: csrf });
                assert.assertRedirect(appRes, /\/admin\/comments/);

                const repRes = await adminJar.postForm(`/admin/comments/${c1Id}/reply`, {
                    csrf_token: csrf,
                    comment_text: `Balasan resmi ${r1Marker}`
                });
                assert.assertRedirect(repRes, /\/admin\/comments/);

                // Verify public threading order: C1 < R1 < C2
                const anon = ctx.createClient(ctx.baseUrl);
                const detailRes = await anon.get(`/post/${slug}`);
                assert.assertStatus(detailRes, 200);
                assert.strictEqual(extractDetailCommentCount(detailRes.text), 3);

                const listHtml = extractCommentsListHtml(detailRes.text);
                const posC1 = listHtml.indexOf(c1Marker);
                const posR1 = listHtml.indexOf(r1Marker);
                const posC2 = listHtml.indexOf(c2Marker);
                assert.ok(posC1 !== -1 && posR1 !== -1 && posC2 !== -1, 'Expected C1, R1, and C2 in #commentsList');
                assert.ok(posC1 < posR1 && posR1 < posC2, `Expected threaded order C1 < R1 < C2, got ${posC1}, ${posR1}, ${posC2}`);

                const r1Block = extractCommentItemBlock(listHtml, r1Marker);
                assert.ok(r1Block, 'Expected .comment-item block for R1');
                assert.assertMatch(r1Block, /badge[^>]*>\s*(?:Admin|Editor)\s*</i);
                assert.assertNotMatch(r1Block, /badge[^>]*>\s*Assistant\s*</i);
            }
        },
        {
            id: 'T3-09',
            tier: 3,
            feature: 'F11',
            milestone: 'm3',
            name: 'Cascade Delete Parent Comment Removes Child Admin Reply',
            run: async (ctx) => {
                const { assert } = ctx;
                const { client: adminJar, csrf } = await loginAdminOrEditor(ctx, 'admin', 'admin123');
                const marker = `T309-${ctx.uid}`;
                const slug = `t3-09-cascade-${ctx.uid}`;

                assert.assertRedirect(
                    await adminJar.postForm('/admin/posts', {
                        csrf_token: csrf,
                        title: `Cascade Post ${marker}`,
                        slug,
                        category_id: '1',
                        excerpt: `Ex ${marker}`,
                        content: `<p>Cascade ${marker}</p>`,
                        reading_time: '3',
                        status: 'published'
                    }),
                    /\/admin\/posts/
                );

                const c1Marker = `Root-${marker}`;
                const c2Marker = `Control-${marker}`;
                const r1Marker = `ChildReply-${marker}`;

                const c1Sub = await submitPublicComment(ctx, slug, {
                    authorName: 'User Root',
                    authorEmail: 'root@example.com',
                    commentText: c1Marker
                });
                const c1Id = extractJsonEntityId(c1Sub.res.json(), 'comment')
                    || (await findCommentIdByMarker(ctx, adminJar, c1Marker, 'approved'));

                await submitPublicComment(ctx, slug, {
                    authorName: 'User Control',
                    authorEmail: 'ctrl@example.com',
                    commentText: c2Marker
                });

                assert.assertRedirect(
                    await adminJar.postForm(`/admin/comments/${c1Id}/reply`, {
                        csrf_token: csrf,
                        comment_text: r1Marker
                    }),
                    /\/admin\/comments/
                );

                const anon = ctx.createClient(ctx.baseUrl);
                assert.strictEqual(extractDetailCommentCount((await anon.get(`/post/${slug}`)).text), 3);

                // Delete parent C1 -> C1 + R1 removed, C2 stays
                assert.assertRedirect(
                    await adminJar.postForm(`/admin/comments/${c1Id}/delete`, { csrf_token: csrf }),
                    /\/admin\/comments/
                );

                const adminList = await adminJar.get('/admin/comments');
                assert.assertStatus(adminList, 200);
                assert.assertNotIncludes(adminList, c1Marker);
                assert.assertNotIncludes(adminList, r1Marker);
                assert.assertIncludes(adminList, c2Marker);

                const publicAfter = await anon.get(`/post/${slug}`);
                assert.assertStatus(publicAfter, 200);
                assert.strictEqual(extractDetailCommentCount(publicAfter.text), 1);
                assert.assertNotIncludes(publicAfter, c1Marker);
                assert.assertNotIncludes(publicAfter, r1Marker);
                assert.assertIncludes(publicAfter, c2Marker);
            }
        },
        {
            id: 'T3-10',
            tier: 3,
            feature: 'F8',
            milestone: 'm3',
            name: 'Archive & Delete Post With Comments (Non-Destructive Archive -> Cascade Delete)',
            run: async (ctx) => {
                const { assert } = ctx;
                const { client: adminJar, csrf } = await loginAdminOrEditor(ctx, 'admin', 'admin123');
                const marker = `T310-${ctx.uid}`;
                const slug = `t3-10-archdel-${ctx.uid}`;

                assert.assertRedirect(
                    await adminJar.postForm('/admin/posts', {
                        csrf_token: csrf,
                        title: `Archive Delete ${marker}`,
                        slug,
                        category_id: '1',
                        excerpt: `Ex ${marker}`,
                        content: `<p>Artikel ${marker}</p>`,
                        reading_time: '3',
                        status: 'published'
                    }),
                    /\/admin\/posts/
                );
                const postId = await findPostIdByMarker(ctx, adminJar, marker, 'published');

                const k1 = `K1-${marker}`;
                const k2 = `K2-${marker}`;
                await submitPublicComment(ctx, slug, {
                    authorName: 'A1',
                    authorEmail: 'a1@example.com',
                    commentText: k1
                });
                await submitPublicComment(ctx, slug, {
                    authorName: 'A2',
                    authorEmail: 'a2@example.com',
                    commentText: k2
                });

                // Archive post
                assert.assertRedirect(
                    await adminJar.postForm(`/admin/posts/${postId}/status`, {
                        csrf_token: csrf,
                        status: 'archived'
                    }),
                    /\/admin\/posts/
                );

                const anon = ctx.createClient(ctx.baseUrl);
                assert.assertStatus(await anon.get(`/post/${slug}`), 404);

                const pubPage = await anon.get(`/post/${SAMPLE_POST_1_SLUG}`);
                const pubCsrf = ctx.http.extractCsrfToken(pubPage.text);
                const blocked = await anon.postAjax('/api/comments', {
                    csrf_token: pubCsrf,
                    post_id: String(postId),
                    author_name: 'Blocked',
                    author_email: 'blocked@example.com',
                    comment_text: `Cannot post ${marker}`
                });
                assert.assertStatusIn(blocked, [400, 404, 422]);
                assert.assertJson(blocked, { success: false });

                // Comments still exist in admin while post is archived
                const adminCommentsBefore = await adminJar.get('/admin/comments');
                assert.assertIncludes(adminCommentsBefore, k1);
                assert.assertIncludes(adminCommentsBefore, k2);

                // Delete post -> cascades comments cleanly
                assert.assertRedirect(
                    await adminJar.postForm(`/admin/posts/${postId}/delete`, { csrf_token: csrf }),
                    /\/admin\/posts/
                );

                const adminCommentsAfter = await adminJar.get('/admin/comments');
                assert.assertNotIncludes(adminCommentsAfter, k1);
                assert.assertNotIncludes(adminCommentsAfter, k2);
            }
        },
        {
            id: 'T3-11',
            tier: 3,
            feature: 'F7',
            milestone: 'm2',
            name: 'HTML Form POST vs AJAX JSON Parity Across Article & Comment Mutations',
            run: async (ctx) => {
                const { assert } = ctx;
                const { client: adminJar, csrf } = await loginAdminOrEditor(ctx, 'admin', 'admin123');
                const marker = `T311-${ctx.uid}`;

                // Mode A: HTML Form POST
                const slugForm = `t3-11-form-${ctx.uid}`;
                assert.assertRedirect(
                    await adminJar.postForm('/admin/posts', {
                        csrf_token: csrf,
                        title: `Form Draft ${marker}`,
                        slug: slugForm,
                        category_id: '1',
                        excerpt: `Form Ex ${marker}`,
                        content: `<p>Form Body ${marker}</p>`,
                        reading_time: '4',
                        status: 'draft'
                    }),
                    /\/admin\/posts/
                );
                const formPostId = await findPostIdByMarker(ctx, adminJar, `Form Draft ${marker}`, 'draft');

                assert.assertRedirect(
                    await adminJar.postForm(`/admin/posts/${formPostId}/update`, {
                        csrf_token: csrf,
                        title: `Form Updated ${marker}`,
                        slug: slugForm,
                        category_id: '2',
                        excerpt: `Form Ex2 ${marker}`,
                        content: `<p>Form Updated Body ${marker}</p>`,
                        reading_time: '7',
                        status: 'draft'
                    }),
                    /\/admin\/posts/
                );
                assert.assertRedirect(
                    await adminJar.postForm(`/admin/posts/${formPostId}/status`, {
                        csrf_token: csrf,
                        status: 'published'
                    }),
                    /\/admin\/posts/
                );

                const anon = ctx.createClient(ctx.baseUrl);
                assert.assertIncludes(await anon.get(`/post/${slugForm}`), `Form Updated Body ${marker}`);

                const cFormMarker = `CForm-${marker}`;
                const cFormSub = await submitPublicComment(ctx, slugForm, {
                    authorName: 'Form Reader',
                    authorEmail: 'form@example.com',
                    commentText: cFormMarker
                });
                const cFormId = extractJsonEntityId(cFormSub.res.json(), 'comment')
                    || (await findCommentIdByMarker(ctx, adminJar, cFormMarker, 'approved'));

                assert.assertRedirect(
                    await adminJar.postForm(`/admin/comments/${cFormId}/hide`, { csrf_token: csrf }),
                    /\/admin\/comments/
                );
                assert.assertNotIncludes(await anon.get(`/post/${slugForm}`), cFormMarker);

                assert.assertRedirect(
                    await adminJar.postForm(`/admin/comments/${cFormId}/approve`, { csrf_token: csrf }),
                    /\/admin\/comments/
                );
                assert.assertIncludes(await anon.get(`/post/${slugForm}`), cFormMarker);

                const rFormMarker = `RForm-${marker}`;
                assert.assertRedirect(
                    await adminJar.postForm(`/admin/comments/${cFormId}/reply`, {
                        csrf_token: csrf,
                        comment_text: rFormMarker
                    }),
                    /\/admin\/comments/
                );
                assert.assertIncludes(await anon.get(`/post/${slugForm}`), rFormMarker);

                assert.assertRedirect(
                    await adminJar.postForm(`/admin/comments/${cFormId}/delete`, { csrf_token: csrf }),
                    /\/admin\/comments/
                );
                assert.assertNotIncludes(await anon.get(`/post/${slugForm}`), cFormMarker);

                assert.assertRedirect(
                    await adminJar.postForm(`/admin/posts/${formPostId}/delete`, { csrf_token: csrf }),
                    /\/admin\/posts/
                );
                assert.assertStatus(await anon.get(`/post/${slugForm}`), 404);

                // Mode B: AJAX JSON with X-CSRF-Token
                const slugAjax = `t3-11-ajax-${ctx.uid}`;
                const ajaxCreate = await adminJar.postAjax(
                    '/admin/posts',
                    {
                        title: `Ajax Draft ${marker}`,
                        slug: slugAjax,
                        category_id: '1',
                        excerpt: `Ajax Ex ${marker}`,
                        content: `<p>Ajax Body ${marker}</p>`,
                        reading_time: '4',
                        status: 'draft'
                    },
                    { csrfToken: csrf }
                );
                assert.assertStatusIn(ajaxCreate, [200, 201]);
                const ajaxCreateData = assert.assertJson(ajaxCreate, { success: true });
                const ajaxPostId = extractJsonEntityId(ajaxCreateData, 'post')
                    || (await findPostIdByMarker(ctx, adminJar, `Ajax Draft ${marker}`, 'draft'));

                const ajaxUpdate = await adminJar.postAjax(
                    `/admin/posts/${ajaxPostId}/update`,
                    {
                        title: `Ajax Updated ${marker}`,
                        slug: slugAjax,
                        category_id: '2',
                        excerpt: `Ajax Ex2 ${marker}`,
                        content: `<p>Ajax Updated Body ${marker}</p>`,
                        reading_time: '8',
                        status: 'draft'
                    },
                    { csrfToken: csrf }
                );
                assert.assertStatus(ajaxUpdate, 200);
                assert.assertJson(ajaxUpdate, { success: true });

                const ajaxStatus = await adminJar.postAjax(
                    `/admin/posts/${ajaxPostId}/status`,
                    { status: 'published' },
                    { csrfToken: csrf }
                );
                assert.assertStatus(ajaxStatus, 200);
                assert.assertJson(ajaxStatus, { success: true });
                assert.assertIncludes(await anon.get(`/post/${slugAjax}`), `Ajax Updated Body ${marker}`);

                const cAjaxMarker = `CAjax-${marker}`;
                const cAjaxSub = await submitPublicComment(ctx, slugAjax, {
                    authorName: 'Ajax Reader',
                    authorEmail: 'ajax@example.com',
                    commentText: cAjaxMarker
                });
                const cAjaxId = extractJsonEntityId(cAjaxSub.res.json(), 'comment')
                    || (await findCommentIdByMarker(ctx, adminJar, cAjaxMarker, 'approved'));

                const ajaxHide = await adminJar.postAjax(`/admin/comments/${cAjaxId}/hide`, {}, { csrfToken: csrf });
                assert.assertStatus(ajaxHide, 200);
                assert.assertJson(ajaxHide, { success: true });
                assert.assertNotIncludes(await anon.get(`/post/${slugAjax}`), cAjaxMarker);

                const ajaxApprove = await adminJar.postAjax(`/admin/comments/${cAjaxId}/approve`, {}, { csrfToken: csrf });
                assert.assertStatus(ajaxApprove, 200);
                assert.assertJson(ajaxApprove, { success: true });
                assert.assertIncludes(await anon.get(`/post/${slugAjax}`), cAjaxMarker);

                const rAjaxMarker = `RAjax-${marker}`;
                const ajaxReply = await adminJar.postAjax(
                    `/admin/comments/${cAjaxId}/reply`,
                    { comment_text: rAjaxMarker },
                    { csrfToken: csrf }
                );
                assert.assertStatusIn(ajaxReply, [200, 201]);
                assert.assertJson(ajaxReply, { success: true });
                assert.assertIncludes(await anon.get(`/post/${slugAjax}`), rAjaxMarker);

                const ajaxDelComment = await adminJar.postAjax(`/admin/comments/${cAjaxId}/delete`, {}, { csrfToken: csrf });
                assert.assertStatus(ajaxDelComment, 200);
                assert.assertJson(ajaxDelComment, { success: true });
                assert.assertNotIncludes(await anon.get(`/post/${slugAjax}`), cAjaxMarker);

                const ajaxDelPost = await adminJar.postAjax(`/admin/posts/${ajaxPostId}/delete`, {}, { csrfToken: csrf });
                assert.assertStatus(ajaxDelPost, 200);
                assert.assertJson(ajaxDelPost, { success: true });
                assert.assertStatus(await anon.get(`/post/${slugAjax}`), 404);
            }
        },
        {
            id: 'T3-12',
            tier: 3,
            feature: 'F5',
            milestone: 'm1',
            name: 'Multi-Step CSRF Continuity & Post-Logout Invalidation',
            run: async (ctx) => {
                const { assert } = ctx;
                const { client: adminJar, csrf } = await loginAdminOrEditor(ctx, 'admin', 'admin123');
                const marker = `T312-${ctx.uid}`;
                const slug = `t3-12-csrf-${ctx.uid}`;

                // Step 1: Create draft reusing session CSRF
                const createRes = await adminJar.postForm('/admin/posts', {
                    csrf_token: csrf,
                    title: `CSRF Post ${marker}`,
                    slug,
                    category_id: '1',
                    excerpt: `Ex ${marker}`,
                    content: `<p>Konten ${marker}</p>`,
                    reading_time: '3',
                    status: 'draft'
                });
                assert.assertRedirect(createRes, /\/admin\/posts/);
                const postId = await findPostIdByMarker(ctx, adminJar, marker, 'draft');

                // Step 2: Publish reusing same CSRF
                const statusRes = await adminJar.postForm(`/admin/posts/${postId}/status`, {
                    csrf_token: csrf,
                    status: 'published'
                });
                assert.assertRedirect(statusRes, /\/admin\/posts/);

                // Step 3: Add comment on new post and hide it reusing same CSRF
                const cMarker = `C-T312-${ctx.uid}`;
                const cSub = await submitPublicComment(ctx, slug, {
                    authorName: 'Reader CSRF',
                    authorEmail: 'csrf@example.com',
                    commentText: cMarker
                });
                const cid = extractJsonEntityId(cSub.res.json(), 'comment')
                    || (await findCommentIdByMarker(ctx, adminJar, cMarker, 'approved'));

                const hideRes = await adminJar.postForm(`/admin/comments/${cid}/hide`, { csrf_token: csrf });
                assert.assertRedirect(hideRes, /\/admin\/comments/);

                // Step 4: Logout reusing same CSRF
                const logoutRes = await adminJar.postForm('/admin/logout', { csrf_token: csrf });
                assert.assertRedirect(logoutRes, /\/(?:admin\/)?login/);

                // Step 5: Attempt mutation with old cookie + old CSRF token
                const postLogoutHtml = await adminJar.postForm('/admin/posts', {
                    csrf_token: csrf,
                    title: `Should Fail ${marker}`,
                    slug: `fail-${slug}`,
                    category_id: '1',
                    excerpt: 'fail',
                    content: '<p>fail</p>',
                    reading_time: '2',
                    status: 'published'
                });
                assert.ok(
                    postLogoutHtml.status === 401 || postLogoutHtml.status === 403 || postLogoutHtml.status === 302,
                    `Expected post-logout POST to be rejected (302/401/403), got ${postLogoutHtml.status}`
                );

                const postLogoutAjax = await adminJar.postAjax(
                    '/admin/posts',
                    {
                        title: `Should Fail Ajax ${marker}`,
                        slug: `fail-ajax-${slug}`,
                        category_id: '1',
                        excerpt: 'fail',
                        content: '<p>fail</p>',
                        reading_time: '2',
                        status: 'published'
                    },
                    { csrfToken: csrf }
                );
                assert.assertStatusIn(postLogoutAjax, [401, 403]);
                assert.assertJson(postLogoutAjax, { success: false });

                const anon = ctx.createClient(ctx.baseUrl);
                assert.assertStatus(await anon.get(`/post/fail-${slug}`), 404);
                assert.assertStatus(await anon.get(`/post/fail-ajax-${slug}`), 404);
            }
        },
        {
            id: 'T3-13',
            tier: 3,
            feature: 'F2',
            milestone: 'm3',
            name: 'Editor End-to-End Parity (Create, Edit, Publish, Moderate & Reply)',
            run: async (ctx) => {
                const { assert } = ctx;
                const { client: editorJar, csrf } = await loginAdminOrEditor(ctx, 'editor', 'editor123');
                const marker = `T313-${ctx.uid}`;
                const slug = `t3-13-editor-${ctx.uid}`;

                assert.assertRedirect(
                    await editorJar.postForm('/admin/posts', {
                        csrf_token: csrf,
                        title: `Editor Draft ${marker}`,
                        slug,
                        category_id: '3',
                        excerpt: `Ex ${marker}`,
                        content: `<p>Draft editor ${marker}</p>`,
                        reading_time: '4',
                        status: 'draft'
                    }),
                    /\/admin\/posts/
                );
                const postId = await findPostIdByMarker(ctx, editorJar, marker, 'draft');

                assert.assertRedirect(
                    await editorJar.postForm(`/admin/posts/${postId}/update`, {
                        csrf_token: csrf,
                        title: `Editor Published ${marker}`,
                        slug,
                        category_id: '3',
                        excerpt: `Ex2 ${marker}`,
                        content: `<p>Published editor ${marker}</p>`,
                        reading_time: '5',
                        status: 'draft'
                    }),
                    /\/admin\/posts/
                );

                assert.assertRedirect(
                    await editorJar.postForm(`/admin/posts/${postId}/status`, {
                        csrf_token: csrf,
                        status: 'published'
                    }),
                    /\/admin\/posts/
                );

                // Reader submits spam (pending) + clean (approved)
                const spamMarker = `SpamEd-${marker}`;
                const cleanMarker = `CleanEd-${marker}`;
                const spamSub = await submitPublicComment(ctx, slug, {
                    authorName: 'Spammer',
                    authorEmail: 'spam@example.com',
                    commentText: `Promo slot gacor ${spamMarker}`
                });
                const cleanSub = await submitPublicComment(ctx, slug, {
                    authorName: 'Clean Reader',
                    authorEmail: 'clean@example.com',
                    commentText: cleanMarker
                });

                const spamId = extractJsonEntityId(spamSub.res.json(), 'comment')
                    || (await findCommentIdByMarker(ctx, editorJar, spamMarker, 'pending'));
                const cleanId = extractJsonEntityId(cleanSub.res.json(), 'comment')
                    || (await findCommentIdByMarker(ctx, editorJar, cleanMarker, 'approved'));

                assert.assertRedirect(
                    await editorJar.postForm(`/admin/comments/${spamId}/approve`, { csrf_token: csrf }),
                    /\/admin\/comments/
                );

                const replyMarker = `BalasanEditor-${marker}`;
                assert.assertRedirect(
                    await editorJar.postForm(`/admin/comments/${spamId}/reply`, {
                        csrf_token: csrf,
                        comment_text: replyMarker
                    }),
                    /\/admin\/comments/
                );

                assert.assertRedirect(
                    await editorJar.postForm(`/admin/comments/${cleanId}/hide`, { csrf_token: csrf }),
                    /\/admin\/comments/
                );

                const anon = ctx.createClient(ctx.baseUrl);
                const detail = await anon.get(`/post/${slug}`);
                assert.assertStatus(detail, 200);
                assert.assertIncludes(detail, 'Editor NeoBlog');
                assert.assertIncludes(detail, spamMarker);
                assert.assertIncludes(detail, replyMarker);
                assert.assertNotIncludes(detail, cleanMarker);

                const replyBlock = extractCommentItemBlock(extractCommentsListHtml(detail.text), replyMarker);
                assert.ok(replyBlock, 'Expected editor reply block in #commentsList');
                assert.assertIncludes(replyBlock, 'Editor NeoBlog');
                assert.assertMatch(replyBlock, /badge[^>]*>\s*(?:Editor|Admin)\s*</i);
                assert.assertNotMatch(replyBlock, /badge[^>]*>\s*Assistant\s*</i);
            }
        },
        {
            id: 'T3-14',
            tier: 3,
            feature: 'F12',
            milestone: 'm3',
            name: 'Bot Reply (Assistant) & Admin Reply (Admin/Editor) Coexistence',
            run: async (ctx) => {
                const { assert } = ctx;
                const marker = `T314-${ctx.uid}`;
                const readerMarker = `Pengunjung-${marker}`;
                const replyMarker = `BalasanAdmin-${marker}`;

                const cSub = await submitPublicComment(ctx, SAMPLE_POST_1_SLUG, {
                    authorName: `User ${marker}`,
                    authorEmail: 'user314@example.com',
                    commentText: readerMarker
                });
                assert.assertStatusIn(cSub.res, [200, 201]);

                const { client: adminJar, csrf } = await loginAdminOrEditor(ctx, 'admin', 'admin123');
                const cid = extractJsonEntityId(cSub.res.json(), 'comment')
                    || (await findCommentIdByMarker(ctx, adminJar, readerMarker, 'approved'));

                assert.assertRedirect(
                    await adminJar.postForm(`/admin/comments/${cid}/reply`, {
                        csrf_token: csrf,
                        comment_text: replyMarker
                    }),
                    /\/admin\/comments/
                );

                const anon = ctx.createClient(ctx.baseUrl);
                const detail = await anon.get(`/post/${SAMPLE_POST_1_SLUG}`);
                assert.assertStatus(detail, 200);

                const listHtml = extractCommentsListHtml(detail.text);
                const botBlock = extractCommentItemBlock(listHtml, 'NeoBlog Assistant');
                assert.ok(botBlock, 'Expected seeded NeoBlog Assistant comment block');
                assert.assertMatch(botBlock, /badge[^>]*>\s*Assistant\s*</i);
                assert.assertNotMatch(botBlock, /badge[^>]*>\s*(?:Admin|Editor)\s*</i);

                const adminBlock = extractCommentItemBlock(listHtml, replyMarker);
                assert.ok(adminBlock, 'Expected new admin reply block');
                assert.assertMatch(adminBlock, /badge[^>]*>\s*(?:Admin|Editor)\s*</i);
                assert.assertNotMatch(adminBlock, /badge[^>]*>\s*Assistant\s*</i);
            }
        }
    ];
}

export default { registerTests };
