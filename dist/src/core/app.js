import { Router } from "./router.js";
import { Context, HttpError } from "./context.js";
import { zodValidator } from "../validation/zod.js";
const RESPONSE_VALIDATION_MAX_BODY_BYTES = 1024 * 1024;
const RESPONSE_VALIDATION_READ_TIMEOUT_MS = 50;
/**
 * Main Sansao runtime.
 *
 * Responsibilities:
 * - register contract handlers
 * - match incoming requests
 * - validate inputs with zod schemas from contracts
 * - run middleware pipeline
 */
export class App {
    router = new Router();
    handlers = new Map();
    middlewares = [];
    options;
    constructor(options = {}) {
        this.options = {
            responseValidation: options.responseValidation ?? "development",
            hooks: options.hooks ?? {},
            validator: options.validator ?? zodValidator,
        };
    }
    /** Registers one or many handlers. */
    register(input) {
        if (Array.isArray(input)) {
            input.forEach((h) => this.registerSingle(h));
        }
        else {
            this.registerSingle(input);
        }
    }
    registerSingle(handler) {
        this.router.register(handler.contract);
        this.handlers.set(handler.contract, handler.fn);
    }
    /** Adds middleware to the execution chain (registration order). */
    use(middleware) {
        this.middlewares.push(middleware);
    }
    /** Returns a snapshot of registered route contracts. */
    getContracts() {
        return this.router.getAllContracts();
    }
    /** Returns the validation adapter configured for this app instance. */
    getValidator() {
        return this.options.validator;
    }
    /** Handles a Fetch API request end-to-end and returns a response. */
    async fetch(request) {
        const trace = {
            request,
            method: request.method,
            path: request.url,
            startedAt: Date.now(),
        };
        let phase = "routing";
        try {
            const url = new URL(request.url);
            trace.path = url.pathname;
            await this.invokeRequestHook(trace);
            const match = this.router.find(request.method, url.pathname);
            if (!match) {
                const response = this.errorResponse(404, "Not Found", {
                    code: "ROUTE_NOT_FOUND",
                });
                await this.invokeResponseHook(trace, response);
                return response;
            }
            const { contract, params } = match;
            trace.contract = contract;
            trace.params = params;
            const handler = this.handlers.get(contract);
            if (!handler) {
                const response = this.errorResponse(500, "Handler not found", {
                    code: "HANDLER_NOT_FOUND",
                });
                await this.invokeResponseHook(trace, response);
                return response;
            }
            const ctx = new Context(request, contract);
            // Parse and validate route params before handler execution.
            phase = "params";
            if (contract.params) {
                const paramsResult = this.parseParams(contract.params, params);
                if (paramsResult.success) {
                    ctx.params = paramsResult.data;
                }
                else {
                    const response = this.errorResponse(400, "Invalid params", {
                        code: "INVALID_PARAMS",
                        details: paramsResult.error,
                    });
                    await this.invokeResponseHook(trace, response);
                    return response;
                }
            }
            else {
                ctx.params = params;
            }
            // Parse and validate query string values.
            phase = "query";
            if (contract.query) {
                const queryResult = this.parseQuery(contract.query, url.searchParams);
                if (queryResult.success) {
                    ctx.query = queryResult.data;
                }
                else {
                    const response = this.errorResponse(400, "Invalid query", {
                        code: "INVALID_QUERY",
                        details: queryResult.error,
                    });
                    await this.invokeResponseHook(trace, response);
                    return response;
                }
            }
            else {
                ctx.query = Object.fromEntries(url.searchParams);
            }
            // Parse and validate request headers.
            phase = "headers";
            if (contract.headers) {
                const headersResult = this.parseHeaders(contract.headers, request.headers);
                if (headersResult.success) {
                    ctx.headers = headersResult.data;
                }
                else {
                    const response = this.errorResponse(400, "Invalid headers", {
                        code: "INVALID_HEADERS",
                        details: headersResult.error,
                    });
                    await this.invokeResponseHook(trace, response);
                    return response;
                }
            }
            // Parse and validate request body for methods that can carry payloads.
            phase = "body";
            if (contract.body &&
                (request.method === "POST" ||
                    request.method === "PUT" ||
                    request.method === "PATCH" ||
                    request.method === "DELETE")) {
                const bodyResult = await this.parseBody(contract.body, request);
                if (bodyResult.success) {
                    ctx.body = bodyResult.data;
                }
                else {
                    const response = this.errorResponse(400, "Invalid body", {
                        code: "INVALID_BODY",
                        details: bodyResult.error,
                    });
                    await this.invokeResponseHook(trace, response);
                    return response;
                }
            }
            // Execute middleware stack in registration order.
            phase = "middleware";
            const executeMiddleware = async (index) => {
                if (index >= this.middlewares.length) {
                    return handler(ctx);
                }
                const middleware = this.middlewares[index];
                return middleware(ctx, () => executeMiddleware(index + 1));
            };
            const response = await executeMiddleware(0);
            phase = "response_validation";
            const responseValidationResult = await this.validateResponse(contract, response);
            if (!responseValidationResult.success) {
                const invalidResponse = this.errorResponse(500, "Invalid response", {
                    code: "INVALID_RESPONSE",
                    details: responseValidationResult.error,
                });
                await this.invokeResponseHook(trace, invalidResponse);
                return invalidResponse;
            }
            await this.invokeResponseHook(trace, response);
            return response;
        }
        catch (error) {
            await this.invokeErrorHook(trace, error, phase);
            const normalizedError = this.normalizeError(error);
            const errorOptions = {};
            if (normalizedError.code !== undefined) {
                errorOptions.code = normalizedError.code;
            }
            if (normalizedError.details !== undefined) {
                errorOptions.details = normalizedError.details;
            }
            const response = this.errorResponse(normalizedError.status, normalizedError.message, errorOptions);
            await this.invokeResponseHook(trace, response);
            return response;
        }
    }
    async invokeRequestHook(trace) {
        const hook = this.options.hooks.onRequest;
        if (!hook) {
            return;
        }
        await this.invokeHook(hook, this.createRequestEvent(trace));
    }
    async invokeResponseHook(trace, response) {
        const hook = this.options.hooks.onResponse;
        if (!hook) {
            return;
        }
        await this.invokeHook(hook, this.createResponseEvent(trace, response));
    }
    async invokeErrorHook(trace, error, phase) {
        const hook = this.options.hooks.onError;
        if (!hook) {
            return;
        }
        await this.invokeHook(hook, this.createErrorEvent(trace, error, phase));
    }
    createRequestEvent(trace) {
        const event = {
            request: this.createHookRequestView(trace.request),
            method: trace.method,
            path: trace.path,
            startedAt: trace.startedAt,
        };
        if (trace.contract !== undefined) {
            event.contract = trace.contract;
        }
        if (trace.params !== undefined) {
            event.params = trace.params;
        }
        return event;
    }
    createResponseEvent(trace, response) {
        return {
            ...this.createRequestEvent(trace),
            response: this.createHookResponseView(response),
            durationMs: Date.now() - trace.startedAt,
        };
    }
    createErrorEvent(trace, error, phase) {
        return {
            ...this.createRequestEvent(trace),
            error,
            phase,
            durationMs: Date.now() - trace.startedAt,
        };
    }
    cloneRequestForHook(request) {
        try {
            return request.clone();
        }
        catch {
            return new Request(request.url, {
                method: request.method,
                headers: request.headers,
            });
        }
    }
    createHookRequestView(request) {
        if (!request.body) {
            return request;
        }
        let bodyClone;
        let bodyView;
        const getBodyClone = () => {
            if (!bodyClone) {
                bodyClone = this.cloneRequestForHook(request);
            }
            return bodyClone;
        };
        return new Proxy(request, {
            get: (target, prop) => {
                const isBodyReaderMethod = prop === "text" ||
                    prop === "json" ||
                    prop === "arrayBuffer" ||
                    prop === "blob" ||
                    prop === "formData" ||
                    (prop === "bytes" && typeof Reflect.get(target, "bytes", target) === "function");
                if (isBodyReaderMethod) {
                    return (...args) => {
                        const method = prop;
                        const clone = getBodyClone();
                        return clone[method](...args);
                    };
                }
                if (prop === "body") {
                    if (!bodyView) {
                        bodyView = this.createHookBodyStreamView(() => getBodyClone().body, () => bodyClone !== undefined, () => request.body);
                    }
                    return bodyView;
                }
                if (prop === "bodyUsed") {
                    return bodyClone ? bodyClone.bodyUsed : Reflect.get(target, prop, target);
                }
                const value = Reflect.get(target, prop, target);
                if (typeof value === "function") {
                    return value.bind(target);
                }
                return value;
            },
        });
    }
    cloneResponseForHook(response) {
        try {
            return response.clone();
        }
        catch {
            return new Response(null, {
                status: response.status,
                headers: response.headers,
            });
        }
    }
    createHookResponseView(response) {
        if (!response.body) {
            return response;
        }
        let bodyClone;
        let bodyView;
        const getBodyClone = () => {
            if (!bodyClone) {
                bodyClone = this.cloneResponseForHook(response);
            }
            return bodyClone;
        };
        return new Proxy(response, {
            get: (target, prop) => {
                const isBodyReaderMethod = prop === "text" ||
                    prop === "json" ||
                    prop === "arrayBuffer" ||
                    prop === "blob" ||
                    prop === "formData" ||
                    (prop === "bytes" && typeof Reflect.get(target, "bytes", target) === "function");
                if (isBodyReaderMethod) {
                    return (...args) => {
                        const method = prop;
                        const clone = getBodyClone();
                        return clone[method](...args);
                    };
                }
                if (prop === "body") {
                    if (!bodyView) {
                        bodyView = this.createHookBodyStreamView(() => getBodyClone().body, () => bodyClone !== undefined, () => response.body);
                    }
                    return bodyView;
                }
                if (prop === "bodyUsed") {
                    return bodyClone ? bodyClone.bodyUsed : Reflect.get(target, prop, target);
                }
                const value = Reflect.get(target, prop, target);
                if (typeof value === "function") {
                    return value.bind(target);
                }
                return value;
            },
        });
    }
    createHookBodyStreamView(getClonedBody, hasClonedBody, getOriginalBody) {
        const originalBody = getOriginalBody();
        if (!originalBody) {
            return new ReadableStream();
        }
        return new Proxy(originalBody, {
            get(target, prop) {
                if (prop === "locked") {
                    if (hasClonedBody()) {
                        return getClonedBody()?.locked ?? false;
                    }
                    return target.locked;
                }
                if (prop === Symbol.toStringTag) {
                    return "ReadableStream";
                }
                const clonedBody = getClonedBody();
                if (!clonedBody) {
                    return undefined;
                }
                const value = Reflect.get(clonedBody, prop, clonedBody);
                if (typeof value === "function") {
                    return value.bind(clonedBody);
                }
                return value;
            },
        });
    }
    async invokeHook(hook, event) {
        if (!hook) {
            return;
        }
        try {
            await hook(event);
        }
        catch {
            // Hook failures must never break request processing.
        }
    }
    errorResponse(status, error, options = {}) {
        const payload = { error };
        if (options.code !== undefined) {
            payload.code = options.code;
        }
        if (options.details !== undefined) {
            payload.details = options.details;
        }
        const safeStatus = this.normalizeStatusCode(status);
        return new Response(JSON.stringify(payload), {
            status: safeStatus,
            headers: { "content-type": "application/json" },
        });
    }
    normalizeError(error) {
        if (error instanceof HttpError) {
            const normalized = {
                status: this.normalizeStatusCode(error.status),
                message: error.message || "Internal Server Error",
            };
            if (error.code !== undefined) {
                normalized.code = error.code;
            }
            if (error.details !== undefined) {
                normalized.details = error.details;
            }
            return normalized;
        }
        if (typeof error === "object" && error !== null) {
            const maybeError = error;
            if (typeof maybeError.status === "number") {
                const normalized = {
                    status: this.normalizeStatusCode(maybeError.status),
                    message: typeof maybeError.message === "string" && maybeError.message.length > 0
                        ? maybeError.message
                        : "Internal Server Error",
                };
                if (typeof maybeError.code === "string") {
                    normalized.code = maybeError.code;
                }
                if (maybeError.details !== undefined) {
                    normalized.details = maybeError.details;
                }
                return normalized;
            }
        }
        if (error instanceof Error) {
            return {
                status: 500,
                message: error.message || "Internal Server Error",
            };
        }
        return {
            status: 500,
            message: "Internal Server Error",
        };
    }
    normalizeStatusCode(status) {
        if (typeof status === "number" &&
            Number.isInteger(status) &&
            status >= 100 &&
            status <= 599) {
            return status;
        }
        return 500;
    }
    shouldValidateResponse() {
        if (this.options.responseValidation === "always") {
            return true;
        }
        if (this.options.responseValidation === "off") {
            return false;
        }
        return this.isDevelopmentRuntime();
    }
    isDevelopmentRuntime() {
        const nodeEnv = globalThis.process?.env?.NODE_ENV;
        if (typeof nodeEnv === "string") {
            return nodeEnv !== "production";
        }
        const bunEnv = globalThis.Bun?.env?.NODE_ENV;
        if (typeof bunEnv === "string") {
            return bunEnv !== "production";
        }
        const denoEnv = this.readDenoEnv();
        if (typeof denoEnv === "string") {
            return denoEnv !== "production";
        }
        // Default to development when NODE_ENV is unavailable so "development" mode
        // remains active in local/test environments where env vars are unset.
        return true;
    }
    readDenoEnv() {
        const deno = globalThis.Deno;
        if (!deno?.env?.get) {
            return undefined;
        }
        try {
            return deno.env.get("NODE_ENV");
        }
        catch {
            return undefined;
        }
    }
    async validateResponse(contract, response) {
        if (!this.shouldValidateResponse()) {
            return { success: true };
        }
        if (!contract.response) {
            return { success: true };
        }
        const schema = contract.response[response.status];
        if (!schema) {
            return { success: true };
        }
        const bodyResult = await this.readResponseBody(response);
        if (!bodyResult.success) {
            return { success: false, error: bodyResult.error };
        }
        if (!("data" in bodyResult)) {
            return { success: true };
        }
        const parseResult = this.options.validator.parse(schema, bodyResult.data);
        return parseResult.success
            ? { success: true }
            : { success: false, error: parseResult.error };
    }
    async readResponseBody(response) {
        if (response.status === 204 || response.status === 304) {
            return { success: true, data: undefined };
        }
        if (!response.body) {
            return { success: true, data: undefined };
        }
        const contentType = response.headers.get("content-type") || "";
        const normalizedType = contentType.toLowerCase();
        if (this.shouldSkipResponseBodyValidation(response, normalizedType)) {
            return { success: true, skipped: true };
        }
        const cloned = response.clone();
        const contentLength = response.headers.get("content-length");
        const parsedLength = contentLength === null || contentLength.trim() === ""
            ? undefined
            : Number(contentLength);
        const hasValidContentLength = typeof parsedLength === "number" &&
            Number.isFinite(parsedLength) &&
            parsedLength >= 0;
        const textResult = await this.readResponseText(cloned, !hasValidContentLength);
        if (!textResult.success) {
            return textResult;
        }
        if (!("data" in textResult)) {
            return textResult;
        }
        const text = textResult.data;
        if (this.isJsonContentType(normalizedType)) {
            if (text.trim() === "") {
                return { success: true, data: undefined };
            }
            try {
                return { success: true, data: JSON.parse(text) };
            }
            catch {
                return { success: false, error: "Response body is not valid JSON" };
            }
        }
        return { success: true, data: text };
    }
    shouldSkipResponseBodyValidation(response, contentType) {
        if (!response.body) {
            return false;
        }
        const normalizedType = contentType.toLowerCase();
        if (normalizedType.includes("text/event-stream") ||
            normalizedType.includes("application/x-ndjson")) {
            return true;
        }
        const contentLength = response.headers.get("content-length");
        if (!contentLength) {
            return false;
        }
        const parsedLength = Number(contentLength);
        if (!Number.isFinite(parsedLength) || parsedLength < 0) {
            return false;
        }
        return parsedLength > RESPONSE_VALIDATION_MAX_BODY_BYTES;
    }
    isJsonContentType(contentType) {
        return (contentType.includes("application/json") ||
            contentType.includes("+json"));
    }
    async readResponseText(response, useTimeout) {
        if (!response.body) {
            return { success: true, data: "" };
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const chunks = [];
        let totalBytes = 0;
        const deadline = useTimeout ? Date.now() + RESPONSE_VALIDATION_READ_TIMEOUT_MS : Infinity;
        try {
            while (true) {
                const remainingMs = deadline - Date.now();
                const next = useTimeout
                    ? await this.readWithTimeout(reader, remainingMs)
                    : await reader.read();
                if (next === "timeout") {
                    void reader.cancel().catch(() => undefined);
                    return { success: true, skipped: true };
                }
                if (next.done) {
                    chunks.push(decoder.decode());
                    return { success: true, data: chunks.join("") };
                }
                totalBytes += next.value.byteLength;
                if (totalBytes > RESPONSE_VALIDATION_MAX_BODY_BYTES) {
                    void reader.cancel().catch(() => undefined);
                    return { success: true, skipped: true };
                }
                chunks.push(decoder.decode(next.value, { stream: true }));
            }
        }
        catch {
            return { success: false, error: "Failed to read response body" };
        }
    }
    async readWithTimeout(reader, remainingMs) {
        if (remainingMs <= 0) {
            return "timeout";
        }
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => resolve("timeout"), remainingMs);
            reader.read().then((result) => {
                clearTimeout(timeoutId);
                resolve(result);
            }, (error) => {
                clearTimeout(timeoutId);
                reject(error);
            });
        });
    }
    parseParams(schema, params) {
        return this.options.validator.parse(schema, params);
    }
    /**
     * Parses querystring values and retries with basic scalar coercion on failing keys.
     * Coercion targets booleans, null, and numeric strings.
     */
    parseQuery(schema, searchParams) {
        const obj = {};
        for (const [key, value] of searchParams) {
            // Use hasOwnProperty so empty values remain explicit and valid.
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const existing = obj[key];
                obj[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
            }
            else {
                obj[key] = value;
            }
        }
        const rawResult = this.options.validator.parse(schema, obj);
        if (rawResult.success) {
            return { success: true, data: rawResult.data };
        }
        const getErrorPaths = this.options.validator.getErrorPaths;
        if (!getErrorPaths) {
            return { success: false, error: rawResult.error };
        }
        const keysToCoerce = new Set();
        for (const path of getErrorPaths(rawResult.error)) {
            keysToCoerce.add(path);
        }
        if (keysToCoerce.size === 0) {
            return { success: false, error: rawResult.error };
        }
        const coercedObj = this.coerceQueryObject(obj, keysToCoerce);
        const coercedResult = this.options.validator.parse(schema, coercedObj);
        return coercedResult.success
            ? { success: true, data: coercedResult.data }
            : { success: false, error: coercedResult.error };
    }
    coerceQueryObject(input, keysToCoerce) {
        const out = {};
        for (const [key, value] of Object.entries(input)) {
            if (!keysToCoerce.has(key)) {
                out[key] = value;
                continue;
            }
            out[key] = Array.isArray(value)
                ? value.map((item) => this.coerceQueryValue(item))
                : this.coerceQueryValue(value);
        }
        return out;
    }
    /** Coerces common scalar string literals used in query parameters. */
    coerceQueryValue(value) {
        if (value === "true")
            return true;
        if (value === "false")
            return false;
        if (value === "null")
            return null;
        if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
            return Number(value);
        }
        return value;
    }
    /** Converts Headers into a plain object and validates with zod. */
    parseHeaders(schema, headers) {
        const obj = {};
        headers.forEach((value, key) => {
            obj[key] = value;
        });
        return this.options.validator.parse(schema, obj);
    }
    /** Parses body by content-type and validates with configured adapter. */
    async parseBody(schema, request) {
        const contentType = request.headers.get("content-type") || "";
        let data;
        if (contentType.includes("application/json")) {
            const rawBody = await request.text();
            if (rawBody.trim() === "") {
                data = undefined;
            }
            else {
                try {
                    data = JSON.parse(rawBody);
                }
                catch {
                    return { success: false, error: "Invalid JSON" };
                }
            }
        }
        else if (contentType.includes("application/x-www-form-urlencoded")) {
            const formData = await request.text();
            data = Object.fromEntries(new URLSearchParams(formData));
        }
        else if (contentType.includes("multipart/form-data")) {
            try {
                const multipartData = await request.formData();
                data = this.formDataToObject(multipartData);
            }
            catch {
                return { success: false, error: "Invalid multipart form data" };
            }
        }
        else {
            // Fall back to JSON parsing first, then plain text.
            try {
                data = await request.clone().json();
            }
            catch {
                data = await request.text();
            }
        }
        return this.options.validator.parse(schema, data);
    }
    formDataToObject(formData) {
        const data = {};
        formData.forEach((value, key) => {
            const current = data[key];
            if (current === undefined) {
                data[key] = value;
                return;
            }
            if (Array.isArray(current)) {
                current.push(value);
                return;
            }
            data[key] = [current, value];
        });
        return data;
    }
}
/** Creates a new application instance. */
export function createApp(options) {
    return new App(options);
}
//# sourceMappingURL=app.js.map