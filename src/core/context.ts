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

export class HttpError<TDetails = unknown> extends Error {
  public readonly status: number;
  public readonly code: string | undefined;
  public readonly details: TDetails | undefined;

  constructor(status: number, message: string, options: HttpErrorOptions<TDetails> = {}) {
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
export class Context<TContract extends ContractDefinition = ContractDefinition> {
  public params: TContract["params"] extends z.ZodTypeAny ? z.infer<TContract["params"]> : Record<string, string> = {} as any;
  public query: TContract["query"] extends z.ZodTypeAny ? z.infer<TContract["query"]> : Record<string, string> = {} as any;
  public body: TContract["body"] extends z.ZodTypeAny ? z.infer<TContract["body"]> : unknown = {} as any;
  public headers: TContract["headers"] extends z.ZodTypeAny ? z.infer<TContract["headers"]> : Record<string, string> = {} as any;
  
  public cookies: Map<string, string> = new Map();
  private responseCookies: Map<string, { value: string; options?: CookieOptions }> = new Map();
  private responseHeaders: Headers = new Headers();

  constructor(
    public request: Request,
    private contract: TContract
  ) {
    this.parseCookies();
  }

  /** Parses incoming Cookie header once and stores values in `cookies`. */
  private parseCookies(): void {
    const cookieHeader = this.request.headers.get("cookie");
    if (!cookieHeader) return;

    cookieHeader.split(";").forEach((cookie) => {
      const [name, ...rest] = cookie.trim().split("=");
      if (name) {
        const value = rest.join("=");
        try {
          this.cookies.set(name, decodeURIComponent(value));
        } catch {
          // Keep the raw value when cookie encoding is malformed.
          this.cookies.set(name, value);
        }
      }
    });
  }

  /** Queues a cookie to be attached to the outgoing response. */
  setCookie(name: string, value: string, options?: CookieOptions): void {
    const entry: { value: string; options?: CookieOptions } = { value };
    if (options !== undefined) {
      entry.options = options;
    }
    this.responseCookies.set(name, entry);
  }

  /** Expires a cookie immediately using an epoch timestamp. */
  deleteCookie(name: string, options?: Pick<CookieOptions, "path" | "domain">): void {
    this.responseCookies.set(name, { 
      value: "", 
      options: { ...options, expires: new Date(0) } as CookieOptions
    });
  }

  /** Builds a JSON response preserving custom headers/cookies set on the context. */
  json<T>(status: number, data: T): Response {
    const headers = new Headers(this.responseHeaders);
    headers.set("content-type", "application/json");
    this.addCookiesToHeaders(headers);

    return new Response(JSON.stringify(data), { status, headers });
  }

  /** Builds an HTML response preserving custom headers/cookies set on the context. */
  html(status: number, html: string): Response {
    const headers = new Headers(this.responseHeaders);
    headers.set("content-type", "text/html; charset=utf-8");
    this.addCookiesToHeaders(headers);

    return new Response(html, { status, headers });
  }

  /** Builds a text response preserving custom headers/cookies set on the context. */
  text(status: number, text: string): Response {
    const headers = new Headers(this.responseHeaders);
    headers.set("content-type", "text/plain; charset=utf-8");
    this.addCookiesToHeaders(headers);

    return new Response(text, { status, headers });
  }

  /** Builds a redirect response preserving custom headers/cookies set on the context. */
  redirect(url: string, status: number = 302): Response {
    const headers = new Headers(this.responseHeaders);
    headers.set("location", url);
    this.addCookiesToHeaders(headers);

    return new Response(null, { status, headers });
  }

  /** Creates an Error object carrying an HTTP status for upstream catch handling. */
  error<TDetails = unknown>(
    status: number,
    message: string,
    options?: HttpErrorOptions<TDetails>
  ): HttpError<TDetails> {
    return new HttpError(status, message, options);
  }

  /** Throws an HttpError for concise early exits from handlers/middlewares. */
  fail<TDetails = unknown>(
    status: number,
    message: string,
    options?: HttpErrorOptions<TDetails>
  ): never {
    throw this.error(status, message, options);
  }

  /** Sets/overwrites a header to be included in helper-generated responses. */
  setHeader(name: string, value: string): void {
    this.responseHeaders.set(name, value);
  }

  /** Builds a generic streaming response preserving custom headers/cookies. */
  stream(
    status: number,
    body: BodyInit | null,
    options: { headers?: HeadersInit } = {}
  ): Response {
    const headers = this.composeResponseHeaders(options.headers);
    return new Response(body, { status, headers });
  }

  /**
   * Builds an SSE response preserving custom headers/cookies.
   * Accepts a ReadableStream or an AsyncIterable of string/Uint8Array chunks.
   */
  sse(
    status: number,
    source: ReadableStream<Uint8Array> | AsyncIterable<string | Uint8Array>,
    options: { headers?: HeadersInit; retry?: number } = {}
  ): Response {
    const headers = this.composeResponseHeaders(options.headers);
    headers.set("content-type", "text/event-stream; charset=utf-8");
    headers.set("cache-control", "no-cache, no-transform");
    headers.set("connection", "keep-alive");

    const body = this.toSseBody(source, options.retry);
    return new Response(body, { status, headers });
  }

  private composeResponseHeaders(extraHeaders?: HeadersInit): Headers {
    const headers = new Headers(this.responseHeaders);
    if (extraHeaders) {
      this.applyHeaders(headers, extraHeaders);
    }
    this.addCookiesToHeaders(headers);
    return headers;
  }

  private applyHeaders(target: Headers, extraHeaders: HeadersInit): void {
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

  private toSseBody(
    source: ReadableStream<Uint8Array> | AsyncIterable<string | Uint8Array>,
    retry?: number
  ): ReadableStream<Uint8Array> {
    const retryChunk =
      typeof retry === "number" && Number.isFinite(retry)
        ? new TextEncoder().encode(`retry: ${Math.max(0, Math.floor(retry))}\n\n`)
        : undefined;

    if (source instanceof ReadableStream) {
      if (!retryChunk) {
        return source;
      }
      const reader = source.getReader();
      return new ReadableStream<Uint8Array>({
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
          } catch (error) {
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

  private createSseStreamFromIterable(
    source: AsyncIterable<string | Uint8Array>,
    retryChunk?: Uint8Array
  ): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        if (retryChunk) {
          controller.enqueue(retryChunk);
        }

        try {
          for await (const chunk of source) {
            if (typeof chunk === "string") {
              controller.enqueue(encoder.encode(Context.toSseDataFrame(chunk)));
            } else {
              controller.enqueue(chunk);
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
  }

  private static toSseDataFrame(data: string): string {
    return data
      .split(/\r?\n/)
      .map((line) => `data: ${line}`)
      .join("\n")
      .concat("\n\n");
  }

  /** Serializes queued response cookies into Set-Cookie headers. */
  private addCookiesToHeaders(headers: Headers): void {
    for (const [name, { value, options }] of this.responseCookies) {
      let cookieString = `${name}=${encodeURIComponent(value)}`;
      
      if (options) {
        if (options.maxAge !== undefined) cookieString += `; Max-Age=${options.maxAge}`;
        if (options.expires) cookieString += `; Expires=${options.expires.toUTCString()}`;
        if (options.path) cookieString += `; Path=${options.path}`;
        if (options.domain) cookieString += `; Domain=${options.domain}`;
        if (options.secure) cookieString += "; Secure";
        if (options.httpOnly) cookieString += "; HttpOnly";
        if (options.sameSite) cookieString += `; SameSite=${options.sameSite}`;
      }
      
      headers.append("set-cookie", cookieString);
    }
  }
}
