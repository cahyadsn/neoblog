import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startDatabase } from './lib/db.js';
import { startServer } from './lib/server.js';
import * as httpLib from './lib/http.js';
import * as assertionsLib from './lib/assertions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const TIERS_DIR = path.join(__dirname, 'tiers');

const TIER_FILES = [
    { tier: 1, file: 'tier1_features.js', label: 'Tier 1: Feature Coverage' },
    { tier: 2, file: 'tier2_boundaries.js', label: 'Tier 2: Boundaries & Security' },
    { tier: 3, file: 'tier3_combinations.js', label: 'Tier 3: Cross-Feature Combinations' },
    { tier: 4, file: 'tier4_workflows.js', label: 'Tier 4: End-to-End Workflows' }
];

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function printHelp() {
    console.log(`NeoBlog Native E2E Test Runner

Usage:
  node tests/e2e/runner.js [options]

Options:
  --self-check            Start isolated DB + php -S, run harness self-check, resetDb, and clean up
  --tier=1|2|3|4|all      Filter by tier number or "all" (default: all)
  --milestone=m1|m2|m3|all Filter by milestone metadata (default: all)
  --feature=F1..F12       Filter by feature ID(s), comma-separated (e.g. --feature=F1,F2)
  --list                  List loaded tests without booting mysqld or php -S
  --keep-db               Keep temporary MySQL datadir after exit (for debugging)
  -h, --help              Show this help message
`);
}

function parseArgs(argv) {
    const opts = {
        selfCheck: false,
        tier: 'all',
        milestone: 'all',
        features: null,
        list: false,
        keepDb: false,
        help: false
    };

    for (const arg of argv) {
        if (arg === '--self-check') {
            opts.selfCheck = true;
        } else if (arg === '--list') {
            opts.list = true;
        } else if (arg === '--keep-db') {
            opts.keepDb = true;
        } else if (arg === '--help' || arg === '-h') {
            opts.help = true;
        } else if (arg.startsWith('--tier=')) {
            const val = arg.slice('--tier='.length).trim().toLowerCase();
            if (!['1', '2', '3', '4', 'all'].includes(val)) {
                throw new Error(`Invalid --tier value "${val}". Expected 1, 2, 3, 4, or all.`);
            }
            opts.tier = val;
        } else if (arg.startsWith('--milestone=')) {
            const val = arg.slice('--milestone='.length).trim().toLowerCase();
            if (!['m1', 'm2', 'm3', 'all'].includes(val)) {
                throw new Error(`Invalid --milestone value "${val}". Expected m1, m2, m3, or all.`);
            }
            opts.milestone = val;
        } else if (arg.startsWith('--feature=')) {
            const raw = arg.slice('--feature='.length).trim();
            const parts = raw
                .split(',')
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean);
            if (parts.length === 0) {
                throw new Error('Invalid --feature value: expected F1..F12.');
            }
            opts.features = new Set(parts);
        } else {
            throw new Error(`Unknown CLI argument: ${arg}`);
        }
    }

    return opts;
}

function createCombinedAssert() {
    const baseAssert = assertionsLib.assert;
    const combined = (...args) => baseAssert(...args);
    Object.assign(combined, baseAssert, assertionsLib);
    return combined;
}

async function loadTierModules(selectedTier) {
    const loaded = [];
    const skippedFiles = [];

    for (const spec of TIER_FILES) {
        if (selectedTier !== 'all' && Number(selectedTier) !== spec.tier) {
            continue;
        }

        const fullPath = path.join(TIERS_DIR, spec.file);
        if (!fs.existsSync(fullPath)) {
            skippedFiles.push({ ...spec, fullPath });
            continue;
        }

        const mod = await import(pathToFileURL(fullPath).href);
        const exported = mod.default && typeof mod.default === 'object' ? mod.default : mod;
        let tests;
        if (typeof exported.registerTests === 'function') {
            tests = await exported.registerTests();
        } else if (Array.isArray(exported.tests)) {
            tests = exported.tests;
        } else if (Array.isArray(mod.default)) {
            tests = mod.default;
        } else if (typeof mod.default === 'function') {
            tests = await mod.default();
        } else {
            throw new Error(`Tier module ${spec.file} must export registerTests() or tests array.`);
        }

        if (!Array.isArray(tests)) {
            throw new Error(`Tier module ${spec.file} did not return an array of tests.`);
        }

        const normalized = tests.map((t) => ({
            ...t,
            tier: t.tier ?? spec.tier,
            milestone: String(t.milestone || 'm1').toLowerCase(),
            feature: String(t.feature || '').toUpperCase()
        }));

        loaded.push({
            ...spec,
            beforeTier: typeof exported.beforeTier === 'function' ? exported.beforeTier : null,
            tests: normalized
        });
    }

    return { loaded, skippedFiles };
}

function filterTests(tests, opts) {
    return tests.filter((t) => {
        if (opts.milestone !== 'all' && String(t.milestone).toLowerCase() !== opts.milestone) {
            return false;
        }
        if (opts.features && !opts.features.has(String(t.feature).toUpperCase())) {
            return false;
        }
        return true;
    });
}

function getSelfCheckTests() {
    const assert = createCombinedAssert();
    const { createClient, extractCsrfToken, extractHiddenInput } = httpLib;
    const sampleSlug = 'membangun-web-modern-php-native-vanilla-stack';

    return [
        {
            id: 'SC-01',
            tier: 0,
            feature: 'SELF-CHECK',
            milestone: 'baseline',
            name: 'GET / returns 200 with seeded posts and zero PHP errors',
            run: async (ctx) => {
                const client = ctx.createClient(ctx.baseUrl);
                const res = await client.get('/');
                assert.assertStatus(res, 200);
                assert.assertNoPhpErrors(res);
                assert.assertIncludes(res, 'Membangun Web Modern dengan PHP Native');
                assert.assertIncludes(res, 'Evolusi Multi-Agent Systems');
            }
        },
        {
            id: 'SC-02',
            tier: 0,
            feature: 'SELF-CHECK',
            milestone: 'baseline',
            name: 'GET /post/{slug} returns 200 with valid CSRF token and post_id',
            run: async (ctx) => {
                const client = ctx.createClient(ctx.baseUrl);
                const res = await client.get(`/post/${sampleSlug}`);
                assert.assertStatus(res, 200);
                assert.assertNoPhpErrors(res);
                const csrfToken = extractCsrfToken(res.text);
                assert.ok(csrfToken && /^[0-9a-f]{64}$/i.test(csrfToken), `Expected 64-hex CSRF token, got ${csrfToken}`);
                const postId = extractHiddenInput(res.text, 'post_id');
                assert.strictEqual(postId, '1');
                assert.ok(client.getCookie('PHPSESSID'), 'Expected PHPSESSID cookie to be stored');
            }
        },
        {
            id: 'SC-03',
            tier: 0,
            feature: 'SELF-CHECK',
            milestone: 'baseline',
            name: 'POST /api/comments rejects invalid CSRF token with 403 JSON',
            run: async (ctx) => {
                const client = ctx.createClient(ctx.baseUrl);
                await client.get(`/post/${sampleSlug}`);
                const res = await client.postAjax('/api/comments', {
                    csrf_token: 'invalid_csrf_token_value',
                    post_id: '1',
                    author_name: 'Tester Invalid',
                    author_email: 'invalid@example.com',
                    comment_text: 'Should be rejected'
                });
                assert.assertStatus(res, 403);
                assert.assertJson(res, { success: false });
            }
        },
        {
            id: 'SC-04',
            tier: 0,
            feature: 'SELF-CHECK',
            milestone: 'baseline',
            name: 'POST /api/comments with valid CSRF persists comment and renders on reload',
            run: async (ctx) => {
                const beforeRows = await ctx.db.query('SELECT COUNT(*) AS cnt FROM comments');
                ctx._baselineCommentCount = beforeRows[0]?.cnt;

                const client = ctx.createClient(ctx.baseUrl);
                const pageRes = await client.get(`/post/${sampleSlug}`);
                assert.assertStatus(pageRes, 200);
                const csrfToken = extractCsrfToken(pageRes.text);
                assert.ok(csrfToken, 'Expected CSRF token on post detail page');

                const marker = `SelfCheckComment-${ctx.uid}`;
                const postRes = await client.postAjax('/api/comments', {
                    csrf_token: csrfToken,
                    post_id: '1',
                    author_name: 'E2E SelfCheck',
                    author_email: 'selfcheck@example.com',
                    comment_text: marker
                });
                assert.assertStatusIn(postRes, [200, 201]);
                assert.assertJson(postRes, (data) => {
                    assert.strictEqual(data.success, true);
                    assert.ok(data.comment && data.comment.id, 'Expected created comment payload');
                });

                const reloadRes = await client.get(`/post/${sampleSlug}`);
                assert.assertStatus(reloadRes, 200);
                assert.assertIncludes(reloadRes, marker);

                const rows = await ctx.db.query(
                    `SELECT id, author_name FROM comments WHERE comment_text LIKE '%${marker}%'`
                );
                assert.strictEqual(rows.length, 1, 'Expected 1 comment row in isolated test DB');
                ctx._selfCheckMarker = marker;
            }
        },
        {
            id: 'SC-05',
            tier: 0,
            feature: 'SELF-CHECK',
            milestone: 'baseline',
            name: 'db.resetDb() restores clean baseline seed state',
            run: async (ctx) => {
                await ctx.db.resetDb();
                const client = createClient(ctx.baseUrl);
                const reloadRes = await client.get(`/post/${sampleSlug}`);
                assert.assertStatus(reloadRes, 200);
                assert.assertNoPhpErrors(reloadRes);
                if (ctx._selfCheckMarker) {
                    assert.assertNotIncludes(reloadRes, ctx._selfCheckMarker);
                    const markerRows = await ctx.db.query(
                        `SELECT id FROM comments WHERE comment_text LIKE '%${ctx._selfCheckMarker}%'`
                    );
                    assert.strictEqual(markerRows.length, 0, 'Expected self-check comment to be removed after resetDb');
                }
                assert.assertIncludes(reloadRes, 'Budi Santoso');
                const rows = await ctx.db.query('SELECT COUNT(*) AS cnt FROM comments');
                assert.strictEqual(
                    rows[0]?.cnt,
                    ctx._baselineCommentCount,
                    `Expected baseline seed comment count (${ctx._baselineCommentCount}) after resetDb`
                );
            }
        }
    ];
}

function printSummary({ passed, failed, skippedTiers, tierStats, durationMs }) {
    const total = passed + failed;
    console.log('\n============================================');
    console.log(' Hasil Pengujian E2E Native NeoBlog');
    console.log('============================================');
    if (tierStats.length > 0) {
        for (const stat of tierStats) {
            console.log(
                ` ${stat.label.padEnd(34)} : ${stat.passed}/${stat.total} PASS` +
                    (stat.failed > 0 ? ` (${RED}${stat.failed} FAIL${RESET})` : '')
            );
        }
        console.log('--------------------------------------------');
    }
    if (skippedTiers.length > 0) {
        console.log(` ${YELLOW}Skipped missing tier files:${RESET} ${skippedTiers.map((s) => s.file).join(', ')}`);
    }
    console.log(` Total Test : ${total}`);
    console.log(` Berhasil   : ${GREEN}${passed}${RESET}`);
    console.log(` Gagal      : ${failed > 0 ? `${RED}${failed}${RESET}` : '0'}`);
    console.log(` Durasi     : ${(durationMs / 1000).toFixed(2)}s`);
    console.log('============================================');
}

async function main() {
    let opts;
    try {
        opts = parseArgs(process.argv.slice(2));
    } catch (err) {
        console.error(`${RED}Argument error:${RESET} ${err.message}`);
        process.exit(2);
    }

    if (opts.help) {
        printHelp();
        process.exit(0);
    }

    if (opts.list) {
        const { loaded, skippedFiles } = await loadTierModules(opts.tier);
        let total = 0;
        for (const tierGroup of loaded) {
            const matched = filterTests(tierGroup.tests, opts);
            console.log(`\n${CYAN}${tierGroup.label}${RESET} (${matched.length} tests)`);
            for (const t of matched) {
                console.log(`  - ${t.id} [${t.milestone}/${t.feature}] ${t.name}`);
            }
            total += matched.length;
        }
        if (skippedFiles.length > 0) {
            console.log(`\n${YELLOW}Notice:${RESET} Missing tier files skipped: ${skippedFiles.map((s) => s.file).join(', ')}`);
        }
        console.log(`\nTotal listed tests: ${total}`);
        process.exit(0);
    }

    let tierPlans = [];
    let skippedFiles = [];

    if (opts.selfCheck) {
        tierPlans = [
            {
                tier: 0,
                label: 'Harness Self-Check',
                beforeTier: null,
                tests: getSelfCheckTests()
            }
        ];
    } else {
        const loadedRes = await loadTierModules(opts.tier);
        skippedFiles = loadedRes.skippedFiles;
        tierPlans = loadedRes.loaded
            .map((group) => ({
                ...group,
                tests: filterTests(group.tests, opts)
            }))
            .filter((group) => group.tests.length > 0);
    }

    if (tierPlans.length === 0) {
        console.log(`${YELLOW}No matching E2E tests found to execute.${RESET}`);
        if (skippedFiles.length > 0) {
            console.log(`Missing tier files skipped: ${skippedFiles.map((s) => s.file).join(', ')}`);
        }
        process.exit(0);
    }

    const runStartedAt = Date.now();
    let db = null;
    let server = null;
    let cleaningUp = null;

    const cleanup = async () => {
        if (cleaningUp) return cleaningUp;
        cleaningUp = (async () => {
            if (server) {
                await server.stop().catch((err) => {
                    console.error(`Warning stopping PHP server: ${err.message}`);
                });
                server = null;
            }
            if (db) {
                await db.stop().catch((err) => {
                    console.error(`Warning stopping MySQL: ${err.message}`);
                });
                db = null;
            }
        })();
        return cleaningUp;
    };

    const handleFatalSignal = async (signalOrErr, exitCode = 1) => {
        if (signalOrErr instanceof Error) {
            console.error(`\n${RED}Fatal error:${RESET}`, signalOrErr);
        } else {
            console.error(`\n${YELLOW}Received ${signalOrErr}, cleaning up processes...${RESET}`);
        }
        await cleanup();
        process.exit(exitCode);
    };

    process.once('SIGINT', () => void handleFatalSignal('SIGINT', 130));
    process.once('SIGTERM', () => void handleFatalSignal('SIGTERM', 143));
    process.once('uncaughtException', (err) => void handleFatalSignal(err, 1));
    process.once('unhandledRejection', (reason) =>
        void handleFatalSignal(reason instanceof Error ? reason : new Error(String(reason)), 1)
    );

    let dataDirPath = null;
    let dbMode = 'ephemeral';
    let passed = 0;
    let failed = 0;
    const tierStats = [];

    try {
        console.log(`${CYAN}[E2E] Bootstrapping isolated MySQL database...${RESET}`);
        db = await startDatabase({ keepDb: opts.keepDb, rootDir: ROOT_DIR });
        dataDirPath = db.dataDir;
        dbMode = db.mode;
        console.log(
            `[E2E] MySQL ready (${db.mode}) on ${db.host}:${db.port}/${db.name}` +
                (db.dataDir ? ` [datadir: ${db.dataDir}]` : '')
        );

        console.log(`${CYAN}[E2E] Starting PHP built-in server...${RESET}`);
        server = await startServer({ db, docRoot: path.join(ROOT_DIR, 'public') });
        console.log(`[E2E] PHP server ready at ${server.url}`);

        const assert = createCombinedAssert();
        const runToken = Math.random().toString(36).slice(2, 7);
        let testSeq = 0;
        const sharedState = {};

        for (const plan of tierPlans) {
            console.log(`\n${CYAN}>>> ${plan.label} (${plan.tests.length} tests)${RESET}`);

            if (plan.tier === 4) {
                console.log('[E2E] Resetting database to clean baseline before Tier 4...');
                await db.resetDb();
            }

            if (plan.beforeTier) {
                await plan.beforeTier({
                    baseUrl: server.url,
                    db,
                    server,
                    createClient: httpLib.createClient,
                    http: httpLib,
                    assert,
                    uid: `${runToken}000`,
                    rootDir: ROOT_DIR
                });
            }

            let tierPassed = 0;
            let tierFailed = 0;

            for (const testCase of plan.tests) {
                testSeq++;
                const uid = `${runToken}${String(testSeq).padStart(3, '0')}`;
                const ctx = Object.assign(sharedState, {
                    baseUrl: server.url,
                    db,
                    server,
                    createClient: httpLib.createClient,
                    http: httpLib,
                    assert,
                    uid,
                    rootDir: ROOT_DIR
                });

                const t0 = Date.now();
                try {
                    await testCase.run(ctx);
                    const elapsed = Date.now() - t0;
                    console.log(` [${GREEN}PASS${RESET}] ${testCase.id} ${testCase.name} (${elapsed}ms)`);
                    passed++;
                    tierPassed++;
                } catch (err) {
                    const elapsed = Date.now() - t0;
                    console.log(` [${RED}FAIL${RESET}] ${testCase.id} ${testCase.name} (${elapsed}ms)`);
                    console.log(`        Alasan: ${err?.message || err}`);
                    if (err?.stack) {
                        const firstFrame = err.stack.split('\n').slice(1, 3).map((l) => l.trim()).join(' | ');
                        if (firstFrame) {
                            console.log(`        Stack : ${firstFrame}`);
                        }
                    }
                    failed++;
                    tierFailed++;
                }
            }

            tierStats.push({
                label: plan.label,
                passed: tierPassed,
                failed: tierFailed,
                total: tierPassed + tierFailed
            });
        }
    } finally {
        await cleanup();
    }

    if (opts.selfCheck && dbMode === 'ephemeral' && dataDirPath && !opts.keepDb) {
        if (fs.existsSync(dataDirPath)) {
            console.error(`${RED}[E2E] Self-check error: temp datadir still exists: ${dataDirPath}${RESET}`);
            failed++;
        } else {
            console.log(`\n[E2E] Verified temp datadir removed cleanly: ${dataDirPath}`);
        }
    }

    printSummary({
        passed,
        failed,
        skippedTiers: skippedFiles,
        tierStats,
        durationMs: Date.now() - runStartedAt
    });

    process.exit(failed > 0 ? 1 : 0);
}

await main();
