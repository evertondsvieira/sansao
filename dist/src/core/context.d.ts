import { z } from "zod";
import type { ContractDefinition } from "../types/index.js";
/**
 * Cookie serialization options used when setting response cookies.
 */
export type CookieOptions = {
    maxAge?: number;
    expires?: Date;
    path?: string;
    domain?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: "strict" | "lax" | "none";
};
export type ErrorResponse<TDetails = unknown> = {
    error: string;
    code?: string;
    details?: TDetails;
};
export type HttpErrorOptions<TDetails = unknown> = {
    code?: string;
    details?: TDetails;
};
export declare class HttpError<TDetails = unknown> extends Error {
    readonly status: number;
    readonly code: string | undefined;
    readonly details: TDetails | undefined;
    constructor(status: number, message: string, options?: HttpErrorOptions<TDetails>);
}
/**
 * Request/response context passed to route handlers.
 *
 * It stores validated request data and helper methods to build responses.
 */
export declare class Context<TContract extends ContractDefinition = ContractDefinition> {
    request: Request;
    private contract;
    params: TContract["params"] extends z.ZodTypeAny ? z.infer<TContract["params"]> : Record<string, string>;
    query: TContract["query"] extends z.ZodTypeAny ? z.infer<TContract["query"]> : Record<string, string>;
    body: TContract["body"] extends z.ZodTypeAny ? z.infer<TContract["body"]> : unknown;
    headers: TContract["headers"] extends z.ZodTypeAny ? z.infer<TContract["headers"]> : Record<string, string>;
    cookies: Map<string, string>;
    private responseCookies;
    private responseHeaders;
    constructor(request: Request, contract: TContract);
    /** Parses incoming Cookie header once and stores values in `cookies`. */
    private parseCookies;
    /** Queues a cookie to be attached to the outgoing response. */
    setCookie(name: string, value: string, options?: CookieOptions): void;
    /** Expires a cookie immediately using an epoch timestamp. */
    deleteCookie(name: string, options?: Pick<CookieOptions, "path" | "domain">): void;
    /** Builds a JSON response preserving custom headers/cookies set on the context. */
    json<T>(status: number, data: T): Response;
    /** Builds an HTML response preserving custom headers/cookies set on the context. */
    html(status: number, html: string): Response;
    /** Builds a text response preserving custom headers/cookies set on the context. */
    text(status: number, text: string): Response;
    /** Builds a redirect response preserving custom headers/cookies set on the context. */
    redirect(url: string, status?: number): Response;
    /** Creates an Error object carrying an HTTP status for upstream catch handling. */
    error<TDetails = unknown>(status: number, message: string, options?: HttpErrorOptions<TDetails>): HttpError<TDetails>;
    /** Throws an HttpError for concise early exits from handlers/middlewares. */
    fail<TDetails = unknown>(status: number, message: string, options?: HttpErrorOptions<TDetails>): never;
    /** Sets/overwrites a header to be included in helper-generated responses. */
    setHeader(name: string, value: string): void;
    /** Builds a generic streaming response preserving custom headers/cookies. */
    stream(status: number, body: BodyInit | null, options?: {
        headers?: HeadersInit;
    }): Response;
    /**
     * Builds an SSE response preserving custom headers/cookies.
     * Accepts a ReadableStream or an AsyncIterable of string/Uint8Array chunks.
     */
    sse(status: number, source: ReadableStream<Uint8Array> | AsyncIterable<string | Uint8Array>, options?: {
        headers?: HeadersInit;
        retry?: number;
    }): Response;
    private composeResponseHeaders;
    private applyHeaders;
    private toSseBody;
    private createSseStreamFromIterable;
    private static toSseDataFrame;
    /** Serializes queued response cookies into Set-Cookie headers. */
    private addCookiesToHeaders;
}
//# sourceMappingURL=context.d.ts.map