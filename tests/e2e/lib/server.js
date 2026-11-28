import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allocateFreePort } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DOC_ROOT = path.resolve(__dirname, '../../../public');

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolvePhpBinary(overrideBin) {
    const explicit = overrideBin || process.env.PHP_BIN;
    if (explicit) {
        if (!fs.existsSync(explicit)) {
            throw new Error(`PHP_BIN is set to "${explicit}", but the file does not exist.`);
        }
        return explicit;
    }

    const isWin = process.platform === 'win32';
    const exeName = isWin ? 'php.exe' : 'php';
    const pathEnv = process.env.PATH || process.env.Path || '';
    for (const dir of pathEnv.split(path.delimiter).filter(Boolean)) {
        const candidate = path.join(dir, exeName);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    if (isWin && fs.existsSync('D:\\laragon\\bin\\php')) {
        const dirs = fs
            .readdirSync('D:\\laragon\\bin\\php', { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name)
            .sort()
            .reverse();
        for (const dirName of dirs) {
            const candidate = path.join('D:\\laragon\\bin\\php', dirName, 'php.exe');
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }
    }

    return 'php';
}

function forceKillPid(pid) {
    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve());
        } else {
            try {
                process.kill(pid, 'SIGKILL');
            } catch {
                // Ignore if already gone
            }
            resolve();
        }
    });
}

export async function startServer(options = {}) {
    const {
        db,
        docRoot = DEFAULT_DOC_ROOT,
        host = '127.0.0.1',
        phpBin: phpBinOption,
        timeoutMs = 15000
    } = options;

    if (!db) {
        throw new Error('startServer requires a `db` instance.');
    }
    if (!fs.existsSync(docRoot)) {
        throw new Error(`Document root does not exist: ${docRoot}`);
    }

    const phpBin = resolvePhpBinary(phpBinOption);
    const port = await allocateFreePort(host);
    const url = `http://${host}:${port}`;

    const logLines = [];
    const appendLogs = (chunk) => {
        const text = String(chunk);
        for (const line of text.split(/\r?\n/)) {
            if (!line) continue;
            logLines.push(line);
            if (logLines.length > 200) {
                logLines.shift();
            }
        }
    };

    let exited = false;
    let exitDetail = '';
    let stopped = false;

    const proc = spawn(phpBin, ['-S', `${host}:${port}`, '-t', docRoot], {
        cwd: path.dirname(docRoot),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
            ...process.env,
            DB_HOST: db.host,
            DB_PORT: String(db.port),
            DB_NAME: db.name,
            DB_USER: db.user,
            DB_PASS: db.pass ?? ''
        }
    });

    proc.stdout?.on('data', appendLogs);
    proc.stderr?.on('data', appendLogs);
    proc.on('error', (err) => {
        exited = true;
        exitDetail = `spawn error: ${err.message}`;
    });
    proc.on('close', (code, signal) => {
        exited = true;
        exitDetail = `code=${code}, signal=${signal}`;
    });

    const stop = async () => {
        if (stopped) return;
        stopped = true;
        if (exited) return;

        const closePromise = new Promise((resolve) => {
            if (exited) {
                resolve();
                return;
            }
            proc.once('close', () => resolve());
        });

        try {
            proc.kill('SIGTERM');
        } catch {
            // Ignore
        }

        const closedCleanly = await Promise.race([
            closePromise.then(() => true),
            delay(4000).then(() => false)
        ]);

        if (!closedCleanly && proc.pid) {
            await forceKillPid(proc.pid);
            await Promise.race([closePromise, delay(3000)]);
        }
    };

    try {
        const deadline = Date.now() + timeoutMs;
        let ready = false;
        let lastError = null;

        while (Date.now() < deadline) {
            if (exited) {
                throw new Error(`PHP server exited prematurely (${exitDetail}). Logs:\n${logLines.join('\n')}`);
            }

            try {
                const res = await fetch(`${url}/`, {
                    method: 'GET',
                    redirect: 'manual',
                    signal: AbortSignal.timeout(1500)
                });
                await res.arrayBuffer();
                if (res.status >= 100) {
                    ready = true;
                    break;
                }
            } catch (err) {
                lastError = err;
            }

            await delay(100);
        }

        if (!ready) {
            throw new Error(
                `Timed out waiting for PHP built-in server at ${url} (${lastError?.message || 'no response'}). Logs:\n${logLines.join('\n')}`
            );
        }

        return {
            url,
            host,
            port,
            phpBin,
            docRoot,
            stop,
            getLogs: () => logLines.join('\n'),
            getLogLines: () => [...logLines]
        };
    } catch (err) {
        await stop().catch(() => {});
        throw err;
    }
}
