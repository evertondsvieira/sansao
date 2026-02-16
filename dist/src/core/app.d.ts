import { Context } from "./context.js";
import type { Handler } from "./handler.js";
/**
 * Koa-style middleware signature.
 * Each middleware can short-circuit or call `next()` to continue the chain.
 */
export type Middleware = (ctx: Context, next: () => Promise<Response>) => Promise<Response> | Response;
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
    register(handler: Handler): void;
    register(handlers: Handler[]): void;
    private registerSingle;
    /** Adds middleware to the execution chain (registration order). */
    use(middleware: Middleware): void;
    /** Handles a Fetch API request end-to-end and returns a response. */
    fetch(request: Request): Promise<Response>;
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
}
/** Creates a new application instance. */
export declare function createApp(): App;
//# sourceMappingURL=app.d.ts.map