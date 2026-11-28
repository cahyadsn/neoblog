function decodeHtmlEntities(str) {
    if (!str) return '';
    return str
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#0*39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

export function extractFirstMatch(html, regex) {
    if (!html || !(regex instanceof RegExp)) return null;
    const match = regex.exec(html);
    if (!match) return null;
    return match[1] !== undefined ? match[1] : match[0];
}

function getAttributeValue(tagHtml, attrName) {
    if (!tagHtml || !attrName) return null;
    const target = String(attrName).toLowerCase();
    const len = tagHtml.length;
    let i = 0;

    // Skip leading whitespace and opening `<tagName` if present
    while (i < len && /\s/.test(tagHtml[i])) i++;
    if (i < len && tagHtml[i] === '<') {
        i++;
        if (i < len && tagHtml[i] === '/') i++;
        while (i < len && !/[\s/>]/.test(tagHtml[i])) i++;
    }

    while (i < len) {
        while (i < len && /\s/.test(tagHtml[i])) i++;
        if (i >= len || tagHtml[i] === '>') break;
        if (tagHtml[i] === '/') {
            i++;
            if (i < len && tagHtml[i] === '>') break;
            continue;
        }

        const nameStart = i;
        while (i < len && !/[\s=/>]/.test(tagHtml[i])) i++;
        const name = tagHtml.slice(nameStart, i);
        if (!name) {
            i++;
            continue;
        }

        while (i < len && /\s/.test(tagHtml[i])) i++;

        let rawValue = '';
        if (i < len && tagHtml[i] === '=') {
            i++;
            while (i < len && /\s/.test(tagHtml[i])) i++;
            if (i < len && (tagHtml[i] === '"' || tagHtml[i] === "'")) {
                const quote = tagHtml[i++];
                const valStart = i;
                while (i < len && tagHtml[i] !== quote) i++;
                rawValue = tagHtml.slice(valStart, i);
                if (i < len && tagHtml[i] === quote) i++;
            } else {
                const valStart = i;
                while (i < len && !/[\s>]/.test(tagHtml[i])) {
                    if (tagHtml[i] === '/' && (i + 1 >= len || tagHtml[i + 1] === '>')) {
                        break;
                    }
                    i++;
                }
                rawValue = tagHtml.slice(valStart, i);
            }
        }

        if (name.toLowerCase() === target) {
            return decodeHtmlEntities(rawValue);
        }
    }

    return null;
}

export function extractInputValue(html, name) {
    if (!html || !name) return null;
    const inputTags = html.match(/<input\b[^>]*>/gi) || [];
    for (const tag of inputTags) {
        const tagName = getAttributeValue(tag, 'name');
        if (tagName === name) {
            return getAttributeValue(tag, 'value') ?? '';
        }
    }
    return null;
}

export function extractHiddenInput(html, name) {
    if (!html || !name) return null;
    const inputTags = html.match(/<input\b[^>]*>/gi) || [];
    for (const tag of inputTags) {
        const type = (getAttributeValue(tag, 'type') || '').toLowerCase();
        const tagName = getAttributeValue(tag, 'name');
        if (tagName === name && (type === 'hidden' || type === '')) {
            return getAttributeValue(tag, 'value') ?? '';
        }
    }
    // Fallback if type attribute is unusual or omitted
    return extractInputValue(html, name);
}

export function extractCsrfToken(html) {
    if (!html) return null;

    // Check <input ... name="csrf_token" ... value="..."> in any attribute order
    const inputToken = extractInputValue(html, 'csrf_token');
    if (inputToken) {
        return inputToken;
    }

    // Check <meta name="csrf-token" content="..."> in any attribute order
    const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
    for (const tag of metaTags) {
        const metaName = (getAttributeValue(tag, 'name') || '').toLowerCase();
        if (metaName === 'csrf-token' || metaName === 'csrf_token') {
            const content = getAttributeValue(tag, 'content');
            if (content) return content;
        }
    }

    return null;
}

function parseSetCookiePair(setCookieStr) {
    const firstSegment = String(setCookieStr).split(';')[0];
    const eqIdx = firstSegment.indexOf('=');
    if (eqIdx <= 0) return null;
    const name = firstSegment.slice(0, eqIdx).trim();
    const value = firstSegment.slice(eqIdx + 1).trim();

    const attrs = String(setCookieStr)
        .split(';')
        .slice(1)
        .map((s) => s.trim().toLowerCase());
    const isDeleted =
        value === '' ||
        value.toLowerCase() === 'deleted' ||
        attrs.some((a) => a === 'max-age=0' || a.startsWith('max-age=-'));

    return { name, value, isDeleted };
}

function toUrlSearchParams(fields = {}) {
    const params = new URLSearchParams();
    if (fields instanceof URLSearchParams) {
        return fields;
    }
    for (const [key, val] of Object.entries(fields || {})) {
        if (val === undefined || val === null) continue;
        if (Array.isArray(val)) {
            for (const item of val) {
                params.append(key, String(item));
            }
        } else {
            params.append(key, String(val));
        }
    }
    return params;
}

export function createClient(baseUrl) {
    const normalizedBase = String(baseUrl).replace(/\/+$/, '');
    const jar = new Map();
    let lastSetCookies = [];

    const buildUrl = (reqPath, query) => {
        const target = /^https?:\/\//i.test(reqPath)
            ? new URL(reqPath)
            : new URL(reqPath.startsWith('/') ? reqPath : `/${reqPath}`, `${normalizedBase}/`);
        if (query && typeof query === 'object') {
            for (const [k, v] of Object.entries(query)) {
                if (v === undefined || v === null) continue;
                target.searchParams.set(k, String(v));
            }
        }
        return target.toString();
    };

    const serializeCookies = () => {
        const pairs = [];
        for (const [k, v] of jar.entries()) {
            pairs.push(`${k}=${v}`);
        }
        return pairs.join('; ');
    };

    const wrapResponse = async (rawRes, reqUrl) => {
        const setCookies =
            typeof rawRes.headers.getSetCookie === 'function'
                ? rawRes.headers.getSetCookie()
                : rawRes.headers.get('set-cookie')
                    ? [rawRes.headers.get('set-cookie')]
                    : [];

        lastSetCookies = setCookies;
        for (const sc of setCookies) {
            const parsed = parseSetCookiePair(sc);
            if (!parsed) continue;
            if (parsed.isDeleted) {
                jar.delete(parsed.name);
            } else {
                jar.set(parsed.name, parsed.value);
            }
        }

        const text = await rawRes.text();
        let parsedJsonCache;
        let parsedJsonLoaded = false;

        const wrapped = {
            status: rawRes.status,
            ok: rawRes.ok,
            url: reqUrl,
            headers: rawRes.headers,
            location: rawRes.headers.get('location'),
            lastSetCookies: [...setCookies],
            text,
            history: [],
            json() {
                if (!parsedJsonLoaded) {
                    parsedJsonLoaded = true;
                    try {
                        parsedJsonCache = JSON.parse(text);
                    } catch (err) {
                        const snippet = text.slice(0, 300).replace(/\s+/g, ' ');
                        throw new Error(
                            `Expected valid JSON from ${reqUrl} (HTTP ${rawRes.status}), parse failed: ${err.message}. Body snippet: ${snippet}`
                        );
                    }
                }
                return parsedJsonCache;
            }
        };

        return wrapped;
    };

    const request = async (method, reqPath, opts = {}) => {
        const url = buildUrl(reqPath, opts.query);
        const headers = new Headers(opts.headers || {});

        if (!headers.has('Cookie') && jar.size > 0 && opts.sendCookies !== false) {
            headers.set('Cookie', serializeCookies());
        }
        if (opts.csrfToken) {
            headers.set('X-CSRF-Token', String(opts.csrfToken));
        }

        const upperMethod = String(method || 'GET').toUpperCase();
        const fetchOpts = {
            method: upperMethod,
            headers,
            redirect: 'manual',
            signal: opts.signal
        };

        if (opts.body !== undefined && upperMethod !== 'GET' && upperMethod !== 'HEAD') {
            fetchOpts.body = opts.body;
        }

        const rawRes = await fetch(url, fetchOpts);
        const res = await wrapResponse(rawRes, url);

        if (opts.follow) {
            return followRedirects(res, opts.maxHops ?? 5);
        }

        return res;
    };

    const followRedirects = async (initialRes, maxHops = 5) => {
        const history = [initialRes];
        let current = initialRes;
        let hops = 0;

        while (
            current.status >= 300 &&
            current.status < 400 &&
            current.location &&
            hops < maxHops
        ) {
            hops++;
            const nextUrl = new URL(current.location, current.url || `${normalizedBase}/`).toString();
            current = await request('GET', nextUrl, {
                headers: {
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });
            history.push(current);
        }

        current.history = history;
        return current;
    };

    const get = (reqPath, opts = {}) => {
        const headers = new Headers(opts.headers || {});
        if (!headers.has('Accept')) {
            headers.set(
                'Accept',
                opts.ajax
                    ? 'application/json'
                    : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            );
        }
        if (opts.ajax && !headers.has('X-Requested-With')) {
            headers.set('X-Requested-With', 'XMLHttpRequest');
        }
        return request('GET', reqPath, { ...opts, headers });
    };

    const postForm = (reqPath, fields = {}, opts = {}) => {
        const headers = new Headers(opts.headers || {});
        if (!headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
        }
        if (!headers.has('Accept')) {
            headers.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
        }
        const body = typeof fields === 'string' ? fields : toUrlSearchParams(fields).toString();
        return request('POST', reqPath, { ...opts, headers, body });
    };

    const postAjax = (reqPath, fieldsOrJson = {}, opts = {}) => {
        const headers = new Headers(opts.headers || {});
        if (!headers.has('X-Requested-With')) {
            headers.set('X-Requested-With', 'XMLHttpRequest');
        }
        if (!headers.has('Accept')) {
            headers.set('Accept', 'application/json');
        }

        let body;
        if (opts.json === true) {
            if (!headers.has('Content-Type')) {
                headers.set('Content-Type', 'application/json; charset=UTF-8');
            }
            body = typeof fieldsOrJson === 'string' ? fieldsOrJson : JSON.stringify(fieldsOrJson ?? {});
        } else {
            if (!headers.has('Content-Type')) {
                headers.set('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
            }
            body =
                typeof fieldsOrJson === 'string'
                    ? fieldsOrJson
                    : toUrlSearchParams(fieldsOrJson).toString();
        }

        return request('POST', reqPath, { ...opts, headers, body });
    };

    return {
        baseUrl: normalizedBase,
        jar,
        request,
        get,
        postForm,
        postAjax,
        followRedirects,
        getCookie: (name) => jar.get(name),
        setCookie: (name, value) => jar.set(name, String(value)),
        deleteCookie: (name) => jar.delete(name),
        clearCookies: () => {
            jar.clear();
            lastSetCookies = [];
        },
        getLastSetCookies: () => [...lastSetCookies]
    };
}
