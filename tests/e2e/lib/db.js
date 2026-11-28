import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../..');

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseVersionTuple(name) {
    const match = name.match(/(\d+(?:\.\d+)*)/);
    if (!match) return [0];
    return match[1].split('.').map((n) => Number.parseInt(n, 10) || 0);
}

function compareVersionDesc(a, b) {
    const va = parseVersionTuple(a);
    const vb = parseVersionTuple(b);
    const len = Math.max(va.length, vb.length);
    for (let i = 0; i < len; i++) {
        const da = va[i] || 0;
        const db = vb[i] || 0;
        if (da !== db) return db - da;
    }
    return b.localeCompare(a);
}

function findInDir(dir, names) {
    for (const name of names) {
        const candidate = path.join(dir, name);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}

function discoverLaragonMysqlDirs() {
    const laragonMysqlRoot = 'D:\\laragon\\bin\\mysql';
    if (!fs.existsSync(laragonMysqlRoot)) {
        return [];
    }
    try {
        const entries = fs.readdirSync(laragonMysqlRoot, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isDirectory() && /^mysql-/i.test(entry.name))
            .map((entry) => entry.name)
            .sort(compareVersionDesc)
            .map((name) => path.join(laragonMysqlRoot, name, 'bin'));
    } catch {
        return [];
    }
}

function findBinary(envVar, names, preferredDirs = []) {
    const explicit = process.env[envVar];
    if (explicit) {
        if (!fs.existsSync(explicit)) {
            throw new Error(`${envVar} is set to "${explicit}", but the file does not exist.`);
        }
        return explicit;
    }

    for (const dir of preferredDirs) {
        if (!dir) continue;
        const found = findInDir(dir, names);
        if (found) return found;
    }

    const pathEnv = process.env.PATH || process.env.Path || '';
    for (const dir of pathEnv.split(path.delimiter).filter(Boolean)) {
        const found = findInDir(dir, names);
        if (found) return found;
    }

    for (const dir of discoverLaragonMysqlDirs()) {
        const found = findInDir(dir, names);
        if (found) return found;
    }

    throw new Error(
        `Could not locate MySQL binary (${names.join(' / ')}). Set ${envVar} or install MySQL in PATH / D:\\laragon\\bin\\mysql\\mysql-*\\bin\\.`
    );
}

export function discoverMysqlBinaries() {
    const isWin = process.platform === 'win32';
    const mysqldNames = isWin ? ['mysqld.exe', 'mysqld'] : ['mysqld'];
    const mysqlNames = isWin ? ['mysql.exe', 'mysql'] : ['mysql'];
    const adminNames = isWin ? ['mysqladmin.exe', 'mysqladmin'] : ['mysqladmin'];

    const mysqld = findBinary('MYSQLD_BIN', mysqldNames);
    const mysqldDir = path.dirname(mysqld);
    const mysql = findBinary('MYSQL_BIN', mysqlNames, [mysqldDir]);
    const mysqladmin = findBinary('MYSQLADMIN_BIN', adminNames, [mysqldDir]);

    return { mysqld, mysql, mysqladmin };
}

export function allocateFreePort(host = '127.0.0.1') {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, host, () => {
            const addr = srv.address();
            const port = typeof addr === 'object' && addr ? addr.port : 0;
            srv.close((err) => {
                if (err) reject(err);
                else resolve(port);
            });
        });
    });
}

function execFileAsync(bin, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = execFile(
            bin,
            args,
            {
                windowsHide: true,
                maxBuffer: 16 * 1024 * 1024,
                ...options
            },
            (err, stdout, stderr) => {
                if (err) {
                    const detail = [stderr, stdout].filter(Boolean).join('\n').trim();
                    const error = new Error(`${path.basename(bin)} failed (${err.code ?? err.message}): ${detail}`);
                    error.cause = err;
                    error.stdout = stdout;
                    error.stderr = stderr;
                    reject(error);
                    return;
                }
                resolve({ stdout, stderr });
            }
        );

        if (options.input !== undefined && child.stdin) {
            child.stdin.end(options.input);
        }
    });
}

function checkTcpConnect(host, port, timeoutMs = 500) {
    return new Promise((resolve) => {
        const socket = net.createConnection({ host, port });
        let settled = false;
        const done = (ok) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(ok);
        };
        socket.setTimeout(timeoutMs);
        socket.on('connect', () => done(true));
        socket.on('timeout', () => done(false));
        socket.on('error', () => done(false));
    });
}

function rewriteSqlDatabaseName(sql, targetDbName) {
    if (!targetDbName || targetDbName === 'neoblog') {
        return sql;
    }
    const safeDb = targetDbName.replace(/`/g, '');
    return sql
        .replace(/CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+`?neoblog`?/gi, `CREATE DATABASE IF NOT EXISTS \`${safeDb}\``)
        .replace(/USE\s+`?neoblog`?\s*;/gi, `USE \`${safeDb}\`;`);
}

function unescapeMysqlTsvField(raw) {
    if (raw === '\\N') return null;
    let out = '';
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (ch === '\\' && i + 1 < raw.length) {
            const next = raw[i + 1];
            if (next === 't') {
                out += '\t';
                i++;
                continue;
            }
            if (next === 'n') {
                out += '\n';
                i++;
                continue;
            }
            if (next === 'r') {
                out += '\r';
                i++;
                continue;
            }
            if (next === '\\') {
                out += '\\';
                i++;
                continue;
            }
            if (next === '0') {
                out += '\0';
                i++;
                continue;
            }
        }
        out += ch;
    }
    return out;
}

function parseMysqlBatchTsv(stdout) {
    const trimmed = stdout.replace(/\r?\n$/, '');
    if (!trimmed) return [];
    const lines = trimmed.split(/\r?\n/);
    if (lines.length === 0) return [];
    const headers = lines[0].split('\t').map(unescapeMysqlTsvField);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line === '') continue;
        const fields = line.split('\t');
        const row = {};
        for (let c = 0; c < headers.length; c++) {
            row[headers[c]] = c < fields.length ? unescapeMysqlTsvField(fields[c]) : null;
        }
        rows.push(row);
    }
    return rows;
}

export async function startDatabase(options = {}) {
    const keepDb = Boolean(options.keepDb);
    const useExisting = process.env.NEOBLOG_E2E_USE_EXISTING_DB === '1';
    const rootDir = options.rootDir || ROOT_DIR;
    const schemaPath = options.schemaPath || path.join(rootDir, 'database', 'schema.sql');
    const seedPath = options.seedPath || path.join(rootDir, 'database', 'seed.sql');

    const bins = discoverMysqlBinaries();

    let host = '127.0.0.1';
    let port = 3306;
    let name = 'neoblog';
    let user = 'root';
    let pass = '';
    let mode = 'ephemeral';
    let dataDir = null;
    let mysqldProc = null;
    let mysqldExited = false;
    let mysqldExitDetail = '';
    let stopped = false;
    const logLines = [];

    const appendLog = (chunk) => {
        const text = String(chunk);
        for (const line of text.split(/\r?\n/)) {
            if (!line) continue;
            logLines.push(line);
            if (logLines.length > 200) {
                logLines.shift();
            }
        }
    };

    const buildMysqlBaseArgs = (overrideHost = host) => {
        const args = [
            '--no-defaults',
            `--host=${overrideHost}`,
            `--port=${port}`,
            '-u',
            user,
            '--default-character-set=utf8mb4'
        ];
        if (pass) {
            args.push(`-p${pass}`);
        }
        return args;
    };

    const runMysqlScript = async (sqlText, { database = null, overrideHost = host, extraArgs = [] } = {}) => {
        const args = buildMysqlBaseArgs(overrideHost);
        if (overrideHost === 'localhost') {
            args.push('--protocol=TCP');
        }
        if (database) {
            args.push('--database', database);
        }
        args.push(...extraArgs);
        return execFileAsync(bins.mysql, args, { input: sqlText });
    };

    const loadSchemaAndSeed = async () => {
        const rawSchema = fs.readFileSync(schemaPath, 'utf8');
        const rawSeed = fs.readFileSync(seedPath, 'utf8');
        const schemaSql = rewriteSqlDatabaseName(rawSchema, name);
        const seedSql = rewriteSqlDatabaseName(rawSeed, name);
        await runMysqlScript(schemaSql);
        await runMysqlScript(seedSql);
    };

    const resetDb = async () => {
        const safeDb = name.replace(/`/g, '');
        await runMysqlScript(`DROP DATABASE IF EXISTS \`${safeDb}\`;`);
        await loadSchemaAndSeed();
    };

    const query = async (sql) => {
        const { stdout } = await runMysqlScript(sql, {
            database: name,
            extraArgs: ['--batch']
        });
        return parseMysqlBatchTsv(stdout);
    };

    const stop = async () => {
        if (stopped) return;
        stopped = true;

        if (mode !== 'ephemeral') {
            return;
        }

        if (mysqldProc && !mysqldExited) {
            const shutdownArgs = [
                '--no-defaults',
                `--host=${host}`,
                `--port=${port}`,
                '-u',
                user
            ];
            if (pass) {
                shutdownArgs.push(`-p${pass}`);
            }
            shutdownArgs.push('shutdown');

            const closePromise = new Promise((resolve) => {
                if (mysqldExited) {
                    resolve();
                    return;
                }
                mysqldProc.once('close', () => resolve());
            });

            try {
                await execFileAsync(bins.mysqladmin, shutdownArgs, { timeout: 10000 });
            } catch {
                // Fallback handled below if process is still running
            }

            const closedInTime = await Promise.race([
                closePromise.then(() => true),
                delay(10000).then(() => false)
            ]);

            if (!closedInTime && mysqldProc.pid) {
                if (process.platform === 'win32') {
                    try {
                        await execFileAsync('taskkill', ['/PID', String(mysqldProc.pid), '/T', '/F']);
                    } catch {
                        // Ignore if already exited
                    }
                } else {
                    try {
                        mysqldProc.kill('SIGKILL');
                    } catch {
                        // Ignore if already exited
                    }
                }
                await Promise.race([closePromise, delay(3000)]);
            }
        }

        if (dataDir && !keepDb) {
            fs.rmSync(dataDir, {
                recursive: true,
                force: true,
                maxRetries: 6,
                retryDelay: 250
            });
        }
    };

    if (useExisting) {
        mode = 'existing';
        host = process.env.DB_HOST || '127.0.0.1';
        port = Number.parseInt(process.env.DB_PORT || '3306', 10) || 3306;
        name = process.env.DB_NAME || 'neoblog_e2e';
        user = process.env.DB_USER || 'root';
        pass = process.env.DB_PASS ?? '';

        await resetDb();

        return {
            host,
            port,
            name,
            user,
            pass,
            mode,
            dataDir: null,
            binaries: bins,
            query,
            resetDb,
            stop,
            getLogs: () => logLines.join('\n')
        };
    }

    // Ephemeral isolated mode
    const tmpBase = process.env.NEOBLOG_E2E_TMPDIR || os.tmpdir();
    fs.mkdirSync(tmpBase, { recursive: true });
    const rand = Math.random().toString(36).slice(2, 10);
    dataDir = path.join(tmpBase, `neoblog-e2e-${process.pid}-${rand}`);
    fs.mkdirSync(dataDir, { recursive: true });

    try {
        await execFileAsync(bins.mysqld, [
            '--no-defaults',
            '--initialize-insecure',
            `--datadir=${dataDir}`
        ]);

        port = await allocateFreePort(host);

        mysqldProc = spawn(
            bins.mysqld,
            [
                '--no-defaults',
                `--datadir=${dataDir}`,
                `--port=${port}`,
                '--bind-address=127.0.0.1',
                '--mysqlx=0',
                '--skip-log-bin',
                '--console'
            ],
            {
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true
            }
        );

        mysqldProc.stdout?.on('data', appendLog);
        mysqldProc.stderr?.on('data', appendLog);
        mysqldProc.on('error', (err) => {
            mysqldExited = true;
            mysqldExitDetail = `spawn error: ${err.message}`;
        });
        mysqldProc.on('close', (code, signal) => {
            mysqldExited = true;
            mysqldExitDetail = `code=${code}, signal=${signal}`;
        });

        const deadline = Date.now() + 30000;
        let pingReady = false;
        let connectHostForBootstrap = host;

        while (Date.now() < deadline) {
            if (mysqldExited) {
                throw new Error(
                    `mysqld exited prematurely (${mysqldExitDetail}). Logs:\n${logLines.join('\n')}`
                );
            }

            const tcpOk = await checkTcpConnect(host, port, 500);
            if (tcpOk) {
                try {
                    const { stdout } = await execFileAsync(bins.mysqladmin, [
                        '--no-defaults',
                        `--host=${host}`,
                        `--port=${port}`,
                        '-u',
                        'root',
                        'ping'
                    ]);
                    if (/alive/i.test(stdout)) {
                        pingReady = true;
                        connectHostForBootstrap = host;
                        break;
                    }
                } catch {
                    try {
                        const { stdout } = await execFileAsync(bins.mysqladmin, [
                            '--no-defaults',
                            '--host=localhost',
                            '--protocol=TCP',
                            `--port=${port}`,
                            '-u',
                            'root',
                            'ping'
                        ]);
                        if (/alive/i.test(stdout)) {
                            pingReady = true;
                            connectHostForBootstrap = 'localhost';
                            break;
                        }
                    } catch {
                        // Keep polling until mysqld finishes initializing InnoDB & tables
                    }
                }
            }
            await delay(200);
        }

        if (!pingReady) {
            throw new Error(
                `Timed out waiting for ephemeral mysqld on ${host}:${port}. Logs:\n${logLines.join('\n')}`
            );
        }

        const grantSql = [
            "CREATE USER IF NOT EXISTS 'root'@'127.0.0.1' IDENTIFIED BY '';",
            "GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;",
            'FLUSH PRIVILEGES;'
        ].join(' ');

        try {
            await runMysqlScript(grantSql, { overrideHost: connectHostForBootstrap });
        } catch (err) {
            const fallbackHost = connectHostForBootstrap === '127.0.0.1' ? 'localhost' : '127.0.0.1';
            await runMysqlScript(grantSql, { overrideHost: fallbackHost }).catch(() => {
                throw err;
            });
        }

        await loadSchemaAndSeed();

        return {
            host,
            port,
            name,
            user,
            pass,
            mode,
            dataDir,
            binaries: bins,
            query,
            resetDb,
            stop,
            getLogs: () => logLines.join('\n')
        };
    } catch (err) {
        await stop().catch(() => {});
        throw err;
    }
}
