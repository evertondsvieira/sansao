import type { ContractDefinition } from "../types/index.js";
import { Context } from "./context.js";
import type { Handler } from "./handler.js";
/**
 * Koa-style middleware signature.
 * Each middleware can short-circuit or call `next()` to continue the chain.
 */
export type Middleware = (ctx: Context, next: () => Promise<Response>) => Promise<Response> | Response;
export type ResponseValidationMode = "off" | "development" | "always";
export type RequestPhase = "routing" | "params" | "query" | "headers" | "body" | "middleware" | "response_validation";
export type RequestEvent = {
    request: Request;
    method: string;
    path: string;
    startedAt: number;
    contract?: ContractDefinition;
    params?: Record<string, string>;
};
export type ResponseEvent = RequestEvent & {
    response: Response;
    durationMs: number;
};
export type ErrorEvent = RequestEvent & {
    error: unknown;
    durationMs: number;
    phase: RequestPhase;
};
export type AppHooks = {
    onRequest?: (event: RequestEvent) => void | Promise<void>;
    onResponse?: (event: ResponseEvent) => void | Promise<void>;
    onError?: (event: ErrorEvent) => void | Promise<void>;
};
export type AppOptions = {
    responseValidation?: ResponseValidationMode;
    hooks?: AppHooks;
};
/**
 * Main Sansao runtime.
 *
 * Responsibilities:
 * - register contract handlers
 * - match incoming requests
 * - validate inputs with zod schemas from contracts
 * - run middleware pipeline
 */
export declare class App {
    private router;
    private handlers;
    private middlewares;
    private options;
    constructor(options?: AppOptions);
    register(handler: Handler): void;
    register(handlers: Handler[]): void;
    private registerSingle;
    /** Adds middleware to the execution chain (registration order). */
    use(middleware: Middleware): void;
    /** Handles a Fetch API request end-to-end and returns a response. */
    fetch(request: Request): Promise<Response>;
    private invokeRequestHook;
    private invokeResponseHook;
    private invokeErrorHook;
    private createRequestEvent;
    private createResponseEvent;
    private createErrorEvent;
    private cloneRequestForHook;
    private createHookRequestView;
    private cloneResponseForHook;
    private createHookResponseView;
    private createHookBodyStreamView;
    private invokeHook;
    private errorResponse;
    private normalizeError;
    private normalizeStatusCode;
    private shouldValidateResponse;
    private isDevelopmentRuntime;
    private readDenoEnv;
    private validateResponse;
    private readResponseBody;
    private shouldSkipResponseBodyValidation;
    private isJsonContentType;
    private readResponseText;
    private readWithTimeout;
    private parseParams;
    /**
     * Parses querystring values and retries with basic scalar coercion on failing keys.
     * Coercion targets booleans, null, and numeric strings.
     */
    private parseQuery;
    private coerceQueryObject;
    /** Coerces common scalar string literals used in query parameters. */
    private coerceQueryValue;
    /** Converts Headers into a plain object and validates with zod. */
    private parseHeaders;
    /** Parses body by content-type and validates with zod. */
    private parseBody;
    private formDataToObject;
}
/** Creates a new application instance. */
export declare function createApp(options?: AppOptions): App;
//# sourceMappingURL=app.d.ts.map