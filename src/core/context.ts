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
  error(status: number, message: string): Error {
    const error = new Error(message);
    (error as any).status = status;
    return error;
  }

  /** Sets/overwrites a header to be included in helper-generated responses. */
  setHeader(name: string, value: string): void {
    this.responseHeaders.set(name, value);
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
