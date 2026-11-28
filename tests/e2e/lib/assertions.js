import assert from 'node:assert/strict';

function resolveBodyText(target) {
    if (typeof target === 'string') return target;
    if (target && typeof target.text === 'string') return target.text;
    return String(target ?? '');
}

function formatSnippet(resOrText, maxLen = 240) {
    const text = resolveBodyText(resOrText).replace(/\s+/g, ' ').trim();
    return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}

export function assertStatus(res, expectedStatus, msg) {
    const actual = res?.status;
    if (actual !== expectedStatus) {
        const detail = msg ? `${msg} — ` : '';
        assert.fail(
            `${detail}Expected HTTP ${expectedStatus} from ${res?.url || 'request'}, got ${actual}. Body: ${formatSnippet(res)}`
        );
    }
}

export function assertStatusIn(res, expectedStatuses, msg) {
    const allowed = Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses];
    const actual = res?.status;
    if (!allowed.includes(actual)) {
        const detail = msg ? `${msg} — ` : '';
        assert.fail(
            `${detail}Expected HTTP status in [${allowed.join(', ')}] from ${res?.url || 'request'}, got ${actual}. Body: ${formatSnippet(res)}`
        );
    }
}

export function assertRedirect(res, locationSubstr, msg) {
    const status = res?.status;
    const isRedirect = status >= 300 && status < 400;
    const detail = msg ? `${msg} — ` : '';
    if (!isRedirect) {
        assert.fail(
            `${detail}Expected 3xx redirect from ${res?.url || 'request'}, got HTTP ${status}. Body: ${formatSnippet(res)}`
        );
    }

    const loc = res?.location ?? res?.headers?.get?.('location') ?? '';
    if (!loc) {
        assert.fail(`${detail}Expected Location header on HTTP ${status} redirect, but none was present.`);
    }

    if (locationSubstr instanceof RegExp) {
        if (!locationSubstr.test(loc)) {
            assert.fail(`${detail}Expected Location "${loc}" to match ${locationSubstr}.`);
        }
    } else if (typeof locationSubstr === 'string' && locationSubstr.length > 0) {
        if (!loc.includes(locationSubstr)) {
            assert.fail(`${detail}Expected Location "${loc}" to include "${locationSubstr}".`);
        }
    }
}

export function assertIncludes(haystackOrRes, needle, msg) {
    const text = resolveBodyText(haystackOrRes);
    if (!text.includes(needle)) {
        const detail = msg ? `${msg} — ` : '';
        assert.fail(`${detail}Expected text to include ${JSON.stringify(needle)}. Snippet: ${formatSnippet(text)}`);
    }
}

export function assertNotIncludes(haystackOrRes, needle, msg) {
    const text = resolveBodyText(haystackOrRes);
    if (text.includes(needle)) {
        const detail = msg ? `${msg} — ` : '';
        assert.fail(`${detail}Expected text NOT to include ${JSON.stringify(needle)}, but it was found.`);
    }
}

export function assertMatch(textOrRes, regex, msg) {
    const text = resolveBodyText(textOrRes);
    if (!regex.test(text)) {
        const detail = msg ? `${msg} — ` : '';
        assert.fail(`${detail}Expected text to match ${regex}. Snippet: ${formatSnippet(text)}`);
    }
}

export function assertNotMatch(textOrRes, regex, msg) {
    const text = resolveBodyText(textOrRes);
    if (regex.test(text)) {
        const detail = msg ? `${msg} — ` : '';
        assert.fail(`${detail}Expected text NOT to match ${regex}, but it matched.`);
    }
}

export function assertJson(res, fnOrObj, msg) {
    const detail = msg ? `${msg} — ` : '';
    const contentType = res?.headers?.get?.('content-type') || '';
    if (!/application\/json/i.test(contentType)) {
        assert.fail(
            `${detail}Expected Content-Type to include application/json, got "${contentType}". Body: ${formatSnippet(res)}`
        );
    }

    const data = typeof res?.json === 'function' ? res.json() : res;
    if (typeof fnOrObj === 'function') {
        fnOrObj(data);
        return data;
    }

    if (fnOrObj && typeof fnOrObj === 'object') {
        assert.ok(data && typeof data === 'object', `${detail}Expected JSON object.`);
        for (const [k, expectedVal] of Object.entries(fnOrObj)) {
            assert.deepStrictEqual(
                data[k],
                expectedVal,
                `${detail}JSON key "${k}" mismatch: expected ${JSON.stringify(expectedVal)}, got ${JSON.stringify(data[k])}`
            );
        }
    }

    return data;
}

export function assertCookieChanged(prevVal, nextVal, name = 'PHPSESSID', msg) {
    const detail = msg ? `${msg} — ` : '';
    assert.ok(
        typeof nextVal === 'string' && nextVal.length > 0,
        `${detail}Expected cookie "${name}" to be set to a non-empty value after transition, got ${JSON.stringify(nextVal)}.`
    );
    assert.notStrictEqual(
        nextVal,
        prevVal,
        `${detail}Expected cookie "${name}" to regenerate/change, but remained ${JSON.stringify(nextVal)}.`
    );
}

export function assertSetCookieFlag(resOrSetCookies, cookieName, flag, msg) {
    const detail = msg ? `${msg} — ` : '';
    const list = Array.isArray(resOrSetCookies)
        ? resOrSetCookies
        : Array.isArray(resOrSetCookies?.lastSetCookies)
            ? resOrSetCookies.lastSetCookies
            : typeof resOrSetCookies?.headers?.getSetCookie === 'function'
                ? resOrSetCookies.headers.getSetCookie()
                : [];

    const targetPrefix = `${cookieName}=`;
    const matching = list.filter((entry) => String(entry).trim().startsWith(targetPrefix));
    assert.ok(
        matching.length > 0,
        `${detail}Expected Set-Cookie header for "${cookieName}", got [${list.join(' | ')}].`
    );

    const latest = matching[matching.length - 1];
    const attrs = String(latest)
        .split(';')
        .slice(1)
        .map((part) => part.trim().toLowerCase());
    const expectedAttr = String(flag).trim().toLowerCase();

    const found = attrs.some((attr) => attr === expectedAttr || (expectedAttr.includes('=') && attr === expectedAttr));
    assert.ok(
        found,
        `${detail}Expected Set-Cookie for "${cookieName}" to contain flag "${flag}", got "${latest}".`
    );
}

const PHP_ERROR_MARKERS = [
    'Fatal error:',
    'Parse error:',
    'Warning:',
    'Notice:',
    'Deprecated:',
    'SQLSTATE['
];

export function assertNoPhpErrors(resOrBody, msg) {
    const body = resolveBodyText(resOrBody);
    const detail = msg ? `${msg} — ` : '';
    for (const marker of PHP_ERROR_MARKERS) {
        if (body.includes(marker)) {
            const idx = body.indexOf(marker);
            const excerpt = body.slice(Math.max(0, idx - 40), idx + 180).replace(/\s+/g, ' ');
            assert.fail(`${detail}Detected PHP/SQL error marker "${marker}" in response: ${excerpt}`);
        }
    }
}

export { assert };
