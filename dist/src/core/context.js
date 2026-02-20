export class HttpError extends Error {
    status;
    code;
    details;
    constructor(status, message, options = {}) {
        super(message);
        this.name = "HttpError";
        this.status = status;
        this.code = options.code;
        this.details = options.details;
    }
}
/**
 * Request/response context passed to route handlers.
 *
 * It stores validated request data and helper methods to build responses.
 */
export class Context {
    request;
    contract;
    params = {};
    query = {};
    body = {};
    headers = {};
    cookies = new Map();
    responseCookies = new Map();
    responseHeaders = new Headers();
    constructor(request, contract) {
        this.request = request;
        this.contract = contract;
        this.parseCookies();
    }
    /** Parses incoming Cookie header once and stores values in `cookies`. */
    parseCookies() {
        const cookieHeader = this.request.headers.get("cookie");
        if (!cookieHeader)
            return;
        cookieHeader.split(";").forEach((cookie) => {
            const [name, ...rest] = cookie.trim().split("=");
            if (name) {
                const value = rest.join("=");
                try {
                    this.cookies.set(name, decodeURIComponent(value));
                }
                catch {
                    // Keep the raw value when cookie encoding is malformed.
                    this.cookies.set(name, value);
                }
            }
        });
    }
    /** Queues a cookie to be attached to the outgoing response. */
    setCookie(name, value, options) {
        const entry = { value };
        if (options !== undefined) {
            entry.options = options;
        }
        this.responseCookies.set(name, entry);
    }
    /** Expires a cookie immediately using an epoch timestamp. */
    deleteCookie(name, options) {
        this.responseCookies.set(name, {
            value: "",
            options: { ...options, expires: new Date(0) }
        });
    }
    /** Builds a JSON response preserving custom headers/cookies set on the context. */
    json(status, data) {
        const headers = new Headers(this.responseHeaders);
        headers.set("content-type", "application/json");
        this.addCookiesToHeaders(headers);
        return new Response(JSON.stringify(data), { status, headers });
    }
    /** Builds an HTML response preserving custom headers/cookies set on the context. */
    html(status, html) {
        const headers = new Headers(this.responseHeaders);
        headers.set("content-type", "text/html; charset=utf-8");
        this.addCookiesToHeaders(headers);
        return new Response(html, { status, headers });
    }
    /** Builds a text response preserving custom headers/cookies set on the context. */
    text(status, text) {
        const headers = new Headers(this.responseHeaders);
        headers.set("content-type", "text/plain; charset=utf-8");
        this.addCookiesToHeaders(headers);
        return new Response(text, { status, headers });
    }
    /** Builds a redirect response preserving custom headers/cookies set on the context. */
    redirect(url, status = 302) {
        const headers = new Headers(this.responseHeaders);
        headers.set("location", url);
        this.addCookiesToHeaders(headers);
        return new Response(null, { status, headers });
    }
    /** Creates an Error object carrying an HTTP status for upstream catch handling. */
    error(status, message, options) {
        return new HttpError(status, message, options);
    }
    /** Throws an HttpError for concise early exits from handlers/middlewares. */
    fail(status, message, options) {
        throw this.error(status, message, options);
    }
    /** Sets/overwrites a header to be included in helper-generated responses. */
    setHeader(name, value) {
        this.responseHeaders.set(name, value);
    }
    /** Builds a generic streaming response preserving custom headers/cookies. */
    stream(status, body, options = {}) {
        const headers = this.composeResponseHeaders(options.headers);
        return new Response(body, { status, headers });
    }
    /**
     * Builds an SSE response preserving custom headers/cookies.
     * Accepts a ReadableStream or an AsyncIterable of string/Uint8Array chunks.
     */
    sse(status, source, options = {}) {
        const headers = this.composeResponseHeaders(options.headers);
        headers.set("content-type", "text/event-stream; charset=utf-8");
        headers.set("cache-control", "no-cache, no-transform");
        headers.set("connection", "keep-alive");
        const body = this.toSseBody(source, options.retry);
        return new Response(body, { status, headers });
    }
    composeResponseHeaders(extraHeaders) {
        const headers = new Headers(this.responseHeaders);
        if (extraHeaders) {
            this.applyHeaders(headers, extraHeaders);
        }
        this.addCookiesToHeaders(headers);
        return headers;
    }
    applyHeaders(target, extraHeaders) {
        if (extraHeaders instanceof Headers) {
            extraHeaders.forEach((value, key) => target.set(key, value));
            return;
        }
        if (Array.isArray(extraHeaders)) {
            for (const [key, value] of extraHeaders) {
                target.set(key, value);
            }
            return;
        }
        for (const [key, value] of Object.entries(extraHeaders)) {
            if (value !== undefined) {
                target.set(key, String(value));
            }
        }
    }
    toSseBody(source, retry) {
        const retryChunk = typeof retry === "number" && Number.isFinite(retry)
            ? new TextEncoder().encode(`retry: ${Math.max(0, Math.floor(retry))}\n\n`)
            : undefined;
        if (source instanceof ReadableStream) {
            if (!retryChunk) {
                return source;
            }
            const reader = source.getReader();
            return new ReadableStream({
                start(controller) {
                    controller.enqueue(retryChunk);
                },
                async pull(controller) {
                    try {
                        const next = await reader.read();
                        if (next.done) {
                            controller.close();
                            reader.releaseLock();
                            return;
                        }
                        controller.enqueue(next.value);
                    }
                    catch (error) {
                        controller.error(error);
                    }
                },
                cancel() {
                    return reader.cancel();
                },
            });
        }
        return this.createSseStreamFromIterable(source, retryChunk);
    }
    createSseStreamFromIterable(source, retryChunk) {
        const encoder = new TextEncoder();
        return new ReadableStream({
            async start(controller) {
                if (retryChunk) {
                    controller.enqueue(retryChunk);
                }
                try {
                    for await (const chunk of source) {
                        if (typeof chunk === "string") {
                            controller.enqueue(encoder.encode(Context.toSseDataFrame(chunk)));
                        }
                        else {
                            controller.enqueue(chunk);
                        }
                    }
                    controller.close();
                }
                catch (error) {
                    controller.error(error);
                }
            },
        });
    }
    static toSseDataFrame(data) {
        return data
            .split(/\r?\n/)
            .map((line) => `data: ${line}`)
            .join("\n")
            .concat("\n\n");
    }
    /** Serializes queued response cookies into Set-Cookie headers. */
    addCookiesToHeaders(headers) {
        for (const [name, { value, options }] of this.responseCookies) {
            let cookieString = `${name}=${encodeURIComponent(value)}`;
            if (options) {
                if (options.maxAge !== undefined)
                    cookieString += `; Max-Age=${options.maxAge}`;
                if (options.expires)
                    cookieString += `; Expires=${options.expires.toUTCString()}`;
                if (options.path)
                    cookieString += `; Path=${options.path}`;
                if (options.domain)
                    cookieString += `; Domain=${options.domain}`;
                if (options.secure)
                    cookieString += "; Secure";
                if (options.httpOnly)
                    cookieString += "; HttpOnly";
                if (options.sameSite)
                    cookieString += `; SameSite=${options.sameSite}`;
            }
            headers.append("set-cookie", cookieString);
        }
    }
}
//# sourceMappingURL=context.js.map