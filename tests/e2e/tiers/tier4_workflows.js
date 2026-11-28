/**
 * Tier 4 — Real-World Editorial & Moderation Workflows (T4-01 .. T4-07)
 * Multi-actor end-to-end scenarios exercising full NeoBlog CMS lifecycles.
 */

import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const SAMPLE_POST_1_SLUG = 'membangun-web-modern-php-native-vanilla-stack';
const SAMPLE_POST_2_SLUG = 'evolusi-multi-agent-systems-rekayasa-perangkat-lunak';

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function allocateFreePort(host = '127.0.0.1') {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, host, () => {
            const addr = srv.address();
            const port = typeof addr === 'object' && addr ? addr.port : 0;
            srv.close((err) => (err ? reject(err) : resolve(port)));
        });
    });
}

function execFileAsync(bin, args) {
    return new Promise((resolve, reject) => {
        execFile(bin, args, { windowsHide: true }, (err, stdout, stderr) => {
            if (err) reject(err);
            else resolve({ stdout, stderr });
        });
    });
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

    return { client, loginRes: postRes, preSession };
}

async function loginAdminOrEditor(ctx, identifier, password, loginPath = '/admin/login') {
    const { client, loginRes, preSession } = await loginAs(ctx, identifier, password, loginPath);
    ctx.assert.assertRedirect(loginRes, /\/admin\/?$/);
    const postSession = client.getCookie('PHPSESSID');
    ctx.assert.assertCookieChanged(preSession, postSession, 'PHPSESSID');

    const dashRes = await client.get('/admin');
    ctx.assert.assertStatus(dashRes, 200);
    ctx.assert.assertNoPhpErrors(dashRes);
    const csrf = ctx.http.extractCsrfToken(dashRes.text);
    ctx.assert.ok(csrf, 'Expected CSRF token on /admin');

    return { client, csrf, dashRes };
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

function extractDashboardAllStats(html) {
    const getStat = (hrefPattern) => {
        const m = new RegExp(`${hrefPattern}[^>]*>[\\s\\S]*?stat-card-value[^>]*>(\\d+)<`, 'i').exec(html);
        if (!m) throw new Error(`Could not parse dashboard stat for ${hrefPattern}`);
        return Number.parseInt(m[1], 10);
    };
    return {
        total: getStat('href="/admin/posts"'),
        published: getStat('href="/admin/posts\\?status=published"'),
        draft: getStat('href="/admin/posts\\?status=draft"'),
        archived: getStat('href="/admin/posts\\?status=archived"'),
        pendingComments: getStat('href="/admin/comments\\?status=pending"'),
        approvedComments: getStat('href="/admin/comments\\?status=approved"')
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
    if (idx === -1) throw new Error('Could not find #commentsList in post detail HTML');
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

function discoverHeadlessBrowser() {
    if (process.env.NEOBLOG_E2E_BROWSER && fs.existsSync(process.env.NEOBLOG_E2E_BROWSER)) {
        return process.env.NEOBLOG_E2E_BROWSER;
    }
    const candidates = process.platform === 'win32'
        ? [
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
        ]
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/microsoft-edge',
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
        ];

    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

class NativeCdpClient {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.ws = null;
        this.nextId = 1;
        this.pending = new Map();
        this.loadWaiters = [];
        this.jsErrors = [];
    }

    async connect() {
        await new Promise((resolve, reject) => {
            const ws = new WebSocket(this.wsUrl);
            this.ws = ws;
            const timer = setTimeout(() => reject(new Error('Timed out connecting CDP WebSocket')), 10000);
            ws.addEventListener('open', () => {
                clearTimeout(timer);
                resolve();
            });
            ws.addEventListener('error', (ev) => {
                clearTimeout(timer);
                reject(new Error(`CDP WebSocket error: ${ev.message || 'connection failed'}`));
            });
            ws.addEventListener('message', (ev) => {
                let msg;
                try {
                    msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
                } catch {
                    return;
                }
                if (msg.id && this.pending.has(msg.id)) {
                    const entry = this.pending.get(msg.id);
                    this.pending.delete(msg.id);
                    clearTimeout(entry.timer);
                    if (msg.error) {
                        entry.reject(new Error(`CDP error (${msg.error.code}): ${msg.error.message}`));
                    } else {
                        entry.resolve(msg.result);
                    }
                    return;
                }
                if (msg.method === 'Page.loadEventFired') {
                    const waiters = this.loadWaiters.splice(0, this.loadWaiters.length);
                    for (const waiter of waiters) {
                        clearTimeout(waiter.timer);
                        waiter.resolve();
                    }
                } else if (msg.method === 'Runtime.exceptionThrown') {
                    const ex = msg.params?.exceptionDetails;
                    const text = ex?.exception?.description || ex?.text || 'Uncaught JS exception';
                    this.jsErrors.push(text);
                } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
                    const args = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
                    this.jsErrors.push(`console.error: ${args}`);
                }
            });
        });
    }

    send(method, params = {}, timeoutMs = 15000) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error(`CDP WebSocket not open for ${method}`));
        }
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`CDP command timed out: ${method}`));
            }, timeoutMs);
            this.pending.set(id, { resolve, reject, timer });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluate(expression) {
        const res = await this.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true
        });
        if (res?.exceptionDetails) {
            throw new Error(`Browser evaluate failed: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`);
        }
        return res?.result?.value;
    }

    async waitFor(fnExpr, timeoutMs = 10000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const ok = await this.evaluate(`Boolean(${fnExpr})`).catch(() => false);
            if (ok) return;
            await delay(100);
        }
        throw new Error(`Timed out waiting for browser condition: ${fnExpr}`);
    }

    waitForLoadEvent(timeoutMs = 15000) {
        return new Promise((resolve, reject) => {
            const waiter = { resolve, reject, timer: null };
            waiter.timer = setTimeout(() => {
                this.loadWaiters = this.loadWaiters.filter((w) => w !== waiter);
                reject(new Error('Timed out waiting for CDP Page.loadEventFired'));
            }, timeoutMs);
            this.loadWaiters.push(waiter);
        });
    }

    async navigateAndWait(url) {
        const loadPromise = this.waitForLoadEvent(15000);
        try {
            const navRes = await this.send('Page.navigate', { url });
            if (navRes?.errorText) {
                throw new Error(`CDP Page.navigate failed for ${url}: ${navRes.errorText}`);
            }
            await loadPromise;
            await this.waitFor('document.readyState === "complete"');
        } catch (err) {
            loadPromise.catch(() => {});
            throw err;
        }
    }

    close() {
        for (const entry of this.pending.values()) {
            clearTimeout(entry.timer);
        }
        this.pending.clear();
        for (const waiter of this.loadWaiters) {
            clearTimeout(waiter.timer);
            waiter.reject(new Error('CDP client closed while waiting for Page.loadEventFired'));
        }
        this.loadWaiters = [];
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            try {
                this.ws.close();
            } catch {
                // Ignore close error
            }
        }
    }
}

export function registerTests() {
    return [
        {
            id: 'T4-01',
            tier: 4,
            feature: 'F7',
            milestone: 'm3',
            name: 'Full Editorial Publishing & Community Discussion (Editor -> Reader -> Admin)',
            run: async (ctx) => {
                const { assert } = ctx;
                await ctx.db.resetDb();

                // 1. Editor logs in and inspects baseline stats + create form
                const { client: editorJar, csrf: editorCsrf, dashRes } = await loginAdminOrEditor(
                    ctx,
                    'editor',
                    'editor123'
                );
                const stats = extractDashboardAllStats(dashRes.text);
                assert.strictEqual(stats.total, 4);
                assert.strictEqual(stats.published, 2);
                assert.strictEqual(stats.draft, 1);
                assert.strictEqual(stats.archived, 1);
                assert.strictEqual(stats.pendingComments, 2);
                assert.strictEqual(stats.approvedComments, 2);

                const createForm = await editorJar.get('/admin/posts/create');
                assert.assertStatus(createForm, 200);
                assert.assertNoPhpErrors(createForm);

                // 2. Editor creates formatted draft
                const marker = `T401-${ctx.uid}`;
                const slug = `panduan-editorial-${ctx.uid}`;
                assert.assertRedirect(
                    await editorJar.postForm('/admin/posts', {
                        csrf_token: editorCsrf,
                        title: `Draf Awal ${marker}`,
                        slug,
                        category_id: '1',
                        excerpt: `Ringkasan awal ${marker}`,
                        content: `<p>Paragraf pembuka ${marker}</p><h3>Subjudul Teknis</h3><ul><li>Poin pertama</li></ul><p><code>echo 'neoblog';</code></p>`,
                        reading_time: '5',
                        status: 'draft'
                    }),
                    /\/admin\/posts/
                );

                // 3. Draft invisible publicly
                const anon = ctx.createClient(ctx.baseUrl);
                assert.assertNotIncludes(await anon.get('/'), marker);
                assert.assertStatus(await anon.get(`/post/${slug}`), 404);

                // 4. Editor refines draft and publishes
                const postId = await findPostIdByMarker(ctx, editorJar, marker, 'draft');
                assert.assertStatus(await editorJar.get(`/admin/posts/${postId}/edit`), 200);

                const finalTitle = `Rilis Editorial Final ${marker}`;
                assert.assertRedirect(
                    await editorJar.postForm(`/admin/posts/${postId}/update`, {
                        csrf_token: editorCsrf,
                        title: finalTitle,
                        slug,
                        category_id: '1',
                        excerpt: `Ringkasan final ${marker}`,
                        content: `<p>Paragraf pembuka ${marker}</p><h3>Subjudul Teknis</h3><ul><li>Poin pertama</li></ul><p><code>echo 'neoblog';</code></p>`,
                        reading_time: '6',
                        status: 'draft'
                    }),
                    /\/admin\/posts/
                );

                assert.assertRedirect(
                    await editorJar.postForm(`/admin/posts/${postId}/status`, {
                        csrf_token: editorCsrf,
                        status: 'published'
                    }),
                    /\/admin\/posts/
                );

                // 5. Reader discovers published article and submits valid comment
                const homeRes = await anon.get('/');
                assert.assertStatus(homeRes, 200);
                assert.assertIncludes(homeRes, finalTitle);

                const detailRes = await anon.get(`/post/${slug}`);
                assert.assertStatus(detailRes, 200);
                const detailContent = extractPostDetailContent(detailRes.text);
                assert.assertIncludes(detailContent, '<h3>Subjudul Teknis</h3>');
                assert.assertIncludes(detailContent, '<ul><li>Poin pertama</li></ul>');
                assert.assertIncludes(detailContent, '<code>');

                const readerComment = `Komentar Pembaca ${marker}`;
                const cSub = await submitPublicComment(ctx, slug, {
                    authorName: 'Pembaca Setia',
                    authorEmail: 'pembaca@example.com',
                    commentText: readerComment
                });
                assert.assertStatusIn(cSub.res, [200, 201]);
                assert.assertJson(cSub.res, { success: true, is_approved: 1, status: 'approved' });

                // 6. Admin reviews approved comment and replies
                const { client: adminJar, csrf: adminCsrf } = await loginAdminOrEditor(ctx, 'admin', 'admin123');
                const approvedPage = await adminJar.get('/admin/comments', { query: { status: 'approved' } });
                assert.assertStatus(approvedPage, 200);
                assert.assertIncludes(approvedPage, readerComment);

                const cid = extractJsonEntityId(cSub.res.json(), 'comment')
                    || (await findCommentIdByMarker(ctx, adminJar, readerComment, 'approved'));
                const adminReply = `Terima kasih tanggapannya ${marker}`;
                assert.assertRedirect(
                    await adminJar.postForm(`/admin/comments/${cid}/reply`, {
                        csrf_token: adminCsrf,
                        comment_text: adminReply
                    }),
                    /\/admin\/comments/
                );

                // 7. Reader sees article, comment, and nested Admin reply
                const finalDetail = await anon.get(`/post/${slug}`);
                assert.assertStatus(finalDetail, 200);
                assert.strictEqual(extractDetailCommentCount(finalDetail.text), 2);
                const listHtml = extractCommentsListHtml(finalDetail.text);
                assert.ok(
                    listHtml.indexOf(readerComment) < listHtml.indexOf(adminReply),
                    'Expected admin reply nested after reader comment'
                );
                const replyBlock = extractCommentItemBlock(listHtml, adminReply);
                assert.ok(replyBlock, 'Expected admin reply block');
                assert.assertMatch(replyBlock, /badge[^>]*>\s*Admin\s*</i);

                // 8. Clean logout for both editor and admin
                assert.assertRedirect(
                    await editorJar.postForm('/admin/logout', { csrf_token: editorCsrf }),
                    /\/(?:admin\/)?login/
                );
                assert.assertRedirect(
                    await adminJar.postForm('/admin/logout', { csrf_token: adminCsrf }),
                    /\/(?:admin\/)?login/
                );
                assert.assertRedirect(await editorJar.get('/admin'), /\/(?:admin\/)?login/);
                assert.assertRedirect(await adminJar.get('/admin'), /\/(?:admin\/)?login/);
            }
        },
        {
            id: 'T4-02',
            tier: 4,
            feature: 'F5',
            milestone: 'm3',
            name: 'Adversarial Defense: Unauthorized Probe + Spam Holding + Stored XSS Mitigation',
            run: async (ctx) => {
                const { assert } = ctx;
                await ctx.db.resetDb();

                // 1. Unauthenticated probes (HTML 302 vs AJAX 401)
                const anon = ctx.createClient(ctx.baseUrl);
                for (const route of ['/admin', '/admin/posts', '/admin/comments']) {
                    const htmlRes = await anon.get(route);
                    assert.assertRedirect(htmlRes, /\/(?:admin\/)?login/);
                    const ajaxRes = await anon.get(route, { ajax: true });
                    assert.assertStatus(ajaxRes, 401);
                    assert.assertJson(ajaxRes, { success: false });
                }

                // 2. Author account blocked from CMS login and mutations
                const authorAttempt = await loginAs(ctx, 'author', 'author123');
                assert.assertStatus(authorAttempt.loginRes, 403);
                const authorPostsRes = await authorAttempt.client.postForm('/admin/posts', {
                    title: 'Author Probe',
                    content: '<p>Should fail</p>'
                });
                assert.ok(
                    authorPostsRes.status === 401 || authorPostsRes.status === 403 || authorPostsRes.status === 302,
                    `Expected author mutation rejection, got ${authorPostsRes.status}`
                );

                // 3. Spam + XSS comment held pending and never rendered publicly
                const marker = `T402-${ctx.uid}`;
                const spamSubmit = await submitPublicComment(ctx, SAMPLE_POST_1_SLUG, {
                    authorName: `Attacker <b onclick=alert(1)>${marker}</b>`,
                    authorEmail: 'attacker@example.com',
                    commentText: `Promo judi online <script>alert('xss-${marker}')</script> ${marker}`
                });
                assert.assertStatusIn(spamSubmit.res, [200, 201]);
                assert.assertJson(spamSubmit.res, { success: true, is_approved: 0, status: 'pending' });

                const publicCheck = await anon.get(`/post/${SAMPLE_POST_1_SLUG}`);
                assert.assertNotIncludes(publicCheck, marker);
                assert.assertNotIncludes(publicCheck, `<script>alert('xss-${marker}')</script>`);

                // 4. Admin inspects pending queue (entity-escaped) and deletes spam
                const { client: adminJar, csrf } = await loginAdminOrEditor(ctx, 'admin', 'admin123');
                const pendingPage = await adminJar.get('/admin/comments', { query: { status: 'pending' } });
                assert.assertStatus(pendingPage, 200);
                assert.assertIncludes(pendingPage, marker);
                assert.assertNotIncludes(pendingPage, `<script>alert('xss-${marker}')</script>`);
                assert.assertIncludes(pendingPage, '&lt;script&gt;');

                const spamId = extractJsonEntityId(spamSubmit.res.json(), 'comment')
                    || (await findCommentIdByMarker(ctx, adminJar, marker, 'pending'));
                assert.assertRedirect(
                    await adminJar.postForm(`/admin/comments/${spamId}/delete`, { csrf_token: csrf }),
                    /\/admin\/comments/
                );
                assert.assertNotIncludes(await adminJar.get('/admin/comments', { query: { status: 'pending' } }), marker);

                // 5. Article XSS vectors sanitized via cleanHtml()
                const xssSlug = `t4-02-xss-${ctx.uid}`;
                assert.assertRedirect(
                    await adminJar.postForm('/admin/posts', {
                        csrf_token: csrf,
                        title: `Artikel Aman ${marker}`,
                        slug: xssSlug,
                        category_id: '1',
                        excerpt: `Ex <script>alert('ex')</script> ${marker}`,
                        content: `<p>Aman ${marker}</p><script>alert('body-${marker}')</script><img src="https://example.test/x.png" onerror="alert('img')"><a href="javascript:alert('link')">Klik</a>`,
                        reading_time: '3',
                        status: 'published'
                    }),
                    /\/admin\/posts/
                );

                const xssDetail = await anon.get(`/post/${xssSlug}`);
                assert.assertStatus(xssDetail, 200);
                const contentHtml = extractPostDetailContent(xssDetail.text);
                assert.assertIncludes(contentHtml, `<p>Aman ${marker}</p>`);
                assert.assertNotIncludes(contentHtml, '<script');
                assert.assertNotIncludes(contentHtml, 'onerror=');
                assert.assertNotIncludes(contentHtml, 'javascript:');
                assert.assertNotIncludes(xssDetail.text, `<script>alert('ex')</script>`);
            }
        },
        {
            id: 'T4-03',
            tier: 4,
            feature: 'F8',
            milestone: 'm3',
            name: 'Article Sunset Lifecycle (Published -> Archived -> Restored -> Deleted)',
            run: async (ctx) => {
                const { assert } = ctx;
                await ctx.db.resetDb();

                const { client: adminJar, csrf } = await loginAdminOrEditor(ctx, 'admin', 'admin123');
                const marker = `T403-${ctx.uid}`;
                const slug = `sunset-t403-${ctx.uid}`;

                // 1. Publish announcement
                assert.assertRedirect(
                    await adminJar.postForm('/admin/posts', {
                        csrf_token: csrf,
                        title: `Pengumuman Terbatas ${marker}`,
                        slug,
                        category_id: '1',
                        excerpt: `Ex ${marker}`,
                        content: `<p>Konten pengumuman ${marker}</p>`,
                        reading_time: '2',
                        status: 'published'
                    }),
                    /\/admin\/posts/
                );
                const postId = await findPostIdByMarker(ctx, adminJar, marker, 'published');

                // 2. Reader views and leaves 2 approved comments
                const anon = ctx.createClient(ctx.baseUrl);
                assert.assertStatus(await anon.get(`/post/${slug}`), 200);
                const c1 = `SunsetC1-${marker}`;
                const c2 = `SunsetC2-${marker}`;
                await submitPublicComment(ctx, slug, { authorName: 'R1', authorEmail: 'r1@example.com', commentText: c1 });
                await submitPublicComment(ctx, slug, { authorName: 'R2', authorEmail: 'r2@example.com', commentText: c2 });
                assert.strictEqual(extractDetailCommentCount((await anon.get(`/post/${slug}`)).text), 2);

                // 3. Archive post
                assert.assertRedirect(
                    await adminJar.postForm(`/admin/posts/${postId}/status`, { csrf_token: csrf, status: 'archived' }),
                    /\/admin\/posts/
                );
                assert.assertNotIncludes(await anon.get('/'), marker);
                assert.assertStatus(await anon.get(`/post/${slug}`), 404);

                const pubPage = await anon.get(`/post/${SAMPLE_POST_1_SLUG}`);
                const pubCsrf = ctx.http.extractCsrfToken(pubPage.text);
                const blockedComment = await anon.postAjax('/api/comments', {
                    csrf_token: pubCsrf,
                    post_id: String(postId),
                    author_name: 'Late',
                    author_email: 'late@example.com',
                    comment_text: 'Too late'
                });
                assert.assertStatusIn(blockedComment, [400, 404, 422]);

                // 4. Transition archived -> draft -> published
                assert.assertIncludes(await adminJar.get('/admin/posts', { query: { status: 'archived' } }), marker);
                assert.assertRedirect(
                    await adminJar.postForm(`/admin/posts/${postId}/status`, { csrf_token: csrf, status: 'draft' }),
                    /\/admin\/posts/
                );
                assert.assertIncludes(await adminJar.get('/admin/posts', { query: { status: 'draft' } }), marker);
                assert.assertRedirect(
                    await adminJar.postForm(`/admin/posts/${postId}/status`, { csrf_token: csrf, status: 'published' }),
                    /\/admin\/posts/
                );

                // 5. Restored post retains prior comments
                const restored = await anon.get(`/post/${slug}`);
                assert.assertStatus(restored, 200);
                assert.assertIncludes(restored, c1);
                assert.assertIncludes(restored, c2);
                assert.strictEqual(extractDetailCommentCount(restored.text), 2);

                // 6. Delete post -> cascades cleanly
                assert.assertRedirect(
                    await adminJar.postForm(`/admin/posts/${postId}/delete`, { csrf_token: csrf }),
                    /\/admin\/posts/
                );
                assert.assertNotIncludes(await anon.get('/'), marker);
                assert.assertStatus(await anon.get(`/post/${slug}`), 404);
                assert.assertNotIncludes(await adminJar.get('/admin/posts', { query: { status: 'all' } }), marker);
                const commentsAdmin = await adminJar.get('/admin/comments');
                assert.assertNotIncludes(commentsAdmin, c1);
                assert.assertNotIncludes(commentsAdmin, c2);
            }
        },
        {
            id: 'T4-04',
            tier: 4,
            feature: 'F10',
            milestone: 'm3',
            name: 'Comment Moderation Queue Triage (Approve False-Positive, Delete Spam, Hide Off-Topic, Reply)',
            run: async (ctx) => {
                const { assert } = ctx;
                await ctx.db.resetDb();

                const marker = `T404-${ctx.uid}`;
                const v1 = `Valid1-${marker}`;
                const v2 = `Valid2-${marker}`;
                const v3 = `OffTopic3-${marker}`;
                const s1 = `Diskusi casino sejarah ${marker}`;
                const s2 = `Beli viagra murah ${marker}`;

                const rV1 = await submitPublicComment(ctx, SAMPLE_POST_1_SLUG, { authorName: 'U1', authorEmail: 'u1@example.com', commentText: v1 });
                const rV2 = await submitPublicComment(ctx, SAMPLE_POST_1_SLUG, { authorName: 'U2', authorEmail: 'u2@example.com', commentText: v2 });
                const rV3 = await submitPublicComment(ctx, SAMPLE_POST_2_SLUG, { authorName: 'U3', authorEmail: 'u3@example.com', commentText: v3 });
                const rS1 = await submitPublicComment(ctx, SAMPLE_POST_1_SLUG, { authorName: 'U4', authorEmail: 'u4@example.com', commentText: s1 });
                const rS2 = await submitPublicComment(ctx, SAMPLE_POST_2_SLUG, { authorName: 'U5', authorEmail: 'u5@example.com', commentText: s2 });

                const { client: adminJar, csrf } = await loginAdminOrEditor(ctx, 'admin', 'admin123');

                const pendingPage = await adminJar.get('/admin/comments', { query: { status: 'pending' } });
                assert.assertStatus(pendingPage, 200);
                assert.assertIncludes(pendingPage, s1);
                assert.assertIncludes(pendingPage, s2);
                assert.assertNotIncludes(pendingPage, v1);
                assert.assertNotIncludes(pendingPage, v2);
                assert.assertNotIncludes(pendingPage, v3);

                const s1Id = extractJsonEntityId(rS1.res.json(), 'comment') || (await findCommentIdByMarker(ctx, adminJar, s1, 'pending'));
                const s2Id = extractJsonEntityId(rS2.res.json(), 'comment') || (await findCommentIdByMarker(ctx, adminJar, s2, 'pending'));
                const v1Id = extractJsonEntityId(rV1.res.json(), 'comment') || (await findCommentIdByMarker(ctx, adminJar, v1, 'approved'));
                const v2Id = extractJsonEntityId(rV2.res.json(), 'comment') || (await findCommentIdByMarker(ctx, adminJar, v2, 'approved'));
                const v3Id = extractJsonEntityId(rV3.res.json(), 'comment') || (await findCommentIdByMarker(ctx, adminJar, v3, 'approved'));

                // Approve false-positive S1, delete true spam S2
                assert.assertRedirect(await adminJar.postForm(`/admin/comments/${s1Id}/approve`, { csrf_token: csrf }), /\/admin\/comments/);
                assert.assertRedirect(await adminJar.postForm(`/admin/comments/${s2Id}/delete`, { csrf_token: csrf }), /\/admin\/comments/);

                // Inspect approved queue, hide V3, reply to V1 and V2
                const approvedPage = await adminJar.get('/admin/comments', { query: { status: 'approved' } });
                assert.assertIncludes(approvedPage, v1);
                assert.assertIncludes(approvedPage, v2);
                assert.assertIncludes(approvedPage, v3);
                assert.assertIncludes(approvedPage, s1);

                assert.assertRedirect(await adminJar.postForm(`/admin/comments/${v3Id}/hide`, { csrf_token: csrf }), /\/admin\/comments/);

                const rep1 = `ReplyV1-${marker}`;
                const rep2 = `ReplyV2-${marker}`;
                assert.assertRedirect(await adminJar.postForm(`/admin/comments/${v1Id}/reply`, { csrf_token: csrf, comment_text: rep1 }), /\/admin\/comments/);
                assert.assertRedirect(await adminJar.postForm(`/admin/comments/${v2Id}/reply`, { csrf_token: csrf, comment_text: rep2 }), /\/admin\/comments/);

                // Verify public visibility and exact counts
                const anon = ctx.createClient(ctx.baseUrl);
                const homeRes = await anon.get('/');
                assert.strictEqual(extractHomeCardCommentCount(homeRes.text, SAMPLE_POST_1_SLUG), 7);
                assert.strictEqual(extractHomeCardCommentCount(homeRes.text, SAMPLE_POST_2_SLUG), 0);

                const p1Res = await anon.get(`/post/${SAMPLE_POST_1_SLUG}`);
                assert.strictEqual(extractDetailCommentCount(p1Res.text), 7);
                assert.assertIncludes(p1Res, v1);
                assert.assertIncludes(p1Res, rep1);
                assert.assertIncludes(p1Res, v2);
                assert.assertIncludes(p1Res, rep2);
                assert.assertIncludes(p1Res, s1);
                assert.assertNotIncludes(p1Res, s2);
                assert.assertNotIncludes(p1Res, v3);

                const p2Res = await anon.get(`/post/${SAMPLE_POST_2_SLUG}`);
                assert.strictEqual(extractDetailCommentCount(p2Res.text), 0);
                assert.assertNotIncludes(p2Res, v3);
                assert.assertNotIncludes(p2Res, s2);
            }
        },
        {
            id: 'T4-05',
            tier: 4,
            feature: 'F2',
            milestone: 'm2',
            name: 'Cross-Role Collaboration (Author Denied -> Editor Drafts -> Admin Publishes & Moderates)',
            run: async (ctx) => {
                const { assert } = ctx;
                await ctx.db.resetDb();

                // 1. Author blocked
                const authorAttempt = await loginAs(ctx, 'author', 'author123');
                assert.assertStatus(authorAttempt.loginRes, 403);
                const authorDash = await authorAttempt.client.get('/admin');
                assert.ok(authorDash.status === 403 || authorDash.status === 302);

                // 2. Editor creates 2 drafts D1 & D2 and logs out
                const { client: editorJar, csrf: editorCsrf } = await loginAdminOrEditor(ctx, 'editor', 'editor123');
                const marker = `T405-${ctx.uid}`;
                const d1Slug = `collab-d1-${ctx.uid}`;
                const d2Slug = `collab-d2-${ctx.uid}`;

                assert.assertRedirect(
                    await editorJar.postForm('/admin/posts', {
                        csrf_token: editorCsrf,
                        title: `Draf Kolaborasi D1 ${marker}`,
                        slug: d1Slug,
                        category_id: '2',
                        excerpt: `Ex D1 ${marker}`,
                        content: `<p>Konten D1 ${marker}</p>`,
                        reading_time: '5',
                        status: 'draft'
                    }),
                    /\/admin\/posts/
                );
                assert.assertRedirect(
                    await editorJar.postForm('/admin/posts', {
                        csrf_token: editorCsrf,
                        title: `Draf Kolaborasi D2 ${marker}`,
                        slug: d2Slug,
                        category_id: '3',
                        excerpt: `Ex D2 ${marker}`,
                        content: `<p>Konten D2 ${marker}</p>`,
                        reading_time: '4',
                        status: 'draft'
                    }),
                    /\/admin\/posts/
                );

                const draftsPage = await editorJar.get('/admin/posts', { query: { status: 'draft' } });
                assert.assertIncludes(draftsPage, d1Slug);
                assert.assertIncludes(draftsPage, d2Slug);

                const d1Id = await findPostIdByMarker(ctx, editorJar, `Draf Kolaborasi D1 ${marker}`, 'draft');
                const d2Id = await findPostIdByMarker(ctx, editorJar, `Draf Kolaborasi D2 ${marker}`, 'draft');

                assert.assertRedirect(await editorJar.postForm('/admin/logout', { csrf_token: editorCsrf }), /\/(?:admin\/)?login/);

                // 3. Admin refines & publishes D1, archives D2, moderates comment on D1, logs out
                const { client: adminJar, csrf: adminCsrf } = await loginAdminOrEditor(ctx, 'admin', 'admin123');
                assert.assertRedirect(
                    await adminJar.postForm(`/admin/posts/${d1Id}/update`, {
                        csrf_token: adminCsrf,
                        title: `Publikasi Kolaborasi D1 ${marker}`,
                        slug: d1Slug,
                        category_id: '2',
                        excerpt: `Ex D1 Final ${marker}`,
                        content: `<p>Konten D1 Final ${marker}</p>`,
                        reading_time: '6',
                        status: 'published'
                    }),
                    /\/admin\/posts/
                );
                assert.assertRedirect(
                    await adminJar.postForm(`/admin/posts/${d2Id}/status`, {
                        csrf_token: adminCsrf,
                        status: 'archived'
                    }),
                    /\/admin\/posts/
                );

                const anon = ctx.createClient(ctx.baseUrl);
                const cMarker = `CommentD1-${marker}`;
                const cSub = await submitPublicComment(ctx, d1Slug, {
                    authorName: 'Pembaca Kolaborasi',
                    authorEmail: 'collab@example.com',
                    commentText: cMarker
                });
                assert.assertStatusIn(cSub.res, [200, 201]);
                const cid = extractJsonEntityId(cSub.res.json(), 'comment')
                    || (await findCommentIdByMarker(ctx, adminJar, cMarker, 'approved'));

                const replyMarker = `ModerasiAdmin-${marker}`;
                assert.assertRedirect(
                    await adminJar.postForm(`/admin/comments/${cid}/reply`, {
                        csrf_token: adminCsrf,
                        comment_text: replyMarker
                    }),
                    /\/admin\/comments/
                );
                assert.assertRedirect(await adminJar.postForm('/admin/logout', { csrf_token: adminCsrf }), /\/(?:admin\/)?login/);

                // 4. Reader verifies D1 author attribution (Editor NeoBlog) & D2 unavailable
                const d1Detail = await anon.get(`/post/${d1Slug}`);
                assert.assertStatus(d1Detail, 200);
                assert.assertIncludes(d1Detail, 'Editor NeoBlog');
                assert.assertIncludes(d1Detail, cMarker);
                assert.assertIncludes(d1Detail, replyMarker);

                assert.assertStatus(await anon.get(`/post/${d2Slug}`), 404);
            }
        },
        {
            id: 'T4-06',
            tier: 4,
            feature: 'F5',
            milestone: 'm3',
            name: 'AJAX-First Admin CMS Operations (X-Requested-With + X-CSRF-Token)',
            run: async (ctx) => {
                const { assert } = ctx;
                await ctx.db.resetDb();

                // 1. AJAX login
                const adminJar = ctx.createClient(ctx.baseUrl);
                const loginPage = await adminJar.get('/admin/login');
                const loginCsrf = ctx.http.extractCsrfToken(loginPage.text);
                const ajaxLogin = await adminJar.postAjax('/admin/login', {
                    csrf_token: loginCsrf,
                    identifier: 'admin',
                    password: 'admin123'
                });
                assert.assertStatus(ajaxLogin, 200);
                assert.assertJson(ajaxLogin, (data) => {
                    assert.strictEqual(data.success, true);
                    assert.ok(data.user && data.user.username === 'admin' && data.user.role === 'admin');
                    assert.strictEqual(data.user.password_hash, undefined);
                });

                const dashRes = await adminJar.get('/admin');
                assert.assertStatus(dashRes, 200);
                const csrf = ctx.http.extractCsrfToken(dashRes.text);
                assert.ok(csrf, 'Expected CSRF token on /admin');

                // 2. AJAX create draft -> update -> publish
                const marker = `T406-${ctx.uid}`;
                const slug = `ajax-cms-${ctx.uid}`;
                const createRes = await adminJar.postAjax(
                    '/admin/posts',
                    {
                        title: `Ajax Draft ${marker}`,
                        slug,
                        category_id: '1',
                        excerpt: `Ex ${marker}`,
                        content: `<p>Draft ${marker}</p>`,
                        reading_time: '3',
                        status: 'draft'
                    },
                    { csrfToken: csrf }
                );
                assert.assertStatusIn(createRes, [200, 201]);
                const createData = assert.assertJson(createRes, { success: true });
                const postId = extractJsonEntityId(createData, 'post')
                    || (await findPostIdByMarker(ctx, adminJar, `Ajax Draft ${marker}`, 'draft'));

                const updRes = await adminJar.postAjax(
                    `/admin/posts/${postId}/update`,
                    {
                        title: `Ajax Published ${marker}`,
                        slug,
                        category_id: '2',
                        excerpt: `Ex2 ${marker}`,
                        content: `<p>Published ${marker}</p>`,
                        reading_time: '7',
                        status: 'draft'
                    },
                    { csrfToken: csrf }
                );
                assert.assertStatus(updRes, 200);
                assert.assertJson(updRes, { success: true });

                const pubRes = await adminJar.postAjax(
                    `/admin/posts/${postId}/status`,
                    { status: 'published' },
                    { csrfToken: csrf }
                );
                assert.assertStatus(pubRes, 200);
                assert.assertJson(pubRes, { success: true });

                // 3. Reader posts 2 comments; Admin exercises AJAX hide, approve, reply, delete
                const c1Text = `AjaxKeep-${marker}`;
                const c2Text = `AjaxDrop-${marker}`;
                const c1Sub = await submitPublicComment(ctx, slug, { authorName: 'AK1', authorEmail: 'ak1@example.com', commentText: c1Text });
                const c2Sub = await submitPublicComment(ctx, slug, { authorName: 'AK2', authorEmail: 'ak2@example.com', commentText: c2Text });

                const c1Id = extractJsonEntityId(c1Sub.res.json(), 'comment') || (await findCommentIdByMarker(ctx, adminJar, c1Text, 'approved'));
                const c2Id = extractJsonEntityId(c2Sub.res.json(), 'comment') || (await findCommentIdByMarker(ctx, adminJar, c2Text, 'approved'));

                assert.assertJson(await adminJar.postAjax(`/admin/comments/${c1Id}/hide`, {}, { csrfToken: csrf }), { success: true });
                assert.assertJson(await adminJar.postAjax(`/admin/comments/${c1Id}/approve`, {}, { csrfToken: csrf }), { success: true });

                const replyText = `AjaxReply-${marker}`;
                assert.assertJson(
                    await adminJar.postAjax(`/admin/comments/${c1Id}/reply`, { comment_text: replyText }, { csrfToken: csrf }),
                    { success: true }
                );
                assert.assertJson(await adminJar.postAjax(`/admin/comments/${c2Id}/delete`, {}, { csrfToken: csrf }), { success: true });

                // 4. Verify persistence across admin and public HTML pages
                const postsPage = await adminJar.get('/admin/posts', { query: { status: 'published' } });
                assert.assertIncludes(postsPage, `Ajax Published ${marker}`);

                const commentsPage = await adminJar.get('/admin/comments');
                assert.assertIncludes(commentsPage, c1Text);
                assert.assertIncludes(commentsPage, replyText);
                assert.assertNotIncludes(commentsPage, c2Text);

                const anon = ctx.createClient(ctx.baseUrl);
                const detail = await anon.get(`/post/${slug}`);
                assert.assertStatus(detail, 200);
                assert.assertIncludes(detail, `Ajax Published ${marker}`);
                assert.assertIncludes(detail, `Published ${marker}`);
                assert.assertIncludes(detail, c1Text);
                assert.assertIncludes(detail, replyText);
                assert.assertNotIncludes(detail, c2Text);
                assert.strictEqual(extractDetailCommentCount(detail.text), 2);
            }
        },
        {
            id: 'T4-07',
            tier: 4,
            feature: 'F12',
            milestone: 'm3',
            name: 'Headless Browser DOM & Vanilla JS Smoke Verification (Edge/Chrome CDP)',
            run: async (ctx) => {
                const { assert } = ctx;
                await ctx.db.resetDb();

                const browserBin = discoverHeadlessBrowser();
                if (!browserBin) {
                    if (process.platform === 'win32') {
                        assert.fail('Expected msedge.exe or chrome.exe on Windows for T4-07 headless browser verification.');
                    }
                    console.log('        [T4-07] Notice: No headless Chromium/Edge binary found in non-Windows environment; skipping browser launch.');
                    return;
                }

                const debugPort = await allocateFreePort('127.0.0.1');
                const tmpBase = process.env.NEOBLOG_E2E_TMPDIR || os.tmpdir();
                const userDataDir = path.join(tmpBase, `neoblog-e2e-browser-${process.pid}-${ctx.uid}`);
                fs.mkdirSync(userDataDir, { recursive: true });

                const args = [
                    '--headless=new',
                    '--disable-gpu',
                    '--no-first-run',
                    '--no-default-browser-check',
                    `--remote-debugging-port=${debugPort}`,
                    `--user-data-dir=${userDataDir}`
                ];
                if (process.platform !== 'win32') {
                    args.push('--no-sandbox');
                }
                args.push('about:blank');

                let browserProc = null;
                let browserExited = false;
                let cdp = null;

                try {
                    browserProc = spawn(browserBin, args, {
                        stdio: ['ignore', 'ignore', 'ignore'],
                        windowsHide: true
                    });
                    const exitPromise = new Promise((resolve) => {
                        browserProc.once('close', () => {
                            browserExited = true;
                            resolve();
                        });
                    });

                    // Discover page WebSocket target
                    let pageWsUrl = null;
                    const deadline = Date.now() + 15000;
                    while (Date.now() < deadline) {
                        if (browserExited) {
                            throw new Error('Headless browser exited prematurely before CDP became ready.');
                        }
                        try {
                            const r = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
                            if (r.ok) {
                                const targets = await r.json();
                                const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
                                if (page) {
                                    pageWsUrl = page.webSocketDebuggerUrl;
                                    break;
                                }
                            }
                        } catch {
                            // Poll until DevTools HTTP endpoint listens
                        }
                        await delay(150);
                    }
                    assert.ok(pageWsUrl, 'Timed out waiting for headless browser CDP WebSocket URL');

                    cdp = new NativeCdpClient(pageWsUrl);
                    await cdp.connect();
                    await cdp.send('Page.enable');
                    await cdp.send('Runtime.enable');

                    // 1. Public Home / + Theme Toggle (main.js)
                    await cdp.navigateAndWait(`${ctx.baseUrl}/`);
                    const homeCheck = await cdp.evaluate(`(() => {
                        const cards = document.querySelectorAll('.post-card').length;
                        const btn = document.getElementById('themeToggleBtn');
                        const initialTheme = document.documentElement.getAttribute('data-theme');
                        if (btn) btn.click();
                        const toggledTheme = document.documentElement.getAttribute('data-theme');
                        const storedTheme = localStorage.getItem('neoblog_theme');
                        return { cards, hasBtn: Boolean(btn), initialTheme, toggledTheme, storedTheme };
                    })()`);
                    assert.ok(homeCheck.cards >= 2, `Expected >= 2 .post-card items, got ${homeCheck.cards}`);
                    assert.ok(homeCheck.hasBtn, 'Expected #themeToggleBtn on /');
                    assert.notStrictEqual(homeCheck.toggledTheme, homeCheck.initialTheme, 'Expected data-theme to toggle on click');
                    assert.strictEqual(homeCheck.storedTheme, homeCheck.toggledTheme);

                    // 2. Post Detail + Comment Form AJAX Submission (utils.js + comments.js)
                    await cdp.navigateAndWait(`${ctx.baseUrl}/post/${SAMPLE_POST_1_SLUG}`);
                    const marker = `BrowserT407-${ctx.uid}`;
                    const detailReady = await cdp.evaluate(`(() => {
                        return {
                            hasForm: Boolean(document.getElementById('commentForm')),
                            hasList: Boolean(document.getElementById('commentsList')),
                            loadedUtils: Array.from(document.scripts).some((s) => s.src.includes('/assets/js/utils.js'))
                        };
                    })()`);
                    assert.ok(detailReady.hasForm && detailReady.hasList, 'Expected #commentForm and #commentsList in DOM');

                    await cdp.evaluate(`(() => {
                        document.getElementById('author_name').value = 'Browser User';
                        document.getElementById('author_email').value = 'browser@example.com';
                        document.getElementById('comment_text').value = ${JSON.stringify(marker)};
                        document.querySelector('#commentForm button[type="submit"]').click();
                    })()`);

                    await cdp.waitFor(
                        `document.getElementById('commentsList').innerText.includes(${JSON.stringify(marker)})`
                    );

                    // 3. Admin Login -> Dashboard DOM & admin.js
                    await cdp.navigateAndWait(`${ctx.baseUrl}/admin/login`);
                    const loginDom = await cdp.evaluate(`(() => {
                        return {
                            hasCard: Boolean(document.querySelector('.login-card')),
                            hasIdentifier: Boolean(document.getElementById('identifier')),
                            hasPassword: Boolean(document.getElementById('password'))
                        };
                    })()`);
                    assert.ok(loginDom.hasCard && loginDom.hasIdentifier && loginDom.hasPassword, 'Expected login card & inputs');

                    await cdp.evaluate(`(() => {
                        document.getElementById('identifier').value = 'admin';
                        document.getElementById('password').value = 'admin123';
                        document.querySelector('.login-form button[type="submit"]').click();
                    })()`);

                    await cdp.waitFor(
                        `window.location.pathname === '/admin' && document.readyState === 'complete'`
                    );

                    const adminDom = await cdp.evaluate(`(() => {
                        return {
                            path: window.location.pathname,
                            statCards: document.querySelectorAll('.stat-card').length,
                            text: document.body.innerText
                        };
                    })()`);
                    assert.strictEqual(adminDom.path, '/admin');
                    assert.ok(adminDom.statCards >= 6, `Expected >= 6 .stat-card elements, got ${adminDom.statCards}`);
                    assert.assertIncludes(adminDom.text, 'Dashboard CMS');
                    assert.ok(detailReady.loadedUtils, 'Expected /assets/js/utils.js to be loaded on post detail page');
                    assert.strictEqual(
                        cdp.jsErrors.length,
                        0,
                        `Expected zero uncaught JS console errors, got: ${cdp.jsErrors.join(' | ')}`
                    );

                    // Close browser gracefully before teardown
                    await cdp.send('Browser.close').catch(() => {});
                    cdp.close();
                    cdp = null;
                    await Promise.race([exitPromise, delay(3000)]);
                } finally {
                    if (cdp) {
                        cdp.close();
                    }
                    if (browserProc && !browserExited && browserProc.pid) {
                        if (process.platform === 'win32') {
                            await execFileAsync('taskkill', ['/PID', String(browserProc.pid), '/T', '/F']).catch(() => {});
                        } else {
                            try {
                                browserProc.kill('SIGKILL');
                            } catch {
                                // Ignore
                            }
                        }
                    }
                    fs.rmSync(userDataDir, {
                        recursive: true,
                        force: true,
                        maxRetries: 8,
                        retryDelay: 250
                    });
                }
            }
        }
    ];
}

export default { registerTests };
